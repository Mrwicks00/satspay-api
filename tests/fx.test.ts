import { describe, it, expect, vi, beforeEach } from "vitest";
import { FxService } from "../src/services/fx.service.js";

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: "4000",
    STACKS_API_URL: "https://api.hiro.so",
    STACKS_NETWORK: "mainnet",
    ESCROW_CONTRACT_ADDRESS: "SP1",
    ESCROW_CONTRACT_NAME: "satspay-escrow",
    REGISTRY_CONTRACT_ADDRESS: "SP1",
    REGISTRY_CONTRACT_NAME: "satspay-registry",
    SBTC_TOKEN_ADDRESS: "SP1",
    SBTC_TOKEN_NAME: "sbtc-token",
    DATABASE_URL: "file:./dev.db",
    JWT_SECRET: "test-secret",
  },
}));

describe("FxService.getLatestRate", () => {
  it("returns sbtcToNgn and sbtcToUsd", async () => {
    const rate = await FxService.getLatestRate();
    expect(rate).toHaveProperty("sbtcToNgn");
    expect(rate).toHaveProperty("sbtcToUsd");
    expect(typeof rate.sbtcToNgn).toBe("number");
    expect(typeof rate.sbtcToUsd).toBe("number");
    expect(rate.sbtcToNgn).toBeGreaterThan(0);
  });
});

describe("FxService.convertToNgn", () => {
  it("converts 100_000 micro-sBTC to NGN string", async () => {
    const ngn = await FxService.convertToNgn(BigInt(100_000));
    // 0.001 sBTC × 9_240_500 = 9240.50
    expect(parseFloat(ngn)).toBeCloseTo(9240.5, 0);
  });

  it("converts 0 micro-sBTC to 0.00 NGN", async () => {
    const ngn = await FxService.convertToNgn(BigInt(0));
    expect(ngn).toBe("0.00");
  });

  it("handles 1 full sBTC (100_000_000 micro-sBTC)", async () => {
    const ngn = await FxService.convertToNgn(BigInt(100_000_000));
    expect(parseFloat(ngn)).toBeGreaterThan(1_000_000); // 1 sBTC should be millions of NGN
  });
});
