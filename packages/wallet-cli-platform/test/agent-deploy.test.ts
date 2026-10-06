import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// `agent deploy <template>` flow:
//   1) POST /api/agent/pair  { keyAddress, leash: { perTokenBase, periodSec, keyExpiry } }
//      →  { pairingId, code, approvalUrl }
//   2) Poll  GET  /api/agent/pair/:id  until status === "approved" or timeout.
//   3) On approval, return the new access key + leash summary.
//
// We inject an HTTP client so the impl never touches the network during tests.
//
// TODO(slice-1): the impl must export:
//   - `runAgentDeploy(opts)` returning `{ exitCode, stdout, stderr, result? }`
//   - an `HttpClient` interface with `post(url, body)` and `get(url)` methods
//   - leash defaults: THCFI 2_000_000 base, tUSDM 100_000, tADA 50_000, periodSec 30d
//   - poll interval (e.g. 1s) and timeout (e.g. 5 min)
//   - on missing wallet: exit 1 with "Not paired — run `thaifi login` first" (or similar)

import {
  runAgentDeploy,
  type HttpClient,
  type DeployDefaults,
} from "../src/commands/agent-deploy.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "wallet-cli-deploy-"));
}

function fakeHttp(responses: Array<{ url: string; status: number; body: unknown }>): HttpClient & { calls: { method: string; url: string; body?: unknown }[] } {
  let pairHits = 0;
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const pairId = "pair_abc";
  return {
    calls,
    async post(url, body) {
      calls.push({ method: "POST", url, body });
      const r = responses.find((x) => x.url === url);
      if (!r) return { status: 404, body: { error: "not-stubbed" } };
      return { status: r.status, body: r.body };
    },
    async get(url) {
      calls.push({ method: "GET", url });
      const r = responses.find((x) => x.url === url);
      if (!r) return { status: 404, body: { error: "not-stubbed" } };
      pairHits += 1;
      // For poll stubs we synthesize the approval transition on the 2nd poll hit.
      if (url === `/api/agent/pair/${pairId}`) {
        if (pairHits >= 2) return { status: 200, body: { status: "approved", key: { keyId: "0x" + "ee".repeat(32) }, leash: { perTokenBase: { THCFI: "2000000" }, periodSec: 2592000, keyExpiry: 1893456000 } } };
        return { status: 200, body: { status: "pending" } };
      }
      return { status: r.status, body: r.body };
    },
  };
}

const DEFAULTS: DeployDefaults = {
  perTokenBase: { THCFI: "2000000", tUSDM: "100000", tADA: "50000" },
  periodSec: 60 * 60 * 24 * 30,
  pollMs: 1, // tight loop in tests
  timeoutMs: 5_000,
};

test("agent deploy exits 1 with a 'Not paired' message when no wallet is in the store", async () => {
  const dir = tmpDir(); // empty
  const http = fakeHttp([]);
  const res = await runAgentDeploy({
    template: "noodle-shop",
    storeDir: dir,
    http,
    defaults: DEFAULTS,
  });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /not paired|run `thaifi login`/i);
  assert.equal(http.calls.length, 0, "must not POST when wallet is missing");
});

test("agent deploy on HTTP 200 + approved returns the new key and leash", async () => {
  const dir = tmpDir();
  const http = fakeHttp([
    { url: "/api/agent/pair", status: 200, body: { pairingId: "pair_abc", code: "u-1234", approvalUrl: "https://thaifi.com/approve/pair_abc" } },
    { url: "/api/agent/pair/pair_abc", status: 200, body: { status: "approved", key: { keyId: "0x" + "ee".repeat(32) }, leash: { perTokenBase: { THCFI: "2000000" }, periodSec: 2592000, keyExpiry: 1893456000 } } },
  ]);
  const res = await runAgentDeploy({
    template: "noodle-shop",
    storeDir: dir,
    http,
    defaults: DEFAULTS,
  });
  assert.equal(res.exitCode, 0);
  assert.ok(res.result);
  assert.match(res.result!.keyId, /^0x/);
  assert.match(res.stdout, /key:/i);

  // POST payload must carry the active wallet's address and the leash defaults.
  const pairCall = http.calls.find((c) => c.method === "POST" && c.url === "/api/agent/pair");
  assert.ok(pairCall, "POST /api/agent/pair must be called");
  const body = pairCall!.body as { keyAddress: string; leash: typeof DEFAULTS.perTokenBase & { periodSec: number; keyExpiry: number } };
  assert.equal(typeof body.keyAddress, "string");
  assert.equal(body.leash.perTokenBase.THCFI, "2000000");
  assert.equal(body.leash.perTokenBase.tUSDM, "100000");
  assert.equal(body.leash.perTokenBase.tADA, "50000");
  assert.equal(body.leash.periodSec, 60 * 60 * 24 * 30);
  assert.ok(typeof body.leash.keyExpiry === "number");
});

test("agent deploy times out when poll never returns 'approved'", async () => {
  const dir = tmpDir();
  const http: HttpClient = {
    async post() {
      return { status: 200, body: { pairingId: "pair_abc", code: "u-1234", approvalUrl: "https://thaifi.com/approve/pair_abc" } };
    },
    async get() {
      return { status: 200, body: { status: "pending" } };
    },
  };
  const res = await runAgentDeploy({
    template: "noodle-shop",
    storeDir: dir,
    http,
    defaults: { ...DEFAULTS, timeoutMs: 50 }, // force timeout quickly
  });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /timed out|timeout/i);
});

test("agent deploy exits 1 with an auth error on HTTP 401/403", async () => {
  const dir = tmpDir();
  const http: HttpClient = {
    async post() { return { status: 401, body: { error: "unauthorized" } }; },
    async get() { return { status: 401, body: { error: "unauthorized" } }; },
  };
  const res = await runAgentDeploy({
    template: "noodle-shop",
    storeDir: dir,
    http,
    defaults: DEFAULTS,
  });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /auth|unauthorized|forbidden/i);
});

test("agent deploy exits 1 with a retryable error on HTTP 500", async () => {
  const dir = tmpDir();
  const http: HttpClient = {
    async post() { return { status: 500, body: { error: "boom" } }; },
    async get() { return { status: 500, body: { error: "boom" } }; },
  };
  const res = await runAgentDeploy({
    template: "noodle-shop",
    storeDir: dir,
    http,
    defaults: DEFAULTS,
  });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /5\d\d|retry|server/i);
});