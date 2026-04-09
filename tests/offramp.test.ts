import { describe, it, expect, vi, beforeEach } from "vitest";
import { OfframpService } from "../src/services/offramp.service.js";

vi.mock("../src/config/database.js", () => ({
  default: {
    transfer: {
      findUnique: vi.fn(),
    },
    offrampPayout: {
      create: vi.fn(),
    },
  },
}));

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

import prisma from "../src/config/database.js";

describe("OfframpService.getBanks", () => {
  it("returns a non-empty list of banks with code and name", async () => {
    const banks = await OfframpService.getBanks();
    expect(banks.length).toBeGreaterThan(0);
    expect(banks[0]).toHaveProperty("code");
    expect(banks[0]).toHaveProperty("name");
  });

  it("includes Zenith Bank", async () => {
    const banks = await OfframpService.getBanks();
    expect(banks.some((b) => b.name === "Zenith Bank")).toBe(true);
  });
});

describe("OfframpService.verifyAccount", () => {
  it("returns valid=true for a recognized bank and valid account number", async () => {
    const result = await OfframpService.verifyAccount("057", "3012345678", "flutterwave");
    expect(result.valid).toBe(true);
    expect(result.accountName).toBeDefined();
    expect(result.bankName).toBe("Zenith Bank");
  });

  it("throws for an account number shorter than 10 digits", async () => {
    await expect(
      OfframpService.verifyAccount("057", "12345", "flutterwave")
    ).rejects.toThrow("Invalid account number");
  });

  it("throws for an unsupported bank code", async () => {
    await expect(
      OfframpService.verifyAccount("999", "3012345678", "flutterwave")
    ).rejects.toThrow("Bank not supported");
  });
});

describe("OfframpService.requestPayout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a payout record for a CLAIMED transfer", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue({
      id: "tx-001",
      status: "CLAIMED",
      amountNgn: "9240.50",
      offrampPayout: null,
    });
    (prisma.offrampPayout.create as any).mockResolvedValue({
      id: "payout-001",
      status: "PROCESSING",
    });

    const result = await OfframpService.requestPayout("tx-001", "057", "3012345678");
    expect(result.status).toBe("PROCESSING");
    expect(prisma.offrampPayout.create).toHaveBeenCalledOnce();
  });

  it("throws if transfer is not in CLAIMED status", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue({
      id: "tx-002",
      status: "CONFIRMED",
      offrampPayout: null,
    });

    await expect(
      OfframpService.requestPayout("tx-002", "057", "3012345678")
    ).rejects.toThrow("Only claimed transfers can be offramped");
  });

  it("throws if payout already exists", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue({
      id: "tx-003",
      status: "CLAIMED",
      offrampPayout: { id: "existing-payout" },
    });

    await expect(
      OfframpService.requestPayout("tx-003", "057", "3012345678")
    ).rejects.toThrow("Payout already initiated");
  });

  it("throws if transfer not found", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue(null);
    await expect(
      OfframpService.requestPayout("ghost-id", "057", "3012345678")
    ).rejects.toThrow("Transfer not found");
  });
});
