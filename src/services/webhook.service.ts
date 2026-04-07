import prisma from "../config/database.js";
import { SmsService } from "./sms.service.js";

export class WebhookService {
  /** Processes a Hiro onchain event notification */
  static async handleHiroWebhook(payload: any) {
    const { event, tx_id, contract_id } = payload;

    // Logic for handling transfer confirmations
    if (event === "transaction_confirmed") {
        // Look up the transfer by txid
        const transfer = await prisma.transfer.findFirst({
            where: { txid: tx_id }
        });

        if (transfer && transfer.status === "PENDING") {
            // Update status and send SMS
            await prisma.transfer.update({
                where: { id: transfer.id },
                data: { status: "CONFIRMED" }
            });

            await SmsService.sendClaimLink(
                transfer.recipientPhone,
                transfer.amountMicroSbtc,
                transfer.claimToken
            );
        }
    }
    
    return { success: true };
  }
}
