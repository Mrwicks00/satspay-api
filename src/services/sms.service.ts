import { env } from "../config/env.js";

export class SmsService {
  /** Sends an SMS notification via Termii (mocked for now) */
  static async sendSms(phone: string, message: string): Promise<boolean> {
    console.log(`[SMS] Sending to ${phone}: ${message}`);
    
    // In production, this would use the Termii or Africa's Talking API
    // POST https://api.ng.termii.com/api/sms/send
    
    return true;
  }

  /** Sends a claim link to a recipient */
  static async sendClaimLink(recipientPhone: string, amountMicroSbtc: bigint, claimToken: string) {
    const amountSbtc = (Number(amountMicroSbtc) / 100_000_000).toFixed(8);
    const claimUrl = `https://satspay.africa/claim/${claimToken}`;
    const message = `You've received ${amountSbtc} sBTC on SatsPay! Claim it here: ${claimUrl}`;
    
    return this.sendSms(recipientPhone, message);
  }
}
