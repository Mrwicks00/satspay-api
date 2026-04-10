import { env } from "../config/env.js";

export class SmsService {
  /** Sends an SMS notification via Termii with exponential backoff */
  static async sendSms(phone: string, message: string, retries = 3): Promise<boolean> {
    if (env.NODE_ENV === "test") {
      console.log(`[TEST-SMS] To: ${phone} - ${message}`);
      return true;
    }

    const payload = {
      to: phone,
      from: env.TERMII_SENDER_ID || "SatsPay",
      sms: message,
      type: "plain",
      channel: "generic",
      api_key: env.TERMII_API_KEY
    };

    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await fetch("https://api.ng.termii.com/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
           const errText = await response.text();
           throw new Error(`Termii HTTP ${response.status}: ${errText}`);
        }
        
        return true;
      } catch (error: any) {
        attempt++;
        console.warn(`[SMS] Failed to send Termii SMS (Attempt ${attempt}/${retries}): ${error.message}`);
        
        if (attempt >= retries) return false;
        
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }
    return false;
  }

  /** Sends a claim link to a recipient */
  static async sendClaimLink(recipientPhone: string, amountMicroSbtc: bigint, claimToken: string) {
    const amountSbtc = (Number(amountMicroSbtc) / 100_000_000).toFixed(8);
    const claimUrl = `https://satspay.africa/claim/${claimToken}`;
    const message = `You've received ${amountSbtc} sBTC on SatsPay! Claim it here: ${claimUrl}`;
    
    return this.sendSms(recipientPhone, message);
  }
}
