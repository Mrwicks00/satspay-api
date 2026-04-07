import prisma from "../config/database.js";
import { env } from "../config/env.js";

export class OfframpService {
  /** Initiates an NGN payout for a recipient (mocked) */
  static async requestPayout(transferId: string, bankCode: string, accountNumber: string) {
    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { offrampPayout: true }
    });

    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "CLAIMED") throw new Error("Only claimed transfers can be offramped");
    if (transfer.offrampPayout) throw new Error("Payout already initiated");

    // In production, this would call Flutterwave/Paystack API
    // 1. Resolve Account Name
    // 2. Initiate Transfer
    
    const payout = await prisma.offrampPayout.create({
      data: {
        transferId,
        provider: "FLUTTERWAVE",
        bankCode,
        accountNumber,
        accountName: "Recipient Name", // placeholder
        amountNgn: transfer.amountNgn || 0,
        status: "PROCESSING",
        providerRef: `flw_ref_${Date.now()}`
      }
    });

    return payout;
  }

  /** Returns supported banks */
  static async getBanks() {
    return [
      { code: "044", name: "Access Bank" },
      { code: "057", name: "Zenith Bank" },
      { code: "058", name: "GTBank" },
      { code: "033", name: "UBA" },
      { code: "999999", name: "Opay" },
      { code: "50515", name: "Moniepoint" }
    ];
  }

  /** Verifies a bank account number */
  static async verifyAccount(bankCode: string, accountNumber: string, provider: string) {
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
}
