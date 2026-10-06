/** TIP-20 tokens surfaced by the CLI — all ThaiFi TIP-20s use 6 decimals. */

import { CONFIG } from "./config.js";

export interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

export const PATHUSD: TokenInfo = {
  address: CONFIG.pathUsd,
  symbol: "pathUSD",
  name: "pathUSD",
  decimals: 6,
};

// System TIP-20 tokens (native factory, 2026-09-24) — can pay gas fees via
// FeeAMM (FeeManager.setUserToken). Old factory tokens are test-only deprecated.
export const THCFI: TokenInfo = {
  address: "0x20c000000000000000000000c82102FFe7064362",
  symbol: "THCFI",
  name: "ThaiCoin ThaiFi",
  decimals: 6,
};

export const THCOC: TokenInfo = {
  address: "0x20C0000000000000000000007c24a0c628e8A940",
  symbol: "THCOC",
  name: "ThaiCoin OpenCraft",
  decimals: 6,
};

/** Tokens listed by `thaifi tokens` / shown by default in `thaifi balance`. */
export const TOKENS: readonly TokenInfo[] = [PATHUSD, THCFI, THCOC];

/**
 * Resolve a token by symbol (case-insensitive) or 0x address. Addresses
 * outside the registry are treated as custom TIP-20s (6 decimals); the
 * symbol is read from the chain by the caller.
 */
export function resolveToken(arg: string): TokenInfo {
  const bySymbol = TOKENS.find((t) => t.symbol.toLowerCase() === arg.toLowerCase());
  if (bySymbol) return bySymbol;
  if (/^0x[0-9a-fA-F]{40}$/.test(arg)) {
    const known = TOKENS.find((t) => t.address.toLowerCase() === arg.toLowerCase());
    if (known) return known;
    return { address: arg as `0x${string}`, symbol: "TOKEN", name: "Custom TIP-20", decimals: 6 };
  }
  throw new Error(
    `Unknown token "${arg}" — use a symbol (pathUSD, THCFI, THCOC) or a 0x contract address.`,
  );
}
