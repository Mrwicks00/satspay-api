import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const HIRO_BASE = env.STACKS_API_URL; // e.g. https://api.hiro.so

/**
 * Lightweight Hiro API wrapper for read-only operations.
 * All calls are retried once on network failure.
 * In production consider adding a circuit-breaker.
 */
export class StacksService {
  private static async fetch<T>(path: string): Promise<T> {
    const url = `${HIRO_BASE}${path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Hiro API ${res.status}: ${res.statusText} — ${url}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      logger.error("[StacksService] Fetch failed, retrying once…", { url, error: err });
      // Single retry
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Hiro API ${res.status} (retry): ${res.statusText}`);
      return res.json() as Promise<T>;
    }
  }

  /** Returns the current Stacks blockchain tip block height */
  static async getCurrentBlockHeight(): Promise<number> {
    const data = await this.fetch<{ stacks_tip_height: number }>("/v2/info");
    return data.stacks_tip_height;
  }

  /** Returns the status of a Stacks transaction by txid */
  static async getTransactionStatus(txid: string): Promise<{
    tx_status: "pending" | "success" | "abort_by_response" | "abort_by_post_condition";
    block_height?: number;
  }> {
    return this.fetch(`/extended/v1/tx/${txid}`);
  }

  /** Polls a transaction until confirmed or failed (max `maxAttempts` × `intervalMs`) */
  static async waitForConfirmation(
    txid: string,
    maxAttempts = 30,
    intervalMs = 10_000
  ): Promise<"success" | "failed"> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const { tx_status } = await this.getTransactionStatus(txid);
        if (tx_status === "success") return "success";
        if (tx_status.startsWith("abort")) return "failed";
      } catch (e) {
        logger.warn("[StacksService] Poll error, will retry", { txid, attempt: i + 1, error: e });
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    logger.warn("[StacksService] Timed out waiting for tx", { txid, maxAttempts });
    return "failed";
  }

  /**
   * Estimates the wall-clock expiry date from a block expiry height.
   * Stacks blocks average ~10 minutes each.
   */
  static async estimateExpiryDate(expiryBlock: number): Promise<Date> {
    const currentHeight = await this.getCurrentBlockHeight();
    const blocksRemaining = Math.max(0, expiryBlock - currentHeight);
    const msRemaining = blocksRemaining * 10 * 60 * 1000; // 10 min per block
    return new Date(Date.now() + msRemaining);
  }
}
