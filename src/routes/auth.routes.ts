import { Router } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth.service.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { otpRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

// Zod schemas
const requestOtpSchema = z.object({
  phone: z.string().min(10, "Invalid phone number"),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10, "Invalid phone number"),
  code: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be numeric"),
});

const connectWalletSchema = z.object({
  stacksAddress: z.string().min(1, "Stacks address required"),
  signature: z.string().min(1, "Signature required"),
  message: z.string().min(1, "Message required"),
});

/**
 * @route   POST /api/v1/auth/request-otp
 * @desc    Request a 6-digit OTP via SMS
 * @access  Public
 */
router.post("/request-otp", otpRateLimiter, validate(requestOtpSchema), async (req, res) => {
  const { phone } = req.body;
  try {
    const code = await AuthService.requestOtp(phone);
    res.json({ success: true, message: "OTP sent", expiresIn: 300, ...(process.env.NODE_ENV !== "production" && { code }) });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP and return JWT
 * @access  Public
 */
router.post("/verify-otp", validate(verifyOtpSchema), async (req, res) => {
  const { phone, code } = req.body;
  try {
    const result = await AuthService.verifyOtp(phone, code);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(error.status || 400).json({ error: error.message, code: error.code });
  }
});

/**
 * @route   POST /api/v1/auth/connect-wallet
 * @desc    Link an authenticated user's account to their Stacks wallet
 * @access  Private
 */
router.post("/connect-wallet", authMiddleware, validate(connectWalletSchema), async (req: AuthRequest, res) => {
  const { stacksAddress, signature, message } = req.body;
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await AuthService.connectWallet(userId, stacksAddress, signature, message);
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
