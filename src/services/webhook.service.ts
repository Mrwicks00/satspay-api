import prisma from "../config/database.js";
import { SmsService } from "./sms.service.js";

export class WebhookService {
  /** Processes a Hiro onchain event notification */
  static async handleHiroWebhook(payload: any) {
    if (payload.event !== "print" || !payload.printValue) {
      return { success: true, message: "Ignored non-print event" };
    }

    const { type, claimId } = payload.printValue;

    if (!claimId) return { success: true, message: "No claimId found" };

    const cleanClaimId = claimId.replace("0x", "");

    const transfer = await prisma.transfer.findUnique({
      where: { claimId: cleanClaimId },
      include: { sender: true }
    });

    if (!transfer) return { success: true, message: "Transfer not found" };

    if (type === "transfer-initiated" && transfer.status === "PENDING") {
      await prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: "CONFIRMED", txid: payload.txid }
      });

      await SmsService.sendClaimLink(
        transfer.recipientPhone,
        transfer.amountMicroSbtc,
        transfer.claimToken
      );
    } 
    else if (type === "transfer-claimed" && ["PENDING", "CONFIRMED"].includes(transfer.status)) {
      await prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: "CLAIMED", claimTxid: payload.txid, claimedAt: new Date() }
      });
      // Future: Trigger smart contract registry registration if needed
    } 
    else if (type === "transfer-reclaimed" && transfer.status === "EXPIRED") {
      await prisma.transfer.update({
        where: { id: transfer.id },
        data: { status: "RECLAIMED", reclaimedAt: new Date() }
      });

      const message = `[SatsPay] Your expired transfer of ${transfer.amountMicroSbtc} sats has been returned to your wallet.`;
      await SmsService.sendSms(transfer.sender.phone, message).catch(() => {});
    }

    return { success: true };
  }
}
