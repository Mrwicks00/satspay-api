import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * PaystackService
 * Handles Nigerian NGN offramp payouts and bank verification via Paystack.
 * This operates as the fallback provider when Flutterwave is degraded.
 */
export class PaystackService {
  private static readonly BASE_URL = "https://api.paystack.co";

  /** Paystack HTTP client with exponential backoff retry */
  private static async pstFetch(endpoint: string, options: RequestInit, retries = 3): Promise<any> {
    const url = `${this.BASE_URL}${endpoint}`;
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            "Authorization": `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
          }
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`PST Error: ${errText}`);
          }
          throw new Error(`PST HTTP ${response.status}: ${errText}`);
        }

        return await response.json();
      } catch (error: any) {
        attempt++;
        logger.warn(`[Paystack] Fetch failed (Attempt ${attempt}/${retries}): ${error.message}`);
        if (error.message.startsWith("PST Error:") || attempt >= retries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  /** Fetches Nigerian banks via Paystack */
  static async getBanks(): Promise<{ code: string; name: string }[]> {
    if (env.NODE_ENV === "test") {
      return [
        { code: "058", name: "GTBank" },
        { code: "057", name: "Zenith Bank" }
      ];
    }

    try {
      const data = await this.pstFetch("/bank?country=nigeria&perPage=100", { method: "GET" });
      if (data.status && data.data) {
        return data.data.map((b: any) => ({ code: b.code, name: b.name }));
      }
      return [];
    } catch (error: any) {
      logger.error("[Paystack] Failed to fetch banks", { error: error.message });
      throw new Error("Failed to retrieve banks from Paystack");
    }
  }

  /** Verifies a bank account number via Paystack */
  static async verifyAccount(bankCode: string, accountNumber: string) {
    if (env.NODE_ENV === "test") {
      if (accountNumber.length < 10) throw new Error("Invalid account number");
      const banks = await this.getBanks();
      const bank = banks.find(b => b.code === bankCode);
      if (!bank) throw new Error("Bank not supported");
      return { valid: true, accountName: "MOCK PST HOLDER", bankCode, bankName: bank.name };
    }

    try {
      const data = await this.pstFetch(
        `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { method: "GET" }
      );
      if (data.status && data.data) {
        return {
          valid: true,
          accountName: data.data.account_name,
          bankCode,
          bankName: data.data.bank_name || "N/A"
        };
      }
      throw new Error("Account resolution failed");
    } catch (error: any) {
      logger.error("[Paystack] verifyAccount failed", { error: error.message });
      throw new Error(error.message.replace("PST Error: ", "") || "Account verification failed");
    }
  }

  /** Initiates an NGN payout through Paystack Transfer API */
  static async requestPayout(opts: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
    amountKobo: number; // Paystack uses kobo (1 NGN = 100 kobo)
    reference: string;
    narration: string;
  }) {
    if (env.NODE_ENV === "test") {
      return { id: "pst-test-transfer-123", status: "pending", reference: opts.reference };
    }

    try {
      // Step 1: Create a transfer recipient
      const recipientData = await this.pstFetch("/transferrecipient", {
        method: "POST",
        body: JSON.stringify({
          type: "nuban",
          name: opts.accountName,
          account_number: opts.accountNumber,
          bank_code: opts.bankCode,
          currency: "NGN"
        })
      });

      if (!recipientData.status || !recipientData.data?.recipient_code) {
        throw new Error("Failed to create transfer recipient");
      }

      // Step 2: Initiate the transfer
      const transferData = await this.pstFetch("/transfer", {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          reason: opts.narration,
          amount: opts.amountKobo,
          recipient: recipientData.data.recipient_code,
          reference: opts.reference
        })
      });

      return {
        id: transferData.data?.id?.toString(),
        status: transferData.data?.status,
        reference: transferData.data?.reference
      };
    } catch (error: any) {
      logger.error("[Paystack] requestPayout failed", { error: error.message });
      throw new Error(error.message.replace("PST Error: ", "") || "Payout request failed");
    }
  }

  /** Queries Paystack for exact status of a stranded payout using reference */
  static async getPayoutStatus(providerRef: string): Promise<"PROCESSING" | "COMPLETED" | "FAILED"> {
    if (env.NODE_ENV === "test") return "COMPLETED";

    try {
      const data = await this.pstFetch(`/transfer/verify/${providerRef}`, { method: "GET" });
      if (!data.status || !data.data) return "PROCESSING";

      const pstStatus = data.data.status?.toUpperCase();
      if (pstStatus === "SUCCESS" || pstStatus === "SUCCESSFUL") return "COMPLETED";
      if (pstStatus === "FAILED" || pstStatus === "REVERSED") return "FAILED";

      return "PROCESSING";
    } catch {
      return "PROCESSING";
    }
  }
}
