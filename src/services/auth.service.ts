import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import prisma from "../config/database.js";
import { normalizePhone, hashPhone } from "../utils/phone.js";
import { SmsService } from "./sms.service.js";

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

    await SmsService.sendSms(normalized, `Your SatsPay OTP is ${code}. Expires in 5 minutes.`);
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

  /** Links a Stacks wallet address to the authenticated user's account */
  static async connectWallet(userId: string, stacksAddress: string, signature: string, message: string) {
    // Basic validation
    if (!stacksAddress || !signature || !message) {
      throw new Error("Missing required connect-wallet payload");
    }

    // MOCK: Verify the signature against the message and address
    // In production: import { verifyMessageSignatureRsv } from "@stacks/transactions"
    // verifyMessageSignatureRsv({ message, signature, publicKey: ... })
    const isValidSignature = true; 
    
    if (!isValidSignature) {
      throw new Error("Invalid wallet signature");
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { stacksAddress },
    });

    return updatedUser;
  }
}
