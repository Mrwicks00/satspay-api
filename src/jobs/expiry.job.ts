import cron from "node-cron";
import prisma from "../config/database.js";
import { SmsService } from "../services/sms.service.js";
import { logger } from "../utils/logger.js";

export const startExpiryJob = () => {
  // Run every hour
  cron.schedule("0 * * * *", async () => {
    logger.info("[Expiry Job] Checking for expired transfers...");

    try {
      const now = new Date();

      // 1. Find CONFIRMED transfers that have passed their expiresAt
      const expiredTransfers = await prisma.transfer.findMany({
        where: {
          status: "CONFIRMED",
          expiresAt: { lt: now },
        },
        include: { sender: true },
      });

      if (expiredTransfers.length === 0) {
        logger.info("[Expiry Job] No expired transfers found.");
        return;
      }

      logger.info(`[Expiry Job] Found ${expiredTransfers.length} expired transfer(s). Updating...`);

      for (const transfer of expiredTransfers) {
        // 2. Mark transfer as EXPIRED
        await prisma.transfer.update({
          where: { id: transfer.id },
          data: { status: "EXPIRED" },
        });

        // 3. Alert the sender via SMS
        const amountSbtc = (Number(transfer.amountMicroSbtc) / 100_000_000).toFixed(8);
        const message =
          `[SatsPay] Your transfer of ${amountSbtc} sBTC to ${transfer.recipientPhone} ` +
          `has expired unclaimed. You can now reclaim it from the SatsPay app.`;

        await SmsService.sendSms(transfer.sender.phone, message).catch((err) => {
          logger.error("[Expiry Job] Failed to send expiry SMS", { transferId: transfer.id, error: err });
        });

        logger.info("[Expiry Job] Marked as EXPIRED and alerted sender", {
          transferId: transfer.id,
          recipientPhone: transfer.recipientPhone,
        });
      }
    } catch (e) {
      logger.error("[Expiry Job] Unexpected error", { error: e });
    }
  });

  logger.info("[Expiry Job] Scheduled (every hour)");
};
