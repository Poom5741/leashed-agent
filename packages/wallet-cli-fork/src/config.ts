/** ThaiFi Wallet CLI configuration — overridable via env for testing. */

export const CONFIG = {
  rpcUrl: process.env.THAIFI_RPC_URL ?? "https://rpc.thaifi.com",
  walletUrl: process.env.THAIFI_WALLET_URL ?? "https://wallet.thaifi.com",
  chainId: Number(process.env.THAIFI_CHAIN_ID ?? 17),
  /** pathUSD — ThaiFi fee/stable token (TIP-20, 6 decimals). */
  pathUsd: (process.env.THAIFI_PATHUSD ??
    "0x20c0000000000000000000000000000000000000") as `0x${string}`,
  /** Default spending limit: 100 pathUSD. */
  defaultLimit: 100n * 10n ** 6n,
  /** Default limit period: 30 days (seconds). */
  defaultPeriod: 60 * 60 * 24 * 30,
  /** Default key expiry: 90 days (seconds). */
  defaultExpiryDays: 90,
  /** Pairing poll interval / timeout. */
  pollIntervalMs: 3_000,
  pollTimeoutMs: 15 * 60 * 1_000,
};

export const PATHUSD_DECIMALS = 6;
