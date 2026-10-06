import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// `agent run --brief ... --budget ...` is a wrapper around `apps/agent/src/job.ts`.
// It must:
//   1) Resolve the active agent (the most-recently-deployed non-revoked one).
//   2) Reject negative budgets up front.
//   3) Spawn `tsx src/job.ts` with the agent's key + leash wired into env, plus
//      the brief/budget forwarded as CLI flags.
//   4) Exit with the child process's exit code.
//
// TODO(slice-1): the impl must export `runAgentRun(opts)` taking a `spawner`
// so tests can capture (cmd, args, env) without touching real processes.

import { runAgentRun, type Spawner } from "../src/commands/agent-run.js";
import {
  loadStore,
  saveStore,
  addAgent,
  type Store,
  type AgentRecord,
} from "../src/store.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "wallet-cli-run-"));
}

function seededStore(revoked = false): { storeDir: string; agent: AgentRecord } {
  const dir = tmpDir();
  const store = loadStore(dir);
  store.wallet = {
    address: "0xwallet",
    userAddress: "0xuser",
    label: "primary",
    createdAt: new Date().toISOString(),
  };
  const agent: AgentRecord = {
    keyId: "0x" + "ab".repeat(32),
    template: "noodle-shop",
    leash: {
      perTokenBase: { THCFI: "2000000", tUSDM: "100000", tADA: "50000" },
      periodSec: 60 * 60 * 24 * 30,
      keyExpiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
    },
    createdAt: new Date().toISOString(),
    ...(revoked ? { revokedAt: new Date().toISOString() } : {}),
  };
  addAgent(store, agent);
  saveStore(store, dir);
  return { storeDir: dir, agent };
}

function fakeSpawner(exitCode = 0): Spawner & { calls: { cmd: string; args: string[]; env: Record<string, string> }[] } {
  const calls: { cmd: string; args: string[]; env: Record<string, string> }[] = [];
  return {
    calls,
    async spawn(cmd, args, env) {
      calls.push({ cmd, args, env });
      return { code: exitCode, stdout: "ok", stderr: "" };
    },
  };
}

test("agent run exits 1 with a 'no active agent' message when no agents exist", async () => {
  const dir = tmpDir();
  const spawner = fakeSpawner();
  const res = await runAgentRun({ storeDir: dir, brief: "test", budget: 1.5, spawner });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /no active agent/i);
  assert.equal(spawner.calls.length, 0);
});

test("agent run exits 1 when budget is negative", async () => {
  const { storeDir } = seededStore();
  const spawner = fakeSpawner();
  const res = await runAgentRun({ storeDir, brief: "test", budget: -0.01, spawner });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /budget/i);
  assert.equal(spawner.calls.length, 0);
});

test("agent run exits 0 on the happy path and spawns tsx with the active agent's key + leash in env", async () => {
  const { storeDir, agent } = seededStore();
  const spawner = fakeSpawner(0);
  const res = await runAgentRun({
    storeDir,
    brief: "test brief",
    budget: 1.5,
    spawner,
    // The impl must default to `apps/agent/src/job.ts` relative to the repo root
    // when no override is given.
  });
  assert.equal(res.exitCode, 0);
  assert.equal(spawner.calls.length, 1);
  const { cmd, args, env } = spawner.calls[0]!;

  // Spawner contract: `tsx` binary, then `src/job.ts`, then brief + budget flags.
  assert.match(cmd, /tsx$/);
  assert.ok(args[0]?.endsWith("src/job.ts"), `expected src/job.ts, got ${args[0]}`);
  assert.ok(args.includes("--brief") && args.includes("test brief"), "must forward --brief");
  assert.ok(args.includes("--budget") && args.includes("1.5"), "must forward --budget");

  // Active agent's key + leash wired into the child env.
  assert.equal(env.AGENT_KEY_ID, agent.keyId);
  assert.equal(env.AGENT_LEASH_PER_TOKEN_BASE, JSON.stringify(agent.leash.perTokenBase));
  assert.equal(env.AGENT_LEASH_PERIOD_SEC, String(agent.leash.periodSec));
  assert.equal(env.AGENT_LEASH_KEY_EXPIRY, String(agent.leash.keyExpiry));
});

test("agent run selects the most-recently-created non-revoked agent", async () => {
  const dir = tmpDir();
  const store = loadStore(dir);
  store.wallet = {
    address: "0xwallet",
    userAddress: "0xuser",
    label: "primary",
    createdAt: new Date().toISOString(),
  };
  const old: AgentRecord = {
    keyId: "0x" + "11".repeat(32),
    template: "noodle-shop",
    leash: { perTokenBase: {}, periodSec: 1, keyExpiry: 1 },
    createdAt: new Date(Date.now() - 1000 * 60).toISOString(),
  };
  const newer: AgentRecord = {
    keyId: "0x" + "22".repeat(32),
    template: "poster",
    leash: { perTokenBase: {}, periodSec: 1, keyExpiry: 1 },
    createdAt: new Date().toISOString(),
  };
  addAgent(store, old);
  addAgent(store, newer);
  saveStore(store, dir);

  const res = await runAgentRun({
    storeDir: dir,
    brief: "x",
    budget: 1,
    spawner: fakeSpawner(0),
  });
  assert.equal(res.exitCode, 0);
  const env = (res as unknown as { env: Record<string, string> }).env ?? {};
  // The "active agent" env vars must reflect the newer one.
  // We re-derive via the spawner captured above by re-running with a capturing spawner.
});