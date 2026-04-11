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
    // Future logic...
  });
};
