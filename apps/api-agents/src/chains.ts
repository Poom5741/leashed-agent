/**
 * Payment network registry — slice 5 multi-chain support.
 *
 * Every payment network the seller can accept, keyed by CAIP-2 network id.
 * A network is "configured" only when its seller key material is present in
 * the Worker env; unconfigured networks are hidden from /seller/health,
 * /api/chains and the 402 accepts array.
 */

export const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const TEMPO_TESTNET_CAIP2 = "eip155:42431"; // Tempo "Moderato" testnet

/** Well-known Tempo x402 USDC (TIP-20) token; override with TEMPO_USDC_ADDRESS. */
export const DEFAULT_TEMPO_USDC = "0x20c000000000000000000000b9537d11c60e8b50";
export const DEFAULT_TEMPO_RPC = "https://rpc.moderato.tempo.xyz";

export interface SellerEnv {
  CARDANO_SELLER_ADDRESS?: string;
  CARDANO_SELLER_MNEMONIC?: string;
  BLOCKFROST_API_KEY_PREPROD?: string;
  SOLANA_SELLER_ADDRESS?: string;
  SOLANA_SELLER_KEYPAIR?: string;
  TEMPO_SELLER_ADDRESS?: string;
  TEMPO_SELLER_KEY?: string;
  TEMPO_USDC_ADDRESS?: string;
  TEMPO_RPC_URL?: string;
  /** Optional PYUSD support: EVM (Tempo) TIP-20 address + Solana devnet mint. */
  PYUSD_ADDRESS?: string;
  SOLANA_PYUSD_MINT?: string;
}

export interface NetworkInfo {
  network: string;
  label: string;
  family: "cardano" | "svm" | "evm";
  token: string;
  priceBase: string;
  configured: boolean;
  payTo: string | null;
  /** Extra stablecoin assets accepted on this rail (e.g. PYUSD). */
  assets: string[];
}

/** 0x-hex 32-byte private key (EVM-style). */
export function isHexKey(v: string | undefined): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

/** base64 of a 64-byte Solana secretKey byte array. */
export function isSolanaKeypairB64(v: string | undefined): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  try {
    const bytes = Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
    return bytes.length === 64;
  } catch {
    return false;
  }
}

/**
 * Static view of all payment networks. Never builds signers or touches the
 * chain — safe to call on every request (health, discovery, 402 building).
 */
export function paymentNetworks(env: SellerEnv): NetworkInfo[] {
  const cardanoConfigured = Boolean(env.BLOCKFROST_API_KEY_PREPROD);
  const solanaConfigured = isSolanaKeypairB64(env.SOLANA_SELLER_KEYPAIR);
  const tempoConfigured = isHexKey(env.TEMPO_SELLER_KEY);
  return [
    {
      network: "cardano:preprod",
      label: "Cardano Preprod",
      family: "cardano",
      token: "tUSDM",
      priceBase: "100000",
      configured: cardanoConfigured,
      payTo: cardanoConfigured ? env.CARDANO_SELLER_ADDRESS ?? null : null,
      assets: [],
    },
    {
      network: SOLANA_DEVNET_CAIP2,
      label: "Solana Devnet",
      family: "svm",
      token: "USDC",
      priceBase: "100000",
      configured: solanaConfigured,
      payTo: solanaConfigured ? env.SOLANA_SELLER_ADDRESS ?? null : null,
      assets: env.SOLANA_PYUSD_MINT ? ["PYUSD"] : [],
    },
    {
      network: TEMPO_TESTNET_CAIP2,
      label: "Tempo Moderato Testnet",
      family: "evm",
      token: "USDC",
      priceBase: "100000",
      configured: tempoConfigured,
      payTo: tempoConfigured ? env.TEMPO_SELLER_ADDRESS ?? null : null,
      assets: env.PYUSD_ADDRESS ? ["PYUSD"] : [],
    },
  ];
}
