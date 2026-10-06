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
  listPairs: () =>
    fetch("/api/agent/pairs", { credentials: "include" }).then((r) =>
      parse<{ pairs: AgentPair[] }>(r),
    ),
  deletePair: (id: string) =>
    fetch(`/api/agent/pairs/${id}`, { method: "DELETE", credentials: "include" }).then((r) =>
      parse<{ ok: boolean }>(r),
    ),
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
