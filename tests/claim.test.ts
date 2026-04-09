import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaimService } from "../src/services/claim.service.js";

vi.mock("../src/config/database.js", () => ({
  default: {
    transfer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret",
    NODE_ENV: "test",
    PORT: "4000",
    STACKS_API_URL: "https://api.hiro.so",
    STACKS_NETWORK: "mainnet",
    ESCROW_CONTRACT_ADDRESS: "SP1GNDB8SXJ51GBMSVVXMWGTPRFHGSMWNNBEY25A4",
    ESCROW_CONTRACT_NAME: "satspay-escrow",
    REGISTRY_CONTRACT_ADDRESS: "SP1GNDB8SXJ51GBMSVVXMWGTPRFHGSMWNNBEY25A4",
    REGISTRY_CONTRACT_NAME: "satspay-registry",
    SBTC_TOKEN_ADDRESS: "SP1GNDB8SXJ51GBMSVVXMWGTPRFHGSMWNNBEY25A4",
    SBTC_TOKEN_NAME: "sbtc-token",
    DATABASE_URL: "file:./dev.db",
  },
}));

vi.mock("../src/config/stacks.js", () => ({
  network: {},
  CONTRACTS: {
    escrow: { address: "SP1ESCROW", name: "satspay-escrow" },
    registry: { address: "SP1REG", name: "satspay-registry" },
    sbtcToken: { address: "SP1SBTC", name: "sbtc-token" },
  },
}));

vi.mock("@stacks/transactions", () => ({
  Cl: { bufferFromHex: vi.fn().mockReturnValue("0x"), principal: vi.fn().mockReturnValue("ST123") },
}));

import prisma from "../src/config/database.js";

const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
const PAST   = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

const VALID_TRANSFER = {
  id: "tx-001",
  claimId: "deadbeef".repeat(8),
  claimToken: "token-abc",
  status: "CONFIRMED",
  recipientPhone: "+2348099887766",
  amountMicroSbtc: BigInt(100_000),
  amountNgn: "9.24",
  expiresAt: FUTURE,
  claimedAt: null,
  reclaimedAt: null,
};

describe("ClaimService.getClaimDetails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns valid=true for a CONFIRMED unexpired transfer", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue(VALID_TRANSFER);
    const res = await ClaimService.getClaimDetails("token-abc");
    expect(res.valid).toBe(true);
  });

  it("returns NOT_FOUND for unknown token", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue(null);
    const res = await ClaimService.getClaimDetails("bad-token");
    expect(res.valid).toBe(false);
    expect((res as any).reason).toBe("NOT_FOUND");
  });

  it("returns ALREADY_CLAIMED for claimed transfer", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue({ ...VALID_TRANSFER, status: "CLAIMED" });
    const res = await ClaimService.getClaimDetails("token-abc");
    expect(res.valid).toBe(false);
    expect((res as any).reason).toBe("ALREADY_CLAIMED");
  });

  it("returns EXPIRED when expiresAt is in the past", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue({ ...VALID_TRANSFER, expiresAt: PAST });
    const res = await ClaimService.getClaimDetails("token-abc");
    expect(res.valid).toBe(false);
    expect((res as any).reason).toBe("EXPIRED");
  });
});

describe("ClaimService.claimToWallet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns unsigned tx for CONFIRMED transfer", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue(VALID_TRANSFER);
    const result = await ClaimService.claimToWallet("token-abc", "ST2RECIPIENT");
    expect(result.success).toBe(true);
    expect(result.unsignedTx.functionName).toBe("claim");
    expect(result.unsignedTx.contractName).toBe("satspay-escrow");
  });

  it("throws for non-CONFIRMED transfer", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue({ ...VALID_TRANSFER, status: "CLAIMED" });
    await expect(ClaimService.claimToWallet("token-abc", "ST2RECIPIENT"))
      .rejects.toThrow("Invalid or unclaimable transfer");
  });
});

describe("ClaimService.confirmClaim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores claimTxid and returns CLAIMED status", async () => {
    (prisma.transfer.update as any).mockResolvedValue({ ...VALID_TRANSFER, status: "CLAIMED", claimTxid: "0xdef" });
    const result = await ClaimService.confirmClaim("token-abc", "0xdef", "ST2RECIPIENT");
    expect(result.success).toBe(true);
    expect(result.status).toBe("CLAIMED");
    expect(prisma.transfer.update).toHaveBeenCalledWith({
      where: { claimToken: "token-abc" },
      data: { claimTxid: "0xdef" },
    });
  });
});
