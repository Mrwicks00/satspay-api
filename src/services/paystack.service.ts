import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * PaystackService
 * Handles Nigerian NGN offramp payouts and bank verification via Paystack.
 * This operates as the fallback provider when Flutterwave is degraded.
 */
export class PaystackService {
  private static readonly BASE_URL = "https://api.paystack.co";
}
