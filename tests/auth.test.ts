import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "../src/services/auth.service.js";

// ── Mock Prisma ────────────────────────────────────────────────────────────────
vi.mock("../src/config/database.js", () => ({
  default: {
    otpRecord: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// ── Mock SMS ───────────────────────────────────────────────────────────────────
vi.mock("../src/services/sms.service.js", () => ({
  SmsService: { sendSms: vi.fn().mockResolvedValue(true) },
}));

// ── Mock env ───────────────────────────────────────────────────────────────────
vi.mock("../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-32-chars-minimum-ok!",
    NODE_ENV: "test",
    PORT: "4000",
    STACKS_API_URL: "https://api.hiro.so",
    STACKS_NETWORK: "mainnet",
    ESCROW_CONTRACT_ADDRESS: "SP1TEST",
    ESCROW_CONTRACT_NAME: "satspay-escrow",
    REGISTRY_CONTRACT_ADDRESS: "SP1TEST",
    REGISTRY_CONTRACT_NAME: "satspay-registry",
    SBTC_TOKEN_ADDRESS: "SP1TEST",
    SBTC_TOKEN_NAME: "sbtc-token",
    DATABASE_URL: "file:./dev.db",
  },
}));

import prisma from "../src/config/database.js";

// ─────────────────────────────────────────────────────────────────────────────

describe("AuthService.requestOtp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates and stores a hashed OTP", async () => {
    (prisma.otpRecord.count as any).mockResolvedValue(0);
    (prisma.otpRecord.create as any).mockResolvedValue({});

    const code = await AuthService.requestOtp("+2348012345678");

    expect(code).toMatch(/^\d{6}$/); // 6-digit string
    expect(prisma.otpRecord.create).toHaveBeenCalledOnce();

    const stored = (prisma.otpRecord.create as any).mock.calls[0][0].data;
    expect(stored.code).not.toBe(code); // hash != plaintext
    expect(stored.code).toHaveLength(64); // SHA-256 hex
  });

  it("throws RATE_LIMITED after 3 requests in 10 minutes", async () => {
    (prisma.otpRecord.count as any).mockResolvedValue(3);

    await expect(AuthService.requestOtp("+2348012345678")).rejects.toMatchObject({
      message: expect.stringContaining("Too many OTP requests"),
    });
    expect(prisma.otpRecord.create).not.toHaveBeenCalled();
  });
});

describe("AuthService.verifyOtp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a JWT and user on valid OTP", async () => {
    (prisma.otpRecord.findFirst as any).mockResolvedValue({
      id: "rec1",
      phone: "+2348012345678",
    });
    (prisma.otpRecord.update as any).mockResolvedValue({});
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user1",
      phone: "+2348012345678",
      stacksAddress: null,
    });

    const result = await AuthService.verifyOtp("+2348012345678", "123456");

    expect(result.token).toBeDefined();
    expect(result.user.id).toBe("user1");
    expect(prisma.otpRecord.update).toHaveBeenCalledOnce();
  });

  it("creates a new user if one doesn't exist", async () => {
    (prisma.otpRecord.findFirst as any).mockResolvedValue({ id: "rec2" });
    (prisma.otpRecord.update as any).mockResolvedValue({});
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({
      id: "new-user",
      phone: "+2348099887766",
      phoneHash: "abc123",
      stacksAddress: null,
    });

    const result = await AuthService.verifyOtp("+2348099887766", "654321");

    expect(prisma.user.create).toHaveBeenCalledOnce();
    expect(result.user.id).toBe("new-user");
  });

  it("throws INVALID_OTP when no matching record found", async () => {
    (prisma.otpRecord.findFirst as any).mockResolvedValue(null);
    (prisma.otpRecord.count as any).mockResolvedValue(0); // not locked out

    await expect(AuthService.verifyOtp("+2348012345678", "000000")).rejects.toMatchObject({
      message: expect.stringContaining("Invalid or expired OTP"),
    });
  });

  it("throws TOO_MANY_ATTEMPTS after 5 failed attempts", async () => {
    (prisma.otpRecord.findFirst as any).mockResolvedValue(null);
    (prisma.otpRecord.count as any).mockResolvedValue(5); // 5 failures

    await expect(AuthService.verifyOtp("+2348012345678", "000000")).rejects.toMatchObject({
      message: expect.stringContaining("Too many failed attempts"),
    });
  });
});
