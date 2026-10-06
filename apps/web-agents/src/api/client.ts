/**
 * Slice 2 client — thin fetch wrappers for the /agents Hono API.
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

export interface Passbook {
  keyId: string;
  template: string;
  status: Agent["status"];
  leaseState: "ok" | "revoked";
  receipts: Array<{ txHash: string; amount: string; token: string; explorerUrl: string; paidAt: string }>;
  limitAmount: string | null;
  limitPeriod: number | null;
  createdAt: number;
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

export async function revokeAgent(keyId: string): Promise<{ status: Agent["status"]; revoked: boolean }> {
  const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
    headers: { "X-Stub-User": STUB_USER },
  });
  return jsonOrThrow(res);
}