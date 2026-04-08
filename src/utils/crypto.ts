import crypto from "node:crypto";

/**
 * SHA-256 hash any given string (used for OTP hashing, etc.)
 */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Generates a cryptographically secure random UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generates a cryptographically secure random hex string of the given byte length
 */
export function randomHex(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Generates a 6-digit numeric OTP (as a string, zero-padded)
 */
export function generateOtp(): string {
  // Use crypto-secure random int in range [0, 999999]
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, "0");
}
