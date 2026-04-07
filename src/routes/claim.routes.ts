import { Router } from "express";
import { ClaimService } from "../services/claim.service.js";

const router = Router();

router.get("/:claimToken", async (req, res) => {
  try {
    const result = await ClaimService.getClaimDetails(req.params.claimToken as string);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:claimToken/claim-to-wallet", async (req, res) => {
  const { recipientAddress } = req.body;
  if (!recipientAddress) return res.status(400).json({ error: "Missing recipientAddress" });

  try {
    const result = await ClaimService.claimToWallet(req.params.claimToken as string, recipientAddress);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/:claimToken/confirm-claim", async (req, res) => {
  const { txid, recipientAddress } = req.body;
  if (!txid || !recipientAddress) return res.status(400).json({ error: "Missing payload" });

  try {
    const result = await ClaimService.confirmClaim(req.params.claimToken as string, txid, recipientAddress);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/:claimToken/claim-to-bank", async (req, res) => {
  const { bankCode, accountNumber, provider } = req.body;
  if (!bankCode || !accountNumber || !provider) return res.status(400).json({ error: "Missing payload" });
  
  try {
    const result = await ClaimService.claimToBank(req.params.claimToken as string, bankCode, accountNumber, provider);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
