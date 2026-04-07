import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import prisma from "../config/database.js";
import { normalizePhone, hashPhone } from "../utils/phone.js";

export class AuthService {
  /** Generates a 6-digit OTP and saves it to the database */
  static async requestOtp(phone: string): Promise<string> {
    const normalized = normalizePhone(phone);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.otpRecord.create({
      data: {
        phone: normalized,
        code,
        expiresAt,
      },
    });

    // In production, this would trigger the SMS service
    return code;
  }

  /** Verifies the OTP and returns a JWT + user info */
  static async verifyOtp(phone: string, code: string) {
    const normalized = normalizePhone(phone);
    
    const record = await prisma.otpRecord.findFirst({
      where: {
        phone: normalized,
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      throw new Error("Invalid or expired OTP");
    }

    await prisma.otpRecord.update({
      where: { id: record.id },
      data: { used: true },
    });

    let user = await prisma.user.findUnique({
      where: { phone: normalized },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: normalized,
          phoneHash: hashPhone(normalized),
        },
      });
    }

    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return { token, user };
  }
}
