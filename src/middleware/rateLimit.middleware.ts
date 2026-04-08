import { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter.
 * For production, swap the store with Redis (e.g. rate-limiter-flexible).
 *
 * Usage: rateLimiter({ windowMs: 60_000, max: 10 })
 */

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number;      // Max requests per window
  keyFn?: (req: Request) => string; // Custom key function (default: IP)
  message?: string;
}

const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(opts: RateLimitOptions) {
  const { windowMs, max, message = "Too many requests, please try again later.", keyFn } = opts;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn ? keyFn(req) : (req.ip ?? "unknown");
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count++;
    if (entry.count > max) {
      res.status(429).json({ error: message, code: "RATE_LIMITED" });
      return;
    }

    next();
  };
}

/** Per-phone OTP rate limiter (used on /auth/request-otp) */
export const otpRateLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3,
  keyFn: (req) => `otp:${req.body?.phone ?? req.ip}`,
  message: "Too many OTP requests. Try again in 10 minutes.",
});

/** General API rate limiter per IP */
export const apiRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: "Rate limit exceeded. Slow down.",
});
