/**
 * Slice 3 — port of the CRE auditor's `auditReceipts` to TS.
 *
 * Algorithmic source of truth: workflows/leashed-auditor/auditor/main.ts:49-76.
 * This file must stay a line-for-line port so the dashboard's CRE verdict
 * and the per-request Hono verdict never disagree.
 *
 * One divergence from CRE: empty receipts → verdict = "WARN" (CRE returns
 * "PASS" because the cron-triggered auditor is launched against a home-agent
 * that always has receipts). For the on-demand API the WARN branch lets
 * the caller render "nothing to audit" instead of misleadingly reporting
 * "no issues found".
 */

export type AuditReceipt = {
  id?: string;
  rail?: string;
  status?: string;
  amountBase?: string;
  token?: { symbol?: string };
  txHash?: string;
  txUrl?: string;
};

export type AuditState = {
  receipts?: AuditReceipt[];
  agent?: { limitLeft?: string };
};

export type AuditVerdict = "PASS" | "WARN" | "FAIL";

export type AuditResult = {
  verdict: AuditVerdict;
  checked: number;
  totalBase: number;
  otherBase: number;
  problems: string[];
};

const KNOWN_RAILS = ["thaifi-mpp", "cardano-x402"];

export function auditReceipts(state: AuditState, creditCapBase: string): AuditResult {
  const problems: string[] = [];
  const receipts = state.receipts ?? [];

  let totalBase = 0;
  let otherBase = 0;
  for (const r of receipts) {
    if (!r.id) problems.push(`receipt missing id`);
    if (!KNOWN_RAILS.includes(r.rail ?? "")) {
      problems.push(`receipt ${r.id}: unknown rail ${r.rail}`);
    }
    if (r.status !== "paid") {
      problems.push(`receipt ${r.id}: status ${r.status}`);
    }
    if (!r.txHash || !/^(0x)?[0-9a-fA-F]{64}$/.test(r.txHash ?? "")) {
      problems.push(`receipt ${r.id}: no tx hash`);
    }
    if (!/^\d+$/.test(r.amountBase ?? "")) {
      problems.push(`receipt ${r.id}: amountBase not integer`);
    } else if ((r.token?.symbol ?? "") === "THCFI") {
      totalBase += Number(r.amountBase);
    } else {
      otherBase += Number(r.amountBase);
    }
  }
  // Cross-check against the wallet's on-chain leash accounting (THCFI).
  // leash spend (cap - left) may exceed the ledger total: gas is drawn
  // through the same keychain but is not a receipt. Ledger exceeding
  // leash = forgery.
  const leashLeftMatch = (state.agent?.limitLeft ?? "").match(/THCFI ([\d,.]+)/);
  const leashLeft = Number(leashLeftMatch?.[1]?.replace(/,/g, "") ?? "0");
  const cap = Number(creditCapBase);
  const leashSpend = cap - leashLeft * 1e6;
  if (leashLeft > 0 && totalBase > leashSpend) {
    problems.push(`ledger total ${totalBase} exceeds on-chain leash spend ${leashSpend}`);
  }

  let verdict: AuditVerdict;
  if (receipts.length === 0 && problems.length === 0) verdict = "WARN";
  else if (problems.length === 0) verdict = "PASS";
  else verdict = "FAIL";

  return { verdict, checked: receipts.length, totalBase, otherBase, problems };
}