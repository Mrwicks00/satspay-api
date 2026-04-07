import { Router, Response } from "express";
import { BusinessService } from "../services/business.service.js";
import { PayrollService } from "../services/payroll.service.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * @route   POST /api/v1/business/register
 * @desc    Register a business profile
 * @access  Private
 */
router.post("/register", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { businessName, rcNumber } = req.body;
  const userId = req.user?.userId;

  if (!userId || !businessName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await BusinessService.registerBusiness(userId, businessName, rcNumber);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/v1/business/payroll
 * @desc    Process a payroll batch
 * @access  Private
 */
router.post("/payroll", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { label, items } = req.body;
  const userId = req.user?.userId;

  if (!userId || !label || !items) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const business = await BusinessService.getProfile(userId);
    if (!business) return res.status(404).json({ error: "Business profile not found" });

    const result = await PayrollService.createPayroll(business.id, label, items);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
