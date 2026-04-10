import { env } from "../config/env.js";

export class FxService {
  private static cache: { sbtcToNgn: number; sbtcToUsd: number; timestamp: number } | null = null;
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /** Fetches sBTC/NGN rate from CoinGecko (mocked if no API key) */
  static async getLatestRate(): Promise<{ sbtcToNgn: number; sbtcToUsd: number }> {
    // In a real app, this would use the CoinGecko API
    // GET /simple/price?ids=bitcoin&vs_currencies=ngn,usd
    
    // For now, returning realistic mock rates
    return {
      sbtcToNgn: 9240500,
      sbtcToUsd: 87430,
    };
  }

  /** Converts micro-sbtc to NGN for display */
  static async convertToNgn(microSbtc: bigint): Promise<string> {
    const { sbtcToNgn } = await this.getLatestRate();
    const sbtc = Number(microSbtc) / 100_000_000;
    return (sbtc * sbtcToNgn).toFixed(2);
  }
}
