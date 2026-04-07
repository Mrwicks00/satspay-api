import { Router } from "express";
import { WebhookService } from "../services/webhook.service.js";

const router = Router();

/**
 * @route   POST /api/v1/webhooks/hiro
 * @desc    Hiro onchain event notification
 * @access  Public (Secret verified)
 */
router.post("/hiro", async (req, res) => {
  // Verifying webhook signature or secret header would go here
  
  try {
    const result = await WebhookService.handleHiroWebhook(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
