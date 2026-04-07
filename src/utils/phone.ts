import crypto from "node:crypto";

/** Normalizes phone numbers to E.164 without the '+' for hashing where needed */
export function normalizePhone(phone: string): string {
  // Simple E.164-ish normalization: remove everything except digits and '+'
  let p = phone.replace(/[^\d+]/g, "");
  if (!p.startsWith("+")) {
     // Default to Nigeria if no + prefix and 10-11 digits
     if (p.length === 10) p = "+234" + p;
     if (p.length === 11 && p.startsWith("0")) p = "+234" + p.slice(1);
  }
  return p;
}

/** Hashes a normalized phone number for onchain matching */
export function hashPhone(normalizedPhone: string): string {
  return crypto.createHash("sha256").update(normalizedPhone).digest("hex");
}
