import { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookService } from "../services/webhook.service.js";
import { logger } from "../utils/logger.js";

/**
 * Verifies Paystack webhook signature.
 * Paystack signs with HMAC-SHA512 using the secret key.
 * Header: x-paystack-signature: <hex>
 */
function verifyPaystackSignature(req: Request): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    logger.warn("[Webhook] PAYSTACK_SECRET_KEY not set — skipping signature verification");
    return true;
  }
  const sigHeader = req.headers["x-paystack-signature"] as string | undefined;
  if (!sigHeader) return false;

  const body = JSON.stringify(req.body);
  const expectedSig = createHmac("sha512", secret).update(body).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(sigHeader, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}

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
/**
 * Verifies Flutterwave webhook signature via `verif-hash` header.
 */
function verifyFlwSignature(req: Request): boolean {
  const secret = process.env.FLW_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("[Webhook] FLW_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  const hash = req.headers["verif-hash"];
  return hash === secret;
}

/**
 * @route   POST /api/v1/webhooks/flutterwave
 * @desc    Flutterwave payout webhook
 * @access  Public (Signature verified)
 */
router.post("/flutterwave", (req: Request, res: Response) => {
  if (!verifyFlwSignature(req)) {
    logger.warn("[Webhook] Invalid Flutterwave signature", { ip: req.ip });
    res.status(401).json({ error: "Invalid signatures" });
    return;
  }

  // Flutterwave expects a fast 200 OK
  res.status(200).send("OK");

  // Process asynchronously
  WebhookService.handleFlutterwaveWebhook(req.body).catch((error: any) => {
    logger.error("[Webhook] Flutterwave handler error", { error: error.message });
  });
});

export default router;
