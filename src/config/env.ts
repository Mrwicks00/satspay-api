import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("4000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string(),

  // Stacks
  STACKS_API_URL: z.string().url(),
  STACKS_NETWORK: z.enum(["mainnet", "testnet", "devnet"]),
  ESCROW_CONTRACT_ADDRESS: z.string(),
  ESCROW_CONTRACT_NAME: z.string(),
  REGISTRY_CONTRACT_ADDRESS: z.string(),
  REGISTRY_CONTRACT_NAME: z.string(),
  SBTC_TOKEN_ADDRESS: z.string(),
  SBTC_TOKEN_NAME: z.string(),

  // Database
  DATABASE_URL: z.string().url(),

  // SMS (Termii)
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default("SatsPay"),

  // SMS (Africa's Talking)
  AT_USERNAME: z.string().optional(),
  AT_API_KEY: z.string().optional(),

  // FX (CoinGecko)
  COINGECKO_API_KEY: z.string().optional(),

  // Offramp (Flutterwave)
  FLW_PUBLIC_KEY: z.string().optional(),
  FLW_SECRET_KEY: z.string().optional(),
  FLW_ENCRYPTION_KEY: z.string().optional(),

  // Offramp (Paystack)
  PAYSTACK_SECRET_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
