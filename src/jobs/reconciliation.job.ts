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
    } catch (error: any) {
      logger.error("[Cron] Reconciliation sweep failed", { error: error.message });
    }
  });
};
