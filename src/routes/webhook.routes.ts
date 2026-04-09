import { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookService } from "../services/webhook.service.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * Verifies the Hiro webhook signature (HMAC-SHA256).
 * Header: X-Hiro-Signature: sha256=<hex>
 * In dev (no HIRO_WEBHOOK_SECRET), verification is skipped with a warning.
 */
function verifyHiroSignature(req: Request): boolean {
  const secret = process.env.HIRO_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("[Webhook] HIRO_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }

  const sigHeader = req.headers["x-hiro-signature"] as string | undefined;
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;

  const receivedSig = sigHeader.slice(7); // strip "sha256="
  const body = JSON.stringify(req.body);
  const expectedSig = createHmac("sha256", secret).update(body).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(receivedSig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false; // buffer length mismatch = forged/invalid
  }
}

/**
 * @route   POST /api/v1/webhooks/hiro
 * @desc    Hiro onchain event notification
 * @access  Public (Signature verified via HMAC-SHA256)
 */
router.post("/hiro", (req: Request, res: Response) => {
  if (!verifyHiroSignature(req)) {
    logger.warn("[Webhook] Invalid signature rejected", { ip: req.ip });
    res.status(401).json({ error: "Invalid webhook signature", code: "INVALID_SIGNATURE" });
    return;
  }

  WebhookService.handleHiroWebhook(req.body)
    .then((result) => res.json(result))
    .catch((error: any) => {
      logger.error("[Webhook] Handler error", { error: error.message });
      res.status(500).json({ error: error.message });
    });
});

export default router;
