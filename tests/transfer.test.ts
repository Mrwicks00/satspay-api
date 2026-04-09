import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransferService } from "../src/services/transfer.service.js";

// ── Mock Prisma ────────────────────────────────────────────────────────────────
vi.mock("../src/config/database.js", () => ({
  default: {
    transfer: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// ── Mock env ───────────────────────────────────────────────────────────────────
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

// ── Mock Stacks registry (no registered address = escrow flow) ─────────────────
vi.mock("../src/services/stacks.service.js", () => ({
  StacksService: {
    getCurrentBlockHeight: vi.fn().mockResolvedValue(100000),
    estimateExpiryDate: vi.fn().mockResolvedValue(new Date("2026-06-01")),
  },
}));

vi.mock("../src/services/fx.service.js", () => ({
  FxService: {
    getLatestRate: vi.fn().mockResolvedValue({ sbtcToNgn: 9240500, sbtcToUsd: 87430 }),
  },
}));

// Registry lookup returns null by default (unregistered recipient)
vi.mock("@stacks/transactions", () => ({
  Cl: { bufferFromHex: vi.fn(), uint: vi.fn(), none: vi.fn(), principal: vi.fn(), contractPrincipal: vi.fn() },
  fetchCallReadOnlyFunction: vi.fn().mockRejectedValue(new Error("network mock")),
  cvToString: vi.fn().mockReturnValue("none"),
  createNetwork: vi.fn(),
}));

vi.mock("../src/config/stacks.js", () => ({
  network: {},
  CONTRACTS: {
    escrow: { address: "SP1ESCROW", name: "satspay-escrow" },
    registry: { address: "SP1REG", name: "satspay-registry" },
    sbtcToken: { address: "SP1SBTC", name: "sbtc-token" },
  },
}));

import prisma from "../src/config/database.js";

// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TRANSFER = {
  id: "transfer-001",
  claimId: "abc123",
  claimToken: "uuid-token",
  senderId: "sender-001",
  recipientPhone: "+2348099887766",
  recipientPhoneHash: "hashxyz",
  amountMicroSbtc: BigInt(100000),
  amountNgn: "9.24",
  fxRateAtSend: 9240500,
  status: "PENDING",
  expiryBlock: 104320,
  expiresAt: new Date("2026-06-01"),
  claimedAt: null,
  reclaimedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  txid: null,
  claimTxid: null,
  recipientId: null,
  payrollId: null,
};

describe("TransferService.prepareSend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns escrow unsigned tx for unregistered recipient", async () => {
    (prisma.transfer.create as any).mockResolvedValue(MOCK_TRANSFER);

    const result = await TransferService.prepareSend(
      "sender-001",
      "+2348099887766",
      BigInt(100000)
    );

    expect(result.sendType).toBe("escrow");
    expect(result.unsignedTx.functionName).toBe("send-to-phone");
    expect(result.transferId).toBe("transfer-001");
    // claimToken is a real UUID generated at runtime — just check the shape
    expect(result.claimToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("TransferService.confirmTransfer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates txid and returns pending status", async () => {
    (prisma.transfer.update as any).mockResolvedValue({ ...MOCK_TRANSFER, txid: "0xabc" });

    const result = await TransferService.confirmTransfer("transfer-001", "0xabc");

    expect(result.success).toBe(true);
    expect(result.status).toBe("PENDING");
    expect(prisma.transfer.update).toHaveBeenCalledWith({
      where: { id: "transfer-001" },
      data: { status: "PENDING", txid: "0xabc" }
    });
  });
});

describe("TransferService.getTransfers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated transfers for a user", async () => {
    (prisma.transfer.findMany as any).mockResolvedValue([MOCK_TRANSFER]);
    (prisma.transfer.count as any).mockResolvedValue(1);

    const result = await TransferService.getTransfers("sender-001", { direction: "sent" });

    expect(result.transfers).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(typeof result.transfers[0].amountMicroSbtc).toBe("string"); // BigInt serialized
  });
});

describe("TransferService.getTransferById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns transfer when user is the sender", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue(MOCK_TRANSFER);

    const result = await TransferService.getTransferById("transfer-001", "sender-001");
    expect(result.id).toBe("transfer-001");
  });

  it("throws when user is neither sender nor recipient", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue(MOCK_TRANSFER);

    await expect(
      TransferService.getTransferById("transfer-001", "unknown-user")
    ).rejects.toThrow("Transfer not found or unauthorized");
  });

  it("throws when transfer doesn't exist", async () => {
    (prisma.transfer.findUnique as any).mockResolvedValue(null);

    await expect(
      TransferService.getTransferById("transfer-001", "sender-001")
    ).rejects.toThrow("Transfer not found or unauthorized");
  });
});
