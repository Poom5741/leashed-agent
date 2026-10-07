// Thin fetch helpers for the wallet API (same-origin /api on the Worker).

export interface AuthUser {
  id: string;
  provider: string; // 'line' | 'email'
  email: string | null;
  displayName: string | null;
  picture: string | null;
}

export interface ApiConfig {
  lineEnabled: boolean;
  appName: string;
}

export interface BackupSummary {
  address: string;
  updatedAt: number;
}

export interface HistoryItem {
  txHash: string;
  block: number;
  time: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number | null;
  from: string;
  to: string;
  direction: "in" | "out";
  counterparty: string;
  amount: string;
}

// Platform API origin. VITE_API_BASE is set at build time so the SPA
// bundle never embeds the worker file path. Falls back to the deployed
// workers.dev origin so the wallet SPA can fetch from any environment.
const PLATFORM_API =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://leashed-api-agents.poom-a1d.workers.dev";

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(path, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    }),
  );
}

export const api = {
  config: () => fetch("/api/config").then((r) => parse<ApiConfig>(r)),
  me: () => fetch("/api/me", { credentials: "include" }).then((r) => parse<{ user: AuthUser | null }>(r)),
  logout: () => post<{ ok: boolean }>("/api/auth/logout"),
  requestOtp: (email: string) => post<{ ok: boolean }>("/api/auth/email/request", { email }),
  verifyOtp: (email: string, code: string) =>
    post<{ user: AuthUser }>("/api/auth/email/verify", { email, code }),
  lineStart: () => {
    window.location.href = "/api/auth/line/start";
  },
  listBackups: () =>
    fetch("/api/backups", { credentials: "include" }).then((r) => parse<{ backups: BackupSummary[] }>(r)),
  putBackup: (address: string, backup: string) =>
    fetch(`/api/backups/${address}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup }),
      credentials: "include",
    }).then((r) => parse<{ ok: boolean }>(r)),
  getBackup: (address: string) =>
    fetch(`/api/backups/${address}`, { credentials: "include" }).then((r) =>
      parse<{ backup: string; updatedAt: number }>(r),
    ),
  deleteBackup: (address: string) =>
    fetch(`/api/backups/${address}`, { method: "DELETE", credentials: "include" }).then((r) =>
      parse<{ ok: boolean }>(r),
    ),
  history: (address: string) =>
    fetch(`/api/history?address=${encodeURIComponent(address)}`, { credentials: "include" }).then((r) =>
      parse<{ items: HistoryItem[] }>(r),
    ),
  // The upstream ThaiFi wallet fork ships /api/agent/* on its own CF worker,
  // which isn't deployed for the Leashed fork (different account). Instead
  // we hit the platform's /api/agents with the stub-user header used by the
  // platform SPA. Both shapes are compatible (keyId, expiry, limitAmount,
  // limitPeriod, userAddress, createdAt) — we map `template`→`name` and
  // synthesize `keyType` from the platform record.
  listPairs: () =>
    fetch(`${PLATFORM_API}/api/agents`, {
      headers: { "X-Stub-User": "wallet-device" },
    }).then(async (r) => {
      const body = (await r.json().catch(() => ({}))) as {
        agents?: Array<{
          id: string;
          keyId: string;
          template: string;
          status: string;
          userAddress: string | null;
          expiry: number | null;
          limitAmount: string | null;
          limitPeriod: number | null;
          createdAt: number;
        }>;
      };
      const pairs: AgentPair[] = (body.agents ?? []).map((a) => ({
        id: a.id,
        keyId: a.keyId,
        keyType: "p256",
        name: a.template,
        userAddress: a.userAddress,
        expiry: a.expiry,
        limitAmount: a.limitAmount,
        limitPeriod: a.limitPeriod,
        createdAt: a.createdAt,
      }));
      return { pairs };
    }),
  deletePair: async (_id: string) => {
    // Manage agent pairs on the platform SPA (/agents) — the wallet is
    // a viewer for the Leashed Agent allowance, not the manager.
    throw new Error(
      "Manage agent allowances on the platform SPA → https://leashed-agent-platform.pages.dev/agents",
    );
  },
  paysoOrder: (amount: number, address: string, token: string) =>
    post<PaysoOrder>("/api/payso/order", { amount, address, token }),
  paysoOrderStatus: (referenceNo: string) =>
    fetch(`/api/payso/order/${encodeURIComponent(referenceNo)}`, { credentials: "include" }).then(
      (r) => parse<PaysoOrderStatus>(r),
    ),
};

export interface PaysoOrder {
  referenceNo: string;
  total: string;
  orderNo: string | number | null;
  image: string; // data:image/png;base64
  expiresAt: number;
}

export interface PaysoOrderStatus {
  referenceNo: string;
  status: string; // pending|paid|delivering|delivered|capped|qr_error|callback:<code>
  total: string;
  token: string | null;
  orderNo: string | null;
  paidAt: number | null;
  expiresAt: number | null;
  txHash: string | null;
}

export interface AgentPair {
  id: string;
  keyId: string;
  keyType: string;
  name: string;
  userAddress: string | null;
  expiry: number | null;
  limitAmount: string | null;
  limitPeriod: number | null;
  createdAt: number;
}
