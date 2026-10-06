// Local agent key store — ~/.thaifi/store.json (chmod 600).
// The private key NEVER leaves this file; the web wallet only ever sees the
// derived address (key_id).

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".thaifi");
const FILE = join(DIR, "store.json");
const PAIR_LOG = join(DIR, "pair.log");

/** A pairing created but not yet approved — persisted so a re-run of
 * `thaifi login` reuses it (same URL, same key) instead of piling up
 * throwaway pairings on the server. */
export interface PendingPairing {
  pairingId: string;
  code: string;
  url: string;
  keyId: string;
  name: string;
  privateKey: string; // hex — needed to finish pairing with this identity
  createdAt: number;
}

export interface Store {
  privateKey: string; // hex — agent access key
  keyId: string; // address derived from the agent key (== access key id)
  name: string; // hostname of the machine that created the key
  walletUrl: string;
  rpcUrl: string;
  chainId: number;
  /** Set once a pairing is approved. */
  userAddress?: string;
  pairedAt?: number;
  /** Requested spending limit (raw units) / period (seconds). */
  limitAmount?: string;
  limitPeriod?: number;
  keyExpiry?: number;
  /** Pairing awaiting approval — cleared once pairing completes/fails. */
  pending?: PendingPairing;
}

export function loadStore(): Store | null {
  if (!existsSync(FILE)) return null;
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Store;
  } catch {
    return null;
  }
}

export function saveStore(store: Store): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    chmodSync(FILE, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
}

export function clearStore(): void {
  if (existsSync(FILE)) rmSync(FILE);
}

export const storePath = FILE;
export const pairLogPath = PAIR_LOG;

/** Writes ~/.thaifi/pair.log (chmod 600) — the durable copy of the approval
 * URL. Background launchers that lose stdout can always recover the link
 * from this file. Overwritten on every `thaifi login`. */
export function writePairLog(content: string): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(PAIR_LOG, content, { mode: 0o600 });
  try {
    chmodSync(PAIR_LOG, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
}
