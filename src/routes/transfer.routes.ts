import { Router, Response } from "express";
import { z } from "zod";
import { TransferService } from "../services/transfer.service.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

// Zod schemas
const sendSchema = z.object({
  recipientPhone: z.string().min(10, "Invalid recipient phone"),
  amountMicroSbtc: z.number().int().positive("Amount must be a positive integer"),
  note: z.string().max(200).optional(),
});

const confirmSchema = z.object({
  txid: z.string().min(1, "txid required"),
});

/**
 * @route   POST /api/v1/transfers/send
 * @desc    Initiate a transfer (escrow or direct)
 * @access  Private
 */
router.post("/send", authMiddleware, validate(sendSchema), async (req: AuthRequest, res: Response) => {
  const { recipientPhone, amountMicroSbtc } = req.body;
  const senderId = req.user?.userId;

  if (!senderId) return res.status(401).json({ error: "Unauthorized" });

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
router.post("/:transferId/confirm", authMiddleware, validate(confirmSchema), async (req: AuthRequest, res: Response) => {
  const { txid } = req.body;

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
