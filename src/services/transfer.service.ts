import crypto from "node:crypto";
import { 
  Cl, 
  fetchCallReadOnlyFunction, 
  cvToString 
} from "@stacks/transactions";
import { network, CONTRACTS } from "../config/stacks.js";
import prisma from "../config/database.js";
import { normalizePhone, hashPhone } from "../utils/phone.js";
import { generateUUID, randomHex } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";
import { FxService } from "./fx.service.js";
import { StacksService } from "./stacks.service.js";

export class TransferService {
  /** Checks the on-chain registry specifically for a phone hash */
  static async getRegistryInfo(phoneHash: string) {
    try {
      const res = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACTS.registry.address,
        contractName: CONTRACTS.registry.name,
        functionName: "get-address-for-phone",
        functionArgs: [Cl.bufferFromHex(phoneHash)],
        network,
        senderAddress: CONTRACTS.registry.address, // any address
      });

      // (some { active: bool, owner: principal, registered-at: uint })
      const cvStr = cvToString(res);
      if (cvStr === "none") return null;

      // Extract details if needed, or just return the owner principal
      // For simplicity, we assume if it's there, it's the target
      // A more robust parser would be better here
      const match = cvStr.match(/owner ([A-Z0-9]+)/);
      return match ? match[1] : null;
    } catch (e) {
      logger.error("Registry lookup failed", { error: e });
      return null;
    }
  }

  /** Initiates a transfer record and returns the unsigned transaction parameters */
  static async prepareSend(senderId: string, recipientPhone: string, amountMicroSbtc: bigint) {
    const normalized = normalizePhone(recipientPhone);
    const recipientHash = hashPhone(normalized);
    
    // 1. Check registry
    const registeredAddress = await this.getRegistryInfo(recipientHash);
    
    // 2. Fetch FX rate and compute NGN equivalent at this moment
    let fxRateAtSend: number | null = null;
    let amountNgn: string | null = null;
    try {
      const rates = await FxService.getLatestRate();
      fxRateAtSend = rates.sbtcToNgn;
      const sbtc = Number(amountMicroSbtc) / 100_000_000;
      amountNgn = (sbtc * fxRateAtSend).toFixed(2);
    } catch (e) {
      logger.warn("[TransferService] FX fetch failed, storing without NGN amount", { error: e });
    }

    // 3. Get current block height for expiry calculation (144 blocks ≈ 1 day, 4320 ≈ 30 days)
    const EXPIRY_BLOCKS = 4320; // ~30 days
    let expiryBlock = 0;
    let expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    try {
      const currentHeight = await StacksService.getCurrentBlockHeight();
      expiryBlock = currentHeight + EXPIRY_BLOCKS;
      expiresAt = await StacksService.estimateExpiryDate(expiryBlock);
    } catch (e) {
      logger.warn("[TransferService] Block height fetch failed, using 30-day wall clock fallback", { error: e });
    }

    // 4. Create transfer record in DB
    const claimToken = generateUUID();
    const claimId = randomHex(32);

    const transfer = await prisma.transfer.create({
      data: {
        claimId,
        claimToken,
        senderId,
        recipientPhone: normalized,
        recipientPhoneHash: recipientHash,
        amountMicroSbtc,
        amountNgn: amountNgn ?? undefined,
        fxRateAtSend: fxRateAtSend ?? undefined,
        status: "PENDING",
        expiryBlock,
        expiresAt,
      },
    });

    if (registeredAddress) {
      // Direct send flow (sBTC transfer)
      return {
        success: true,
        transferId: transfer.id,
        sendType: "direct",
        recipientAddress: registeredAddress,
        unsignedTx: {
          contractAddress: CONTRACTS.sbtcToken.address,
          contractName: CONTRACTS.sbtcToken.name,
          functionName: "transfer",
          functionArgs: [
             Cl.uint(amountMicroSbtc),
             Cl.principal(registeredAddress),
             Cl.none()
          ]
        }
      };
    } else {
      // Escrow flow
      return {
        success: true,
        transferId: transfer.id,
        claimToken,
        sendType: "escrow",
        unsignedTx: {
          contractAddress: CONTRACTS.escrow.address,
          contractName: CONTRACTS.escrow.name,
          functionName: "send-to-phone",
          functionArgs: [
            Cl.bufferFromHex(recipientHash),
            Cl.uint(amountMicroSbtc),
            Cl.bufferFromHex(claimId),
            Cl.uint(144), // MIN_EXPIRY_BLOCKS
            Cl.contractPrincipal(CONTRACTS.sbtcToken.address, CONTRACTS.sbtcToken.name)
          ]
        }
      };
    }
  }

  static async confirmTransfer(transferId: string, txid: string) {
    await prisma.transfer.update({
      where: { id: transferId },
      data: { status: "PENDING", txid }
    });
    return {
      success: true,
      status: "PENDING",
      estimatedConfirmationMinutes: 10
    };
  }

  static async getTransfers(userId: string, filters: any) {
    const { page = 1, limit = 20, direction = "all", status } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (direction === "sent") {
      where.senderId = userId;
    } else if (direction === "received") {
      where.recipientId = userId;
    } else {
      where.OR = [{ senderId: userId }, { recipientId: userId }];
    }

    if (status) Object.assign(where, { status });

    const transfers = await prisma.transfer.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" }
    });

    const total = await prisma.transfer.count({ where });

    return {
      transfers: transfers.map(t => ({ ...t, amountMicroSbtc: t.amountMicroSbtc.toString() })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    };
  }

  static async getTransferById(transferId: string, userId: string) {
    const transfer = await prisma.transfer.findUnique({ where: { id: transferId }});
    if (!transfer || (transfer.senderId !== userId && transfer.recipientId !== userId)) {
      throw new Error("Transfer not found or unauthorized");
    }
    return {
      ...transfer,
      amountMicroSbtc: transfer.amountMicroSbtc.toString()
    };
  }
}
