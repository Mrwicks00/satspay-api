import { Router, Request, Response } from "express";
import { adminMiddleware } from "../middleware/auth.middleware.js";
import prisma from "../config/database.js";
import { logger } from "../utils/logger.js";
import { OfframpService } from "../services/offramp.service.js";
import { PaystackService } from "../services/paystack.service.js";

const router = Router();

// Apply admin boundaries strictly over this entire router
router.use(adminMiddleware);

/**
 * @route   GET /api/v1/admin/stats
 * @desc    Fetch global telemetry metrics for the admin dashboard
 * @access  Private (Admin only)
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const totalTransfers = await prisma.transfer.count();
    const statusCounts = await prisma.transfer.groupBy({
      by: ["status"],
      _count: { status: true }
    });

    const aggregateVolume = await prisma.transfer.aggregate({
      _sum: { amountMicroSbtc: true }
    });

    res.json({
      success: true,
      data: {
        totalVolumeMicroSbtc: aggregateVolume._sum.amountMicroSbtc?.toString() || "0",
        totalTransfers,
        breakdown: statusCounts.map((g: any) => ({
          status: g.status,
          count: g._count.status
        }))
      }
    });
  } catch (error: any) {
    logger.error("[Admin] Failed to aggregate telemetry", { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
