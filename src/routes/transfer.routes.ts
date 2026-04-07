import { Router, Response } from "express";
import { TransferService } from "../services/transfer.service.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";

const router = Router();

/**
 * @route   POST /api/v1/transfers/send
 * @desc    Initiate a transfer (escrow or direct)
 * @access  Private
 */
router.post("/send", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { recipientPhone, amountMicroSbtc } = req.body;
  const senderId = req.user?.userId;

  if (!senderId || !recipientPhone || !amountMicroSbtc) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await TransferService.prepareSend(
      senderId,
      recipientPhone,
      BigInt(amountMicroSbtc)
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
