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

/**
 * @route   POST /api/v1/transfers/:transferId/confirm
 * @desc    Confirm a sent transfer transaction in pending state
 * @access  Private
 */
router.post("/:transferId/confirm", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { txid } = req.body;
  if (!txid) return res.status(400).json({ error: "Missing txid" });

  try {
    const result = await TransferService.confirmTransfer(req.params.transferId as string, txid);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/v1/transfers
 * @desc    Get user's transfer history
 * @access  Private
 */
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await TransferService.getTransfers(userId, req.query);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/v1/transfers/:transferId
 * @desc    Get a specific transfer's details
 * @access  Private
 */
router.get("/:transferId", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const transfer = await TransferService.getTransferById(req.params.transferId as string, userId);
    res.json({ transfer });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

export default router;
