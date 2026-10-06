import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The store module lives at `../src/store.js`. None of the impls exist yet —
// these tests are the red side of slice-1 red/green TDD.
//
// TODO(slice-1): the impl must export:
//   - `loadStore(dir?: string): Store`
//   - `saveStore(store: Store, dir?: string): void`
//   - `Store` type with shape `{ wallet: WalletRecord; agents: Record<keyId, AgentRecord> }`
//   - `WalletRecord { address, userAddress, label?, createdAt }`
//   - `AgentRecord { keyId, template, leash: { perTokenBase: Record<symbol, string>, periodSec, keyExpiry }, createdAt, revokedAt? }`
//   - `addAgent(store, agent): void`
//   - `listAgents(store): AgentRecord[]`
//   - `getAgent(store, keyId): AgentRecord | null`
//   - `revokeAgent(store, keyId): void`
//
// Default store location: `~/.thaifi/store.json`. Tests override the dir
// by passing a `mkdtempSync` directory.

import {
  loadStore,
  saveStore,
  addAgent,
  listAgents,
  getAgent,
  revokeAgent,
  type Store,
  type AgentRecord,
} from "../src/store.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "wallet-cli-store-"));
}

function freshStore(): Store {
  // The impl should provide a way to build a brand-new store (no file present).
  // For now we rely on loadStore to handle the missing-file case.
  return loadStore(tmpDir());
}

function sampleAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    keyId: "0x" + "ab".repeat(32),
    template: "noodle-shop",
    leash: {
      perTokenBase: { THCFI: "2000000", tUSDM: "100000", tADA: "50000" },
      periodSec: 60 * 60 * 24 * 30,
      keyExpiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("loadStore returns a valid empty store when no file exists", () => {
  const dir = tmpDir();
  const store = loadStore(dir);
  // The store must always have a wallet record (placeholder until login) and an agents map.
  assert.equal(typeof store, "object");
  assert.ok(store.wallet === null || typeof store.wallet === "object");
  assert.equal(typeof store.agents, "object");
  assert.deepEqual(Object.keys(store.agents), []);
});

test("loadStore reads a valid populated store from disk", () => {
  const dir = tmpDir();
  const populated = {
    wallet: {
      address: "0xwallet",
      userAddress: "0xuser",
      label: "primary",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    agents: {
      "0xaa": sampleAgent({ keyId: "0xaa", template: "noodle-shop" }),
      "0xbb": sampleAgent({ keyId: "0xbb", template: "poster", leash: undefined as unknown as AgentRecord["leash"] }),
    },
  };
  writeFileSync(join(dir, "store.json"), JSON.stringify(populated));
  const loaded = loadStore(dir);
  assert.equal(loaded.wallet?.address, "0xwallet");
  assert.equal(Object.keys(loaded.agents).length, 2);
  assert.equal(getAgent(loaded, "0xaa")?.template, "noodle-shop");
});

test("loadStore migrates from the old single-key shape", () => {
  // Pre-slice-1 store: `{ key: "...", address: "0x..." }` with no agents map.
  // The impl must read this, build a default agents map, and write back on next save.
  const dir = tmpDir();
  const oldShape = {
    key: "0xoldkey",
    address: "0xoldwallet",
    createdAt: "2025-12-01T00:00:00.000Z",
  };
  writeFileSync(join(dir, "store.json"), JSON.stringify(oldShape));
  const migrated = loadStore(dir);
  // TODO(slice-1): the impl must preserve the legacy single key under a known keyId
  // (e.g. "primary") so existing users don't lose their wallet binding.
  assert.equal(typeof migrated.agents, "object");
  // Either the legacy key shows up as an agent, OR the wallet record carries it.
  const hasLegacy =
    getAgent(migrated, "primary") !== null ||
    getAgent(migrated, "0xoldkey") !== null ||
    migrated.wallet?.address === "0xoldwallet";
  assert.ok(hasLegacy, "migration lost the legacy wallet/key");
});

test("add → list → get round-trip preserves agent fields", () => {
  const store = freshStore();
  const a = sampleAgent({ keyId: "0x" + "11".repeat(32), template: "noodle-shop" });
  const b = sampleAgent({ keyId: "0x" + "22".repeat(32), template: "poster" });
  addAgent(store, a);
  addAgent(store, b);

  const all = listAgents(store);
  assert.equal(all.length, 2);
  // Order is not contractual, but both must be present.
  const ids = all.map((x) => x.keyId).sort();
  assert.deepEqual(ids, [a.keyId, b.keyId].sort());

  const fetched = getAgent(store, a.keyId);
  assert.ok(fetched);
  assert.equal(fetched.template, "noodle-shop");
  assert.equal(fetched.leash.perTokenBase.THCFI, "2000000");
  assert.equal(fetched.revokedAt, undefined);

  assert.equal(getAgent(store, "0xmissing"), null);
});

test("revokeAgent marks the agent with a revokedAt timestamp and removes it from active list", () => {
  const store = freshStore();
  const a = sampleAgent({ keyId: "0x" + "33".repeat(32) });
  addAgent(store, a);
  revokeAgent(store, a.keyId);

  const fetched = getAgent(store, a.keyId);
  assert.ok(fetched);
  assert.ok(typeof fetched!.revokedAt === "string", "revokedAt must be an ISO string");
  assert.ok(!Number.isNaN(Date.parse(fetched!.revokedAt!)), "revokedAt must parse as a date");

  // listAgents contract choice: include revoked entries (with revokedAt set) or filter them out.
  // The impl doc says revoked entries show with a `[revoked]` tag in `agent ls`, so they MUST be
  // returned by listAgents so the CLI can annotate them.
  const all = listAgents(store);
  assert.equal(all.length, 1);
  assert.ok(all[0]!.revokedAt);
});

test("revokeAgent on an unknown keyId is a no-op (does not throw)", () => {
  const store = freshStore();
  assert.doesNotThrow(() => revokeAgent(store, "0xghost"));
  assert.equal(listAgents(store).length, 0);
});

test("saveStore writes valid JSON and read-back matches in-memory state", () => {
  const dir = tmpDir();
  const store = freshStore();
  store.wallet = {
    address: "0xwallet",
    userAddress: "0xuser",
    label: "primary",
    createdAt: new Date().toISOString(),
  };
  addAgent(store, sampleAgent({ keyId: "0x" + "44".repeat(32), template: "noodle-shop" }));
  saveStore(store, dir);

  const path = join(dir, "store.json");
  assert.ok(existsSync(path), "saveStore did not write store.json");
  const onDisk = JSON.parse(readFileSync(path, "utf8")) as Store;
  assert.equal(onDisk.wallet?.address, "0xwallet");
  assert.equal(Object.keys(onDisk.agents).length, 1);
  assert.equal(getAgent(onDisk, "0x" + "44".repeat(32))?.template, "noodle-shop");
});

test("saveStore applies restrictive file permissions on POSIX", () => {
  // Skipped on non-POSIX; we don't fail the suite there.
  if (process.platform === "win32") return;
  const dir = tmpDir();
  const store = freshStore();
  saveStore(store, dir);
  const path = join(dir, "store.json");
  const mode = statSync(path).mode & 0o777;
  // TODO(slice-1): impl should chmod 0o600 (owner read/write only) so secrets don't leak.
  assert.equal(mode, 0o600, `expected 0o600 on store.json, got 0o${mode.toString(8)}`);
});