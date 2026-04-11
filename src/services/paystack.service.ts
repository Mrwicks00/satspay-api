import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * PaystackService
 * Handles Nigerian NGN offramp payouts and bank verification via Paystack.
 * This operates as the fallback provider when Flutterwave is degraded.
 */
export class PaystackService {
  private static readonly BASE_URL = "https://api.paystack.co";

  /** Paystack HTTP client with exponential backoff retry */
  private static async pstFetch(endpoint: string, options: RequestInit, retries = 3): Promise<any> {
    const url = `${this.BASE_URL}${endpoint}`;
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            "Authorization": `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
          }
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`PST Error: ${errText}`);
          }
          throw new Error(`PST HTTP ${response.status}: ${errText}`);
        }

        return await response.json();
      } catch (error: any) {
        attempt++;
        logger.warn(`[Paystack] Fetch failed (Attempt ${attempt}/${retries}): ${error.message}`);
        if (error.message.startsWith("PST Error:") || attempt >= retries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
}
