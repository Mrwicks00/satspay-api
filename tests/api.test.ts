import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock env
vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: "4000",
    JWT_SECRET: "test-secret-that-needs-to-be-32-chars",
    STACKS_API_URL: "https://api.hiro.so",
    STACKS_NETWORK: "mainnet",
    DATABASE_URL: "file:./dev.db",
    ESCROW_CONTRACT_ADDRESS: "SP1",
    ESCROW_CONTRACT_NAME: "satspay-escrow",
    REGISTRY_CONTRACT_ADDRESS: "SP1",
    REGISTRY_CONTRACT_NAME: "satspay-registry",
    SBTC_TOKEN_ADDRESS: "SP1",
    SBTC_TOKEN_NAME: "sbtc-token",
  },
}));

vi.mock("../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Setup app to test
import app from "../src/index.js";
import prisma from "../src/config/database.js";
import { SmsService } from "../src/services/sms.service.js";

vi.mock("../src/config/database.js", () => ({
  default: {
    otpRecord: { create: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../src/services/sms.service.js", () => ({
  SmsService: { sendSms: vi.fn() },
}));

describe("API Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("returns 200 OK with env status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "ok");
      expect(res.body).toHaveProperty("env", "test");
    });
  });

  describe("404 Handler", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await request(app).get("/api/v1/unknown-route-123");
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Route GET /api/v1/unknown-route-123 not found");
      expect(res.body).toHaveProperty("code", "NOT_FOUND");
    });
  });

  describe("POST /api/v1/auth/request-otp", () => {
    it("returns 400 for invalid phone number", async () => {
      const res = await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ phone: "123" });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "phone" })
        ])
      );
    });

    it("returns 200 and sends OTP on success", async () => {
      (prisma.otpRecord.count as any).mockResolvedValue(0);
      (prisma.otpRecord.create as any).mockResolvedValue({ id: "rec1" });
      (SmsService.sendSms as any).mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ phone: "+2348012345678" });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("message", "OTP sent");
    });
  });
});
