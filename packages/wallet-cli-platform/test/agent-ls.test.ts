import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// `agent ls` reads from the on-disk store and prints a table. We invoke the
// command function directly with a `stdout` capture, so we don't have to
// spawn a child process.
//
// TODO(slice-1): the impl must export `runAgentLs(opts)` returning
// `{ exitCode, stdout, stderr }` so the CLI binary can just forward them.
// The store dependency is injected so tests don't touch the real `~/.thaifi`.

import { runAgentLs } from "../src/commands/agent-ls.js";
import {
  loadStore,
  saveStore,
  addAgent,
  type AgentRecord,
} from "../src/store.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "wallet-cli-ls-"));
}

function seededStore(n: number, withRevoked = false): string {
  const dir = tmpDir();
  const store = loadStore(dir);
  store.wallet = {
    address: "0xwallet",
    userAddress: "0xuser",
    label: "primary",
    createdAt: new Date().toISOString(),
  };
  for (let i = 0; i < n; i++) {
    const a: AgentRecord = {
      keyId: "0x" + (i + 1).toString(16).padStart(2, "0").repeat(32),
      template: ["noodle-shop", "poster", "audit-bot"][i % 3]!,
      leash: {
        perTokenBase: { THCFI: "2000000", tUSDM: "100000", tADA: "50000" },
        periodSec: 60 * 60 * 24 * 30,
        keyExpiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
      },
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    };
    addAgent(store, a);
    if (withRevoked && i === n - 1) {
      a.revokedAt = new Date().toISOString();
    }
  }
  saveStore(store, dir);
  return dir;
}

test("agent ls on an empty store exits 1 with a 'no agents' message", () => {
  const dir = tmpDir();
  const res = runAgentLs({ storeDir: dir });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr + res.stdout, /no agents/i);
});

test("agent ls on a store with 1 agent prints exactly 1 table row", () => {
  const dir = seededStore(1);
  const res = runAgentLs({ storeDir: dir });
  assert.equal(res.exitCode, 0);
  // 1 data row + 1 header row
  const dataRows = res.stdout.trim().split("\n").filter((l) => l.includes("noodle-shop"));
  assert.equal(dataRows.length, 1);
});

test("agent ls on a store with N agents prints N table rows", () => {
  const dir = seededStore(5);
  const res = runAgentLs({ storeDir: dir });
  assert.equal(res.exitCode, 0);
  const lines = res.stdout.trim().split("\n");
  // header + N data rows
  assert.equal(lines.length, 5 + 1);
});

test("agent ls annotates revoked agents with a [revoked] tag", () => {
  const dir = seededStore(3, /* withRevoked */ true);
  const res = runAgentLs({ storeDir: dir });
  assert.equal(res.exitCode, 0);
  // The last-added agent is the revoked one (per seededStore).
  const revokedLine = res.stdout.split("\n").find((l) => l.includes("audit-bot") || l.includes("0x03"));
  assert.ok(revokedLine, "expected the revoked agent line to be present");
  assert.match(revokedLine!, /\[revoked\]/);
});

test("agent ls tolerates a missing store.json (no crash)", () => {
  const dir = tmpDir(); // empty — no store.json written
  const res = runAgentLs({ storeDir: dir });
  // Either "no agents" or an empty-table render is acceptable. Must not throw.
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr + res.stdout, /no agents/i);
});

// Helper alias to keep the seededStore signature above readable while still
// letting us hand the path to runAgentLs in tests.
// (TypeScript-only; the impl's `storeDir` option takes a string path.)
type StoreDir = string;