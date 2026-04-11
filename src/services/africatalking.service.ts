import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * AfricaTalkingService
 * Provides SMS dispatching via Africa's Talking API.
 * Used as the secondary SMS provider when Termii fails.
 */
export class AfricaTalkingService {
  private static readonly BASE_URL = "https://api.africastalking.com/version1/messaging";

  /** Sends SMS via Africa's Talking with exponential backoff */
  static async sendSms(phone: string, message: string, retries = 3): Promise<boolean> {
    if (env.NODE_ENV === "test") {
      logger.info(`[TEST-AT-SMS] To: ${phone} - ${message}`);
      return true;
    }

    const body = new URLSearchParams({
      username: env.AT_USERNAME || "sandbox",
      to: phone,
      message,
      from: "SatsPay"
    });

    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await fetch(this.BASE_URL, {
          method: "POST",
          headers: {
            "apiKey": env.AT_API_KEY || "",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: body.toString()
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`AT HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const recipients = data.SMSMessageData?.Recipients || [];
        const success = recipients.some((r: any) => r.status === "Success");

        if (!success) throw new Error("AT SMS delivery rejected by network");
        return true;
      } catch (error: any) {
        attempt++;
        logger.warn(`[AT-SMS] Failed (Attempt ${attempt}/${retries}): ${error.message}`);
        if (attempt >= retries) return false;
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }
    return false;
  }
}
