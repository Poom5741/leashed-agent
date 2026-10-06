import { defineChain } from "viem";
import { Chain as TempoChains } from "viem/tempo";

/**
 * ThaiFi network configuration (Tempo fork, chain ID 17).
 *
 * Gas token (pathUSD) is a TIP-20 deployed at the system reserved address;
 * the chain has no economically meaningful native ETH — gas and fees are
 * paid in pathUSD, so all value-bearing operations reference the pathUSD
 * token address below.
 */
export const thaifi = defineChain({
  id: 17,
  name: "ThaiFi",
  nativeCurrency: {
    name: "pathUSD",
    symbol: "pathUSD",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.thaifi.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "ThaiFi Explorer",
      url: "https://exp.thaifi.com",
    },
  },
});

/**
 * On-chain address of the pathUSD gas token. Used for balance reads and
 * token transfers because ThaiFi pays gas in pathUSD rather than ETH.
 */
export const PATHUSD_TOKEN = "0x20C0000000000000000000000000000000000000" as const;

/**
 * Same network but cloned from viem/tempo's mainnet definition so the tempo
 * formatters/serializers are present. Required for feeToken-aware clients
 * (viem/tempo `createClient`) — e.g. the /pair approve tx signed with an
 * explicit gas-token choice.
 */
export const thaifiTempo = defineChain({
  ...(TempoChains.mainnet as unknown as import("viem").Chain),
  id: 17,
  name: "ThaiFi",
  network: "thaifi",
  nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.thaifi.com"] } },
  blockExplorers: {
    default: { name: "ThaiFi Explorer", url: "https://exp.thaifi.com" },
  },
});
