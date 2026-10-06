import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// `agent revoke <keyId>` flow:
//   1) Look up the agent in the local store — if not present, exit 1.
//   2) POST /api/agent/revoke { keyId }.
//   3) On HTTP 200, mark the agent's `revokedAt` locally and exit 0.
//   4) On HTTP 5xx or non-2xx, exit 1 (do NOT mark locally).
//
// TODO(slice-1): impl must export `runAgentRevoke(opts)` with the same
// `HttpClient` shape used by agent-deploy so tests can inject a fake.

import { runAgentRevoke, type HttpClient } from "../src/commands/agent-revoke.js";
import {
  loadStore,
  saveStore,
  addAgent,
  getAgent,
  type Store,
  type AgentRecord,
} from "../src/store.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "wallet-cli-revoke-"));
}

function seededStore(): Store {
  const dir = tmpDir();
  const store = loadStore(dir);
  store.wallet = {
    address: "0xwallet",
    userAddress: "0xuser",
    label: "primary",
    createdAt: new Date().toISOString(),
  };
  const a: AgentRecord = {
    keyId: "0x" + "72".repeat(16) + "1E67", // matches the verification-matrix row example
    template: "noodle-shop",
    leash: {
      perTokenBase: { THCFI: "2000000", tUSDM: "100000", tADA: "50000" },
      periodSec: 60 * 60 * 24 * 30,
      keyExpiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
    },
    createdAt: new Date().toISOString(),
  };
  addAgent(store, a);
  saveStore(store, dir);
  return store;
}

function fakeHttp(postImpl: (url: string, body: unknown) => { status: number; body: unknown }): HttpClient & { calls: { url: string; body?: unknown }[] } {
  const calls: { url: string; body?: unknown }[] = [];
  return {
    calls,
    async post(url, body) {
      calls.push({ url, body });
      return postImpl(url, body);
    },
    async get() { return { status: 404, body: { error: "unused" } }; },
  };
}

test("agent revoke exits 1 when the keyId is not in the store", async () => {
  const dir = tmpDir();
  const http = fakeHttp(() => ({ status: 200, body: { ok: true } }));
  const res = await runAgentRevoke({ keyId: "0xghost", storeDir: dir, http });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /not found|unknown/i);
  assert.equal(http.calls.length, 0, "must not POST when keyId is unknown");
});

test("agent revoke exits 0 and marks revokedAt locally on HTTP 200", async () => {
  const store = seededStore();
  const keyId = getAgent(store, "0x" + "72".repeat(16) + "1E67")!.keyId;
  const http = fakeHttp((url) => {
    if (url === "/api/agent/revoke") return { status: 200, body: { ok: true } };
    return { status: 404, body: {} };
  });
  const res = await runAgentRevoke({ keyId, storeDir: <string>store, http });

  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /revoked/i);

  // POST must carry the keyId
  assert.equal(http.calls.length, 1);
  const body = http.calls[0]!.body as { keyId: string };
  assert.equal(body.keyId, keyId);

  // Local state must reflect the revocation
  // (The impl reloads from storeDir after the POST.)
  const reloaded = loadStore(<string>store);
  const after = getAgent(reloaded, keyId);
  assert.ok(after);
  assert.ok(typeof after!.revokedAt === "string", "revokedAt must be set after HTTP 200");
});

test("agent revoke exits 1 on HTTP 500 and does NOT mutate local state", async () => {
  const store = seededStore();
  const keyId = getAgent(store, "0x" + "72".repeat(16) + "1E67")!.keyId;
  const http = fakeHttp(() => ({ status: 500, body: { error: "boom" } }));
  const res = await runAgentRevoke({ keyId, storeDir: <string>store, http });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /5\d\d|server|retry/i);

  // Local state must NOT be marked.
  const reloaded = loadStore(<string>store);
  const after = getAgent(reloaded, keyId);
  assert.ok(after);
  assert.equal(after!.revokedAt, undefined, "must not mark locally on server failure");
});