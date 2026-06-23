/**
 * Deployed contract addresses for Maktub Protocol v3 per network.
 *
 * @module
 */

import type { NetworkConfig } from "../types/index.js";
import {
  SEPOLIA_CONTRACTS,
  SEPOLIA_CHAIN_ID,
} from "./sepolia_addresses.generated.js";

/**
 * Base Mainnet (chain ID 8453) contract addresses.
 * Populated after mainnet deployment.
 */
export const BASE_MAINNET: NetworkConfig = {
  chainId: 8453,
  name: "Base",
  contracts: {
    maktubCore: "0x0000000000000000000000000000000000000000",
    recipientRegistry: "0x0000000000000000000000000000000000000000",
    mktbToken: "0x0000000000000000000000000000000000000000",
    executorRewards: "0x0000000000000000000000000000000000000000",
    mktbGovernance: "0x0000000000000000000000000000000000000000",
  },
};

/**
 * Base Sepolia Testnet (chain ID 84532) contract addresses.
 * Single source of truth: deployments/base-sepolia.json, via the generated
 * `sepolia_addresses.generated.ts` (run `node scripts/gen-addresses.mjs`).
 */
export const BASE_SEPOLIA: NetworkConfig = {
  chainId: SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  contracts: SEPOLIA_CONTRACTS,
};

/**
 * Localhost / Hardhat Network (chain ID 31337) contract addresses.
 * Populated dynamically during local development.
 */
export const LOCALHOST: NetworkConfig = {
  chainId: 31337,
  name: "Localhost",
  contracts: {
    maktubCore: "0x0000000000000000000000000000000000000000",
    recipientRegistry: "0x0000000000000000000000000000000000000000",
    mktbToken: "0x0000000000000000000000000000000000000000",
    executorRewards: "0x0000000000000000000000000000000000000000",
    mktbGovernance: "0x0000000000000000000000000000000000000000",
  },
};

/** All supported network configurations indexed by chain ID. */
export const NETWORKS: Record<number, NetworkConfig> = {
  [BASE_MAINNET.chainId]: BASE_MAINNET,
  [BASE_SEPOLIA.chainId]: BASE_SEPOLIA,
  [LOCALHOST.chainId]: LOCALHOST,
};

/**
 * Look up a network configuration by chain ID.
 * @param chainId - The EVM chain ID.
 * @returns The network configuration, or undefined if not supported.
 */
export function getNetworkConfig(chainId: number): NetworkConfig | undefined {
  return NETWORKS[chainId];
}
