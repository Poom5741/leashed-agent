/**
 * Slice 2 + 3 client — thin fetch wrappers for the /agents Hono API.
 * The stub `X-Stub-User` header replaces production auth for the
 * pre-flight; flip to a real session cookie in production wire-in.
 */

export interface Agent {
  id: string;
  keyId: string;
  template: string;
  status: "pending" | "approved" | "rejected" | "claimed" | "expired" | "revoked";
  userAddress: string | null;
  expiry: number | null;
  limitAmount: string | null;
  limitPeriod: number | null;
  createdAt: number;
}

export type AuditVerdict = "PASS" | "WARN" | "FAIL";

export interface AuditResult {
  verdict: AuditVerdict;
  checked: number;
  totalBase: number;
  otherBase: number;
  problems: string[];
  batchId: string;
  attestationTx: string | null;
  createdAt: number;
}

export interface Passbook {
  keyId: string;
  template: string;
  status: Agent["status"];
  leaseState: "ok" | "revoked";
  receipts: Array<{ txHash: string; amount: string; token: string; explorerUrl: string; paidAt: string }>;
  limitAmount: string | null;
  limitPeriod: number | null;
  createdAt: number;
  latestAudit: AuditResult | null;
}

const BASE = ""; // vite dev proxies /api → Hono worker
const STUB_USER = "user_alice";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function listAgents(): Promise<Agent[]> {
  const res = await fetch(`${BASE}/api/agents`, {
    headers: { "X-Stub-User": STUB_USER },
  });
  const body = await jsonOrThrow<{ agents: Agent[] }>(res);
  return body.agents;
}

export async function getPassbook(keyId: string): Promise<Passbook> {
  const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(keyId)}/passbook`, {
    headers: { "X-Stub-User": STUB_USER },
  });
  return jsonOrThrow<Passbook>(res);
}

export async function auditAgent(keyId: string): Promise<AuditResult & { keyId: string }> {
  const res = await fetch(`${BASE}/api/audit`, {
    method: "POST",
    headers: { "X-Stub-User": STUB_USER, "Content-Type": "application/json" },
    body: JSON.stringify({ keyId }),
  });
  return jsonOrThrow(res);
}

export async function revokeAgent(keyId: string): Promise<{ status: Agent["status"]; revoked: boolean }> {
  const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
    headers: { "X-Stub-User": STUB_USER },
  });
  return jsonOrThrow(res);
}

// ---------- Slice 4 — marketplace services discovery ----------

export interface ServiceEntry {
  id: string;
  endpointUrl: string;
  rail: string;
  priceBase: string;
  token: string;
}

export async function listServices(q?: string): Promise<ServiceEntry[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  // Public — no auth header. Vite dev proxies /v1 → :8787 alongside /api.
  const res = await fetch(`${BASE}/v1/services${qs}`);
  const body = await jsonOrThrow<{ services: ServiceEntry[] }>(res);
  return body.services;
}