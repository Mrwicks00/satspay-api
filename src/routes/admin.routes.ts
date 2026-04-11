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

/**
 * @route   GET /api/v1/admin/stranded
 * @desc    Fetch OfframpPayouts stuck in PROCESSING for over 1 hour
 * @access  Private (Admin only)
 */
router.get("/stranded", async (_req: Request, res: Response) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stranded = await prisma.offrampPayout.findMany({
      where: {
        status: "PROCESSING",
        createdAt: { lt: oneHourAgo }
      },
      orderBy: { createdAt: "asc" }
    });

    res.json({ success: true, data: stranded });
  } catch (error: any) {
    logger.error("[Admin] Failed to fetch stranded payouts", { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @route   POST /api/v1/admin/payouts/:id/force-retry
 * @desc    Force resolve a PROCESSING payout
 * @access  Private (Admin only)
 */
router.post("/payouts/:id/force-retry", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const payout = await prisma.offrampPayout.findUnique({
      where: { id }
    });

    if (!payout) return res.status(404).json({ error: "Payout not found" });
    if (payout.status !== "PROCESSING") {
      return res.status(400).json({ error: `Payout is already ${payout.status}` });
    }

    const remoteStatus = payout.provider === "PAYSTACK" 
      ? await PaystackService.getPayoutStatus(payout.providerRef)
      : await OfframpService.getPayoutStatus(payout.providerRef);

    if (remoteStatus !== "PROCESSING") {
      await prisma.offrampPayout.update({
        where: { id },
        data: { status: remoteStatus }
      });
      return res.json({ success: true, message: `Payout forcefully resolved to ${remoteStatus}` });
    }

    res.json({ success: true, message: "Payout is still legitimately processing upstream" });
  } catch (error: any) {
    logger.error("[Admin] Force-retry failed", { id: req.params.id, error: error.message });
    res.status(500).json({ error: "Force-retry operation failed" });
  }
});

export default router;
