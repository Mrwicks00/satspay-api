import { env } from "../config/env.js";

export class FxService {
  private static cache: { sbtcToNgn: number; sbtcToUsd: number; timestamp: number } | null = null;
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /** Fetches sBTC/NGN rate from CoinGecko */
  static async getLatestRate(): Promise<{ sbtcToNgn: number; sbtcToUsd: number }> {
    if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_TTL_MS) {
      return { sbtcToNgn: this.cache.sbtcToNgn, sbtcToUsd: this.cache.sbtcToUsd };
    }

    if (env.NODE_ENV === "test") {
      return { sbtcToNgn: 9240500, sbtcToUsd: 87430 };
    }

    let attempt = 0;
    while (attempt < 3) {
      try {
        const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ngn,usd", {
          headers: env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": env.COINGECKO_API_KEY } : {}
        });

        if (!response.ok) {
          throw new Error(`CoinGecko HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // Coingecko returns: { bitcoin: { ngn: 100000000, usd: 90000 } }
        // We map 1 BTC = 1 sBTC for simplicity since SatsPay assumes peg parity
        
        const rate = Object.values(data)[0] as any;
        if (!rate || !rate.ngn || !rate.usd) {
          throw new Error("Invalid CoinGecko response payload");
        }

        this.cache = {
          sbtcToNgn: rate.ngn,
          sbtcToUsd: rate.usd,
          timestamp: Date.now()
        };

        return { sbtcToNgn: rate.ngn, sbtcToUsd: rate.usd };
      } catch (error: any) {
        attempt++;
        console.warn(`[FX] Failed to fetch rates (Attempt ${attempt}/3): ${error.message}`);
        
        if (attempt >= 3) {
           // Fallback to last known cache if available, else static hardcode safe floor
           if (this.cache) return { sbtcToNgn: this.cache.sbtcToNgn, sbtcToUsd: this.cache.sbtcToUsd };
           return { sbtcToNgn: 9240500, sbtcToUsd: 87430 };
        }
        
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, delay));
      }
    }
    
    return { sbtcToNgn: 9240500, sbtcToUsd: 87430 };
  }

  /** Converts micro-sbtc to NGN for display */
  static async convertToNgn(microSbtc: bigint): Promise<string> {
    const { sbtcToNgn } = await this.getLatestRate();
    const sbtc = Number(microSbtc) / 100_000_000;
    return (sbtc * sbtcToNgn).toFixed(2);
  }
}
