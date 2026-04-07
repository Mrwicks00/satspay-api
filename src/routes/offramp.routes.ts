import { Router, Response } from "express";
import { OfframpService } from "../services/offramp.service.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/banks", async (req: AuthRequest, res: Response) => {
  try {
    const banks = await OfframpService.getBanks();
    res.json({ banks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify-account", async (req: AuthRequest, res: Response) => {
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
router.post("/payout", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { transferId, bankCode, accountNumber } = req.body;
  const userId = req.user?.userId;

  if (!userId || !transferId || !bankCode || !accountNumber) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await OfframpService.requestPayout(transferId, bankCode, accountNumber);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
