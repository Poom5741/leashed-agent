/**
 * Leashed Agent — receipt schema.
 * Chain-agnostic record of one agent payment, on any rail.
 */

export type Rail = "thaifi-mpp" | "cardano-x402";
export type ReceiptStatus = "paid" | "pending" | "failed" | "refused";

export interface Token {
  symbol: string;
  decimals: number;
}

export interface Receipt {
  id: string;
  rail: Rail;
  serviceId: string;
  /** What the payment bought, in one line (goes to the dashboard). */
  purpose: string;
  token: Token;
  /** Amount in the token's base units (integer, string to stay safe). */
  amountBase: string;
  amountDisplay: string;
  payTo: string;
  status: ReceiptStatus;
  /** On-chain transaction hash when the payment settled. */
  txHash?: string;
  txUrl?: string;
  createdAt: string;
  /** On-chain enforced spend-limit key that paid for this (ThaiFi keychain id). */
  agentKeyId?: string;
  memo?: string;
}

export function totalBase(receipts: Receipt[], filter?: (r: Receipt) => boolean): bigint {
  return receipts
    .filter((r) => r.status === "paid" && (filter ? filter(r) : true))
    .reduce((sum, r) => sum + BigInt(r.amountBase), 0n);
}
