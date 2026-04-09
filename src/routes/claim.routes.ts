import { Router } from "express";
import { z } from "zod";
import { ClaimService } from "../services/claim.service.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

// Zod schemas
const claimToWalletSchema = z.object({
  recipientAddress: z.string().min(1, "Stacks address required"),
});

const confirmClaimSchema = z.object({
  txid: z.string().min(1, "txid required"),
  recipientAddress: z.string().min(1, "Stacks address required"),
});

const claimToBankSchema = z.object({
  bankCode: z.string().min(1, "Bank code required"),
  accountNumber: z.string().min(10, "Account number must be at least 10 digits"),
  provider: z.enum(["flutterwave", "paystack"]),
});

router.get("/:claimToken", async (req, res) => {
  try {
    const result = await ClaimService.getClaimDetails(req.params.claimToken as string);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:claimToken/claim-to-wallet", validate(claimToWalletSchema), async (req, res) => {
  const { recipientAddress } = req.body;

  try {
    const result = await ClaimService.claimToWallet(req.params.claimToken as string, recipientAddress);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/:claimToken/confirm-claim", validate(confirmClaimSchema), async (req, res) => {
  const { txid, recipientAddress } = req.body;

  try {
    const result = await ClaimService.confirmClaim(req.params.claimToken as string, txid, recipientAddress);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/:claimToken/claim-to-bank", validate(claimToBankSchema), async (req, res) => {
  const { bankCode, accountNumber, provider } = req.body;
  
  try {
    const result = await ClaimService.claimToBank(req.params.claimToken as string, bankCode, accountNumber, provider);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
