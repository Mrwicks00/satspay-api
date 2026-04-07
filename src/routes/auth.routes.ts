import { Router } from "express";
import { AuthService } from "../services/auth.service.js";

const router = Router();

/**
 * @route   POST /api/v1/auth/request-otp
 * @desc    Request a 6-digit OTP via SMS
 * @access  Public
 */
router.post("/request-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  try {
    const code = await AuthService.requestOtp(phone);
    // In development, we return the code for testing
    res.json({ success: true, message: "OTP sent", code });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP and return JWT
 * @access  Public
 */
router.post("/verify-otp", async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: "Phone and code required" });

  try {
    const result = await AuthService.verifyOtp(phone, code);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
