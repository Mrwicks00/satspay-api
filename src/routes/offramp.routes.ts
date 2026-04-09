import { Router, Response } from "express";
import { z } from "zod";
import { OfframpService } from "../services/offramp.service.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

const verifyAccountSchema = z.object({
  bankCode: z.string().min(1, "Bank code required"),
  accountNumber: z.string().min(10, "Account number must be at least 10 digits"),
  provider: z.enum(["flutterwave", "paystack"]),
});

const payoutSchema = z.object({
  transferId: z.string().min(1, "transferId required"),
  bankCode: z.string().min(1, "Bank code required"),
  accountNumber: z.string().min(10, "Account number must be at least 10 digits"),
});

router.get("/banks", async (req: AuthRequest, res: Response) => {
  try {
    const banks = await OfframpService.getBanks();
    res.json({ banks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify-account", validate(verifyAccountSchema), async (req: AuthRequest, res: Response) => {
  const { bankCode, accountNumber, provider } = req.body;
  if (!bankCode || !accountNumber || !provider) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await OfframpService.verifyAccount(bankCode, accountNumber, provider);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @route   POST /api/v1/offramp/payout
 * @desc    Initiate an NGN payout for a recipient
 * @access  Private
 */
router.post("/payout", authMiddleware, validate(payoutSchema), async (req: AuthRequest, res: Response) => {
  const { transferId, bankCode, accountNumber } = req.body;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await OfframpService.requestPayout(transferId, bankCode, accountNumber);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
