import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// ─── types ───────────────────────────────────────────────────────────────────

export interface WalletRecord {
  address: string;
  userAddress: string;
  label?: string;
  createdAt: string;
}

export interface AgentRecord {
  keyId: string;
  template: string;
  leash: {
    perTokenBase: Record<string, string>;
    periodSec: number;
    keyExpiry: number;
  };
  createdAt: string;
  revokedAt?: string;
}

export interface Store {
  wallet: WalletRecord | null;
  agents: Record<string, AgentRecord>;
}

// ─── paths ───────────────────────────────────────────────────────────────────

const STORE_NAME = "store.json";
const DEFAULT_SUBDIR = ".thaifi";

function storePath(dir?: string): string {
  const base = dir ?? join(homedir(), DEFAULT_SUBDIR);
  return join(base, STORE_NAME);
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

// ─── load ────────────────────────────────────────────────────────────────────

function defaultStore(): Store {
  return { wallet: null, agents: {} };
}

/** legacy pre-slice-1 shape */
interface LegacyStore {
  key: string;
  address: string;
  createdAt: string;
  agents?: never;
  wallet?: never;
}

export function loadStore(dir?: string): Store {
  const path = storePath(dir);

  if (!existsSync(path)) {
    const base = dir ?? join(homedir(), DEFAULT_SUBDIR);
    ensureDir(base);
    return defaultStore();
  }

  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as
    | Store
    | LegacyStore
    | { wallet: unknown; agents: unknown };

  // detect legacy single-key shape
  if ("key" in parsed && "address" in parsed && !("agents" in parsed)) {
    const legacy = parsed as LegacyStore;
    const store = defaultStore();
    // bring wallet forward
    store.wallet = {
      address: legacy.address,
      userAddress: "",
      createdAt: legacy.createdAt,
    };
    // add legacy key as a special agent so the CLI can still reason about it
    store.agents["primary"] = {
      keyId: "primary",
      template: legacy.key,
      leash: { perTokenBase: {}, periodSec: 0, keyExpiry: 0 },
      createdAt: legacy.createdAt,
    };
    return store;
  }

  const s = parsed as Store;
  return {
    wallet: s.wallet ?? null,
    agents: s.agents ?? {},
  };
}

// ─── save ─────────────────────────────────────────────────────────────────────

export function saveStore(store: Store, dir?: string): void {
  const base = dir ?? join(homedir(), DEFAULT_SUBDIR);
  ensureDir(base);
  const path = join(base, STORE_NAME);

  // write via staged temp then rename so we never leave a partial file
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(store), "utf8");
  chmodSync(tmp, 0o600);
  writeFileSync(path, readFileSync(tmp));
  chmodSync(path, 0o600);
}

// ─── agents ──────────────────────────────────────────────────────────────────

export function addAgent(store: Store, agent: AgentRecord): void {
  store.agents[agent.keyId] = agent;
}

export function listAgents(store: Store): AgentRecord[] {
  return Object.values(store.agents);
}

export function getAgent(store: Store, keyId: string): AgentRecord | null {
  return store.agents[keyId] ?? null;
}

export function revokeAgent(store: Store, keyId: string): void {
  const agent = store.agents[keyId];
  if (!agent) return;
  agent.revokedAt = new Date().toISOString();
}
