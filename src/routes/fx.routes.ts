import { Router } from "express";
import prisma from "../config/database.js";

const router = Router();

router.get("/rate", async (req, res) => {
  try {
    const latest = await prisma.fxRateCache.findFirst({
      orderBy: { fetchedAt: "desc" }
    });
    
    if (latest) {
      res.json({
        sbtcToNgn: latest.sbtcToNgn.toString(),
        sbtcToUsd: latest.sbtcToUsd.toString(),
        ngnToUsd: "0.000009",
        lastUpdated: latest.fetchedAt,
        source: "coingecko"
      });
    } else {
      res.json({
        sbtcToNgn: "9240500.00",
        sbtcToUsd: "87430.00",
        ngnToUsd: "0.000009",
        lastUpdated: new Date(),
        source: "coingecko mock fallback"
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/convert", async (req, res) => {
  const amountStr = req.query.amount as string;
  if (!amountStr) return res.status(400).json({ error: "Missing amount in query" });

  try {
    const microSbtc = Number(amountStr);
    const latest = await prisma.fxRateCache.findFirst({
      orderBy: { fetchedAt: "desc" }
    });

    const sbtcToNgn = latest ? Number(latest.sbtcToNgn) : 9240500;
    const sbtcToUsd = latest ? Number(latest.sbtcToUsd) : 87430;
    const sbtc = microSbtc / 100_000_000;

    res.json({
      microSbtc,
      sbtc: sbtc.toFixed(8),
      ngn: (sbtc * sbtcToNgn).toFixed(2),
      usd: (sbtc * sbtcToUsd).toFixed(2),
      rate: {
        sbtcToNgn: sbtcToNgn.toString(),
        lastUpdated: latest?.fetchedAt || new Date()
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
