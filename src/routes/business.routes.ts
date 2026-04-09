import { Router, Response } from "express";
import { z } from "zod";
import { BusinessService } from "../services/business.service.js";
import { PayrollService } from "../services/payroll.service.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

// Zod schemas
const registerSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  rcNumber: z.string().optional(),
});

const payrollItemSchema = z.object({
  phone: z.string().min(10, "Invalid phone number"),
  amountMicroSbtc: z.number().int().positive("Amount must be positive"),
  name: z.string().optional(),
});

const payrollSchema = z.object({
  label: z.string().min(1, "Label is required"),
  recipients: z.array(payrollItemSchema).min(1, "At least one recipient required"),
});

/**
 * @route   POST /api/v1/business/register
 * @desc    Register a business profile
 * @access  Private
 */
router.post("/register", authMiddleware, validate(registerSchema), async (req: AuthRequest, res: Response) => {
  const { businessName, rcNumber } = req.body;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await BusinessService.registerBusiness(userId, businessName, rcNumber);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/v1/business/profile
 * @desc    Get authenticated user's business profile
 * @access  Private
 */
router.get("/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const business = await BusinessService.getProfile(userId);
    if (!business) return res.status(404).json({ error: "Business profile not found" });
    res.json(business);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/v1/business/payroll
 * @desc    Process a payroll batch
 * @access  Private
 */
router.post("/payroll", authMiddleware, validate(payrollSchema), async (req: AuthRequest, res: Response) => {
  const { label, recipients } = req.body;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const business = await BusinessService.getProfile(userId);
    if (!business) return res.status(404).json({ error: "Business profile not found" });

    // Map recipients to the format PayrollService expects
    const items = recipients.map((r: any) => ({
      phone: r.phone,
      amount: BigInt(r.amountMicroSbtc),
    }));

    const result = await PayrollService.createPayroll(business.id, label, items);
    res.json({ success: true, payroll: result });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
