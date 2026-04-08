import cron from "node-cron";
import prisma from "../config/database.js";
import { FxService } from "../services/fx.service.js";
import { logger } from "../utils/logger.js";

export const startFxJob = () => {
  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const rates = await FxService.getLatestRate();
      await prisma.fxRateCache.create({
        data: {
          sbtcToNgn: rates.sbtcToNgn,
          sbtcToUsd: rates.sbtcToUsd,
        }
      });
    } catch (e) {
      logger.error("[FX Job] Failed to update rates", { error: e });
    }
  });
};
