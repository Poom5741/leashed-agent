import { PATHUSD_TOKEN } from "./chain";

/**
 * TIP-20 tokens surfaced in the wallet UI. Every ThaiFi TIP-20 uses
 * 6 decimals; gas is always paid in pathUSD regardless of the token sent.
 */
export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** One-liner under the symbol in balance rows. */
  sub: string;
  /** Monogram for the row badge. */
  badge: string;
  /** Badge accent color (legible on dark & light themes). */
  color: string;
  /** Pre-filled spend limit on the CLI approval page (human units). */
  defaultLimit: string;
}

export const PATHUSD: TokenInfo = {
  address: PATHUSD_TOKEN,
  symbol: "pathUSD",
  name: "pathUSD",
  decimals: 6,
  sub: "ThaiFi fee token",
  badge: "$",
  color: "#1f9d63",
  defaultLimit: "100",
};

// System TIP-20 tokens (native factory, 2026-09-24) — can pay gas fees via
// FeeAMM (setUserToken). Old factory tokens (0xfe76…6994 / 0xde2c…f489) are
// test-only and deprecated.
export const THCFI: TokenInfo = {
  address: "0x20c000000000000000000000c82102FFe7064362",
  symbol: "THCFI",
  name: "ThaiCoin ThaiFi",
  decimals: 6,
  sub: "ThaiCoin",
  badge: "T",
  color: "#c2820b",
  defaultLimit: "5000",
};

export const THCOC: TokenInfo = {
  address: "0x20C0000000000000000000007c24a0c628e8A940",
  symbol: "THCOC",
  name: "ThaiCoin OpenCraft",
  decimals: 6,
  sub: "ThaiCoin OpenCraft",
  badge: "C",
  color: "#3b82f6",
  defaultLimit: "5000",
};

/** Tokens listed in Balances / the send picker (order = display order). */
export const TOKENS: readonly TokenInfo[] = [PATHUSD, THCFI, THCOC];

export function findToken(address: string): TokenInfo | undefined {
  return TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}
