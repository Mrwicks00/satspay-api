import { createNetwork } from "@stacks/network";
import { env } from "./env.js";

export const network = createNetwork(env.STACKS_NETWORK as "mainnet" | "testnet" | "devnet");

export const CONTRACTS = {
  escrow: {
    address: env.ESCROW_CONTRACT_ADDRESS,
    name: env.ESCROW_CONTRACT_NAME,
  },
  registry: {
    address: env.REGISTRY_CONTRACT_ADDRESS,
    name: env.REGISTRY_CONTRACT_NAME,
  },
  sbtcToken: {
    address: env.SBTC_TOKEN_ADDRESS,
    name: env.SBTC_TOKEN_NAME,
  },
};
