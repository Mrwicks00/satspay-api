import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    JWT_SECRET: "test-secret"
  }
}));

vi.mock("../src/config/database.js", () => ({
  default: {}
}));

import app from "../src/index.js";
import { BusinessService } from "../src/services/business.service.js";
import { PayrollService } from "../src/services/payroll.service.js";
import jwt from "jsonwebtoken";

vi.mock("../src/services/business.service.js", () => ({
  BusinessService: {
    getProfile: vi.fn(),
    registerBusiness: vi.fn(),
  }
}));

vi.mock("../src/services/payroll.service.js", () => ({
  PayrollService: {
    createPayroll: vi.fn()
  }
}));

describe("Business Routes", () => {
  const token = jwt.sign({ userId: "user-123", phone: "+2348012345678" }, "test-secret");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/business/payroll/upload-csv", () => {
    it("returns 400 if no file uploaded", async () => {
      const res = await request(app)
        .post("/api/v1/business/payroll/upload-csv")
        .set("Authorization", `Bearer ${token}`);
        
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No CSV file uploaded");
    });

    it("parses CSV correctly and returns preview of amounts", async () => {
      (BusinessService.getProfile as any).mockResolvedValue({ id: "biz-123" });

      const csvContent = "phone,amount_sbtc,name\n+2348012345678,0.005,Emeka\n+2348023456789,invalid,Ngozi\n";
      
      const res = await request(app)
        .post("/api/v1/business/payroll/upload-csv")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from(csvContent), "payroll.csv");

      expect(res.status).toBe(200);
      expect(res.body.preview).toHaveLength(1);
      expect(res.body.preview[0].amountMicroSbtc).toBe("500000");
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toBe("Invalid amount_sbtc");
      expect(res.body.totalAmountMicroSbtc).toBe("500000");
    });
  });
});
