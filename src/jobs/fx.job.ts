import cron from "node-cron";
import prisma from "../config/database.js";
import { FxService } from "../services/fx.service.js";

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
      console.error("[FX Job] Failed to update rates:", e);
    }
  });
};
