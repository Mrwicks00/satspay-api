import cron from "node-cron";
import prisma from "../config/database.js";
import { logger } from "../utils/logger.js";
import { OfframpService } from "../services/offramp.service.js";
import { PaystackService } from "../services/paystack.service.js";

/**
 * Sweeps Processing OFFRAMP payouts older than 2 hours.
 * Fetches status explicitly bypassing webhook uncertainties.
 */
export const startReconciliationJob = () => {
  cron.schedule("0 * * * *", async () => {
    logger.info("[Cron] Running background payout reconciliation...");
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const strandedPayouts = await prisma.offrampPayout.findMany({
        where: {
          status: "PROCESSING",
          createdAt: { lt: twoHoursAgo }
        }
      });

      if (strandedPayouts.length === 0) {
        return;
      }
      
      logger.info(`[Cron] Found ${strandedPayouts.length} stranded payouts. Starting ping sweep.`);

      let resolvedCounter = 0;
      for (const payout of strandedPayouts) {
        try {
          const remoteStatus = payout.provider === "PAYSTACK" 
            ? await PaystackService.getPayoutStatus(payout.providerRef)
            : await OfframpService.getPayoutStatus(payout.providerRef);

          if (remoteStatus !== "PROCESSING") {
            await prisma.offrampPayout.update({
              where: { id: payout.id },
              data: { status: remoteStatus }
            });
            resolvedCounter++;
            logger.info(`[Cron] Reconciled payout ${payout.id} -> ${remoteStatus}`);
          }
        } catch (innerError: any) {
          logger.warn(`[Cron] Failed to reconcile payout ${payout.id}: ${innerError.message}`);
        }
      }

      if (resolvedCounter > 0) {
        logger.info(`[Cron] Sweep complete. Reconciled ${resolvedCounter} payouts.`);
      }
    } catch (error: any) {
      logger.error("[Cron] Reconciliation sweep failed", { error: error.message });
    }
  });
};
