import prisma from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { PaystackService } from "./paystack.service.js";

export class OfframpService {
  /** Flutterwave HTTP utility with exponential backoff */
  private static async flwFetch(endpoint: string, options: RequestInit, retries = 3): Promise<any> {
    const url = `https://api.flutterwave.com/v3${endpoint}`;
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            "Authorization": `Bearer ${env.FLW_SECRET_KEY}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
          }
        });

        if (!response.ok) {
          const errText = await response.text();
          // Do not retry 4xx errors
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`FLW Error: ${errText}`);
          }
          throw new Error(`FLW HTTP ${response.status}: ${errText}`);
        }
        
        return await response.json();
      } catch (error: any) {
        attempt++;
        if (error.message.includes("FLW Error:") || attempt >= retries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  /** Initiates an NGN payout for a recipient using Flutterwave /transfers */
  static async requestPayout(transferId: string, bankCode: string, accountNumber: string) {
    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { offrampPayout: true }
    });

    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "CLAIMED") throw new Error("Only claimed transfers can be offramped");
    if (transfer.offrampPayout) throw new Error("Payout already initiated");

    if (env.NODE_ENV === "test") {
      return await prisma.offrampPayout.create({
        data: {
          transferId,
          provider: "FLUTTERWAVE",
          bankCode,
          accountNumber,
          accountName: "Recipient Name",
          amountNgn: transfer.amountNgn || 0,
          status: "PROCESSING",
          providerRef: `flw_ref_${Date.now()}`
        }
      });
    }

    try {
      // 1. Primary: Flutterwave
      const accountInfo = await this.verifyAccount(bankCode, accountNumber, "flutterwave");
      const providerRef = `SPY-FW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const payload = {
        account_bank: bankCode,
        account_number: accountNumber,
        amount: Number(transfer.amountNgn),
        narration: `SatsPay Payout ${transfer.id.slice(-6)}`,
        currency: "NGN",
        reference: providerRef,
        callback_url: "https://satspay.africa/api/v1/webhooks/flutterwave"
      };

      const data = await this.flwFetch("/transfers", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (data.status === "success" && data.data) {
        return await prisma.offrampPayout.create({
          data: {
            transferId,
            provider: "FLUTTERWAVE",
            bankCode,
            accountNumber,
            accountName: accountInfo.accountName,
            amountNgn: transfer.amountNgn || 0,
            status: "PROCESSING",
            providerRef: data.data.id?.toString() || providerRef
          }
        });
      }
      throw new Error(data.message || "Transfer initiation failed");
    } catch (flwError: any) {
      // 2. Fallback: Paystack
      logger.warn("[Offramp] FLW payout failed — falling back to Paystack", { error: flwError.message });
      try {
        const pstAccountInfo = await PaystackService.verifyAccount(bankCode, accountNumber);
        const pstRef = `SPY-PST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await PaystackService.requestPayout({
          accountNumber,
          bankCode,
          accountName: pstAccountInfo.accountName,
          amountKobo: Number(transfer.amountNgn) * 100, // Convert NGN -> Kobo
          reference: pstRef,
          narration: `SatsPay Payout ${transfer.id.slice(-6)}`
        });

        return await prisma.offrampPayout.create({
          data: {
            transferId,
            provider: "PAYSTACK",
            bankCode,
            accountNumber,
            accountName: pstAccountInfo.accountName,
            amountNgn: transfer.amountNgn || 0,
            status: "PROCESSING",
            providerRef: pstRef
          }
        });
      } catch (pstError: any) {
        logger.error("[Offramp] Paystack fallback also failed", { error: pstError.message });
        throw new Error("All payout providers exhausted. Please try again later.");
      }
    }
  }

  /** Returns supported banks natively from Flutterwave */
  static async getBanks() {
    if (env.NODE_ENV === "test") {
      return [
        { code: "044", name: "Access Bank" },
        { code: "057", name: "Zenith Bank" }
      ];
    }

    try {
      const data = await this.flwFetch("/banks/NG", { method: "GET" });
      if (data.status === "success" && data.data) {
        return data.data.map((b: any) => ({
          code: b.code,
          name: b.name
        }));
      }
      return [];
    } catch (error) {
      console.error("[Offramp] Failed to fetch FLW banks:", error);
      throw error;
    }
  }

  /** Verifies a bank account number via Flutterwave */
  static async verifyAccount(bankCode: string, accountNumber: string, provider: string) {
    if (env.NODE_ENV === "test") {
       if (accountNumber.length < 10) throw new Error("Invalid account number");
       const banks = await this.getBanks();
       const bank = banks.find(b => b.code === bankCode);
       if (!bank) throw new Error("Bank not supported");

       return {
         valid: true,
         accountName: "MOCK ACCOUNT HOLDER",
         bankCode,
         bankName: bank.name
       };
    }

    try {
      const payload = { account_number: accountNumber, account_bank: bankCode };
      const data = await this.flwFetch("/accounts/resolve", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      
      if (data.status === "success" && data.data) {
        return {
           valid: true,
           accountName: data.data.account_name,
           bankCode,
           bankName: "N/A" // FW resolve API doesn't return the bank name directly
        };
      }
      throw new Error("Invalid account details");
    } catch (error: any) {
      console.error("[Offramp] Failed to verify bank account:", error.message);
      throw new Error(error.message.replace("FLW Error: ", "") || "Bank account verification failed");
    }
  }
}
