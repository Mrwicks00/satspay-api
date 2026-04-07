import prisma from "../config/database.js";
import { CONTRACTS } from "../config/stacks.js";
import { Cl } from "@stacks/transactions";

export class ClaimService {
  static async getClaimDetails(claimToken: string) {
    const transfer = await prisma.transfer.findUnique({
      where: { claimToken }
    });
    
    if (!transfer) return { valid: false, reason: "NOT_FOUND" };
    if (transfer.status === "CLAIMED") return { valid: false, reason: "ALREADY_CLAIMED", claimedAt: transfer.claimedAt };
    if (transfer.status === "RECLAIMED") return { valid: false, reason: "RECLAIMED", claimedAt: transfer.reclaimedAt };
    if (transfer.expiresAt < new Date()) return { valid: false, reason: "EXPIRED" };

    return {
      valid: true,
      transfer: {
        claimToken: transfer.claimToken,
        senderPhone: transfer.recipientPhone.substring(0, 5) + "****" + transfer.recipientPhone.substring(transfer.recipientPhone.length - 2), 
        amountMicroSbtc: Number(transfer.amountMicroSbtc),
        amountSbtc: (Number(transfer.amountMicroSbtc) / 100_000_000).toFixed(8),
        amountNgn: transfer.amountNgn?.toString(),
        status: transfer.status,
        expiresAt: transfer.expiresAt,
        isExpired: false
      }
    };
  }

  static async claimToWallet(claimToken: string, recipientAddress: string) {
    const transfer = await prisma.transfer.findUnique({
      where: { claimToken }
    });

    if (!transfer || transfer.status !== "CONFIRMED") {
      throw new Error("Invalid or unclaimable transfer");
    }

    return {
      success: true,
      unsignedTx: {
        contractAddress: CONTRACTS.escrow.address,
        contractName: CONTRACTS.escrow.name,
        functionName: "claim",
        functionArgs: [
          Cl.bufferFromHex(transfer.claimId),
          Cl.principal(recipientAddress)
        ]
      }
    };
  }

  static async confirmClaim(claimToken: string, txid: string, recipientAddress: string) {
    // In production we wait for webhook. Here we mark pending claim
    const transfer = await prisma.transfer.update({
      where: { claimToken },
      data: { claimTxid: txid }
    });

    return {
      success: true,
      status: "CLAIMED",
      message: "Your sBTC is on its way. Confirmation in ~10 minutes."
    };
  }

  static async claimToBank(claimToken: string, bankCode: string, accountNumber: string, provider: any) {
    // Phase 5 offramp placeholder
    return {
      success: true,
      accountName: "MOCK ACCOUNT NAME",
      amountNgn: "MOCKED",
      estimatedArrival: new Date(),
      payoutId: "mock_payout_id"
    };
  }
}
