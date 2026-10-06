/**
 * Policy engine — the "leash". Decides whether an agent may spend.
 * Mirrors the on-chain enforcement (ThaiFi AccountKeychain caps): the dashboard
 * shows the on-chain truth; this engine gates the agent BEFORE it tries.
 */
import type { Rail, Receipt, Token } from "./schema.js";
import { totalBase } from "./schema.js";

export interface Policy {
  /** Max per single payment, base units, per token symbol. */
  maxPerPaymentBase: Record<string, string>;
  /** Max cumulative paid spend, base units, per token symbol (per policy window). */
  maxTotalBase: Record<string, string>;
  /** Empty = any service allowed. */
  allowedServices?: string[];
}

export type Verdict =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluate(
  policy: Policy,
  history: Receipt[],
  proposed: { rail: Rail; serviceId: string; token: Token; amountBase: string },
): Verdict {
  if (policy.allowedServices && !policy.allowedServices.includes(proposed.serviceId)) {
    return { allowed: false, reason: `service "${proposed.serviceId}" is not on the allowlist` };
  }
  const amount = BigInt(proposed.amountBase);
  const perMax = policy.maxPerPaymentBase[proposed.token.symbol];
  if (perMax === undefined) {
    return { allowed: false, reason: `token "${proposed.token.symbol}" is not in the policy` };
  }
  if (amount > BigInt(perMax)) {
    return { allowed: false, reason: `amount ${amount} exceeds per-payment cap ${perMax} ${proposed.token.symbol}` };
  }
  const spent = totalBase(history, (r) => r.token.symbol === proposed.token.symbol);
  const totalMax = BigInt(policy.maxTotalBase[proposed.token.symbol] ?? perMax);
  if (spent + amount > totalMax) {
    return {
      allowed: false,
      reason: `spend ${spent} + ${amount} would exceed total cap ${totalMax} ${proposed.token.symbol} (remaining: ${totalMax - spent})`,
    };
  }
  return { allowed: true };
}

export function remainingBase(policy: Policy, history: Receipt[], symbol: string): bigint {
  const totalMax = BigInt(policy.maxTotalBase[symbol] ?? policy.maxPerPaymentBase[symbol] ?? "0");
  const spent = totalBase(history, (r) => r.token.symbol === symbol);
  return totalMax > spent ? totalMax - spent : 0n;
}
