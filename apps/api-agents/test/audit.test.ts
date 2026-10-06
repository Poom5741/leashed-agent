/**
 * Slice-3 tests for POST /api/audit + the latestAudit extension to
 * GET /api/agents/:keyId/passbook.
 *
 * Reuses the same in-memory SQLite shim as agents.test.ts — the
 * agent_audit_batches migration is applied inline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import BetterSqlite3 from "better-sqlite3";
import app from "../src/index.js";
import type { D1Database, D1Prepared } from "../src/db.js";

// ─── SQLite-backed fake D1 (with agent_audit_batches) ────────────────────────

function fakeD1(): D1Database {
  const db = new BetterSqlite3(":memory:");
  // Upstream migrations 0001 + 0002 + slice-2 0003 + slice-3 0004.
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      picture TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (provider, provider_id)
    );
    CREATE TABLE otp_tokens (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE backups (
      user_id TEXT NOT NULL,
      address TEXT NOT NULL,
      backup TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, address)
    );
    CREATE TABLE agent_pairings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      code TEXT NOT NULL,
      key_id TEXT NOT NULL,
      key_type TEXT NOT NULL DEFAULT 'p256',
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      user_address TEXT,
      expiry INTEGER,
      limit_amount TEXT,
      limit_period INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_pairings_user ON agent_pairings (user_id, status);
    CREATE INDEX idx_pairings_key ON agent_pairings (key_id, status);
    ALTER TABLE agent_pairings ADD COLUMN template TEXT NOT NULL DEFAULT 'legacy';

    CREATE TABLE agent_audit_batches (
      id             TEXT    PRIMARY KEY,
      key_id         TEXT    NOT NULL,
      user_id        TEXT    NOT NULL,
      verdict        TEXT    NOT NULL CHECK (verdict IN ('PASS','WARN','FAIL')),
      checked_count  INTEGER NOT NULL,
      total_base     INTEGER NOT NULL DEFAULT 0,
      other_base     INTEGER NOT NULL DEFAULT 0,
      problems_json  TEXT    NOT NULL DEFAULT '[]',
      attestation_tx TEXT,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX idx_audit_batches_key  ON agent_audit_batches(key_id,  created_at DESC);
    CREATE INDEX idx_audit_batches_user ON agent_audit_batches(user_id, created_at DESC);
  `);

  db.prepare(
    `INSERT INTO users (id, provider, provider_id, email, display_name, picture, created_at)
     VALUES ('user_alice', 'email', 'alice@example.com', 'alice@example.com', 'Alice', NULL, 1700000000000)`,
  ).run();

  const wrapped: D1Database = {
    prepare(sql: string): D1Prepared {
      const stmt = db.prepare(sql);
      let bound: unknown[] = [];
      const builder: D1Prepared = {
        bind: (...args: unknown[]) => {
          bound = args;
          return builder;
        },
        first: async <T>() => {
          const row = stmt.get(...bound);
          return (row ?? null) as T | null;
        },
        all: async <T>() => {
          const rows = stmt.all(...bound);
          return { results: rows as unknown as T[] };
        },
        run: async () => {
          const info = stmt.run(...bound);
          return { meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
        },
      };
      return builder;
    },
  };
  return wrapped;
}

function seed(db: D1Database, agents: Array<{
  id: string;
  user_id: string;
  key_id: string;
  status: string;
  template: string;
  limit_amount?: string;
  limit_period?: number;
}>): void {
  for (const a of agents) {
    db.prepare(
      `INSERT INTO agent_pairings
         (id, user_id, code, key_id, key_type, name, status, user_address,
           expiry, limit_amount, limit_period, template, created_at)
       VALUES (?, ?, '123456', ?, 'p256', '', ?, NULL, NULL, ?, ?, ?, ?)`,
    ).bind(
      a.id, a.user_id, a.key_id, a.status,
      a.limit_amount ?? null,
      a.limit_period ?? null,
      a.template,
      Date.now(),
    ).run();
  }
}

async function req(
  path: string,
  init: { method?: string; userId?: string; body?: unknown; db?: D1Database } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.userId) headers["X-Stub-User"] = init.userId;
  const env = { DB: init.db ?? fakeD1() } as unknown as { DB: D1Database };
  return app.request(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  }, env);
}

// ─── tests ───────────────────────────────────────────────────────────────────

test("S3.R1: POST /api/audit on an empty passbook returns verdict=WARN and writes a row", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop", limit_amount: "2000000", limit_period: 2592000 },
  ]);
  const res = await req("/api/audit", {
    method: "POST",
    userId: "user_alice",
    db,
    body: { keyId: "0xaa" },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    keyId: string;
    verdict: string;
    checked: number;
    totalBase: number;
    otherBase: number;
    problems: string[];
    attestationTx: string | null;
    batchId: string;
    createdAt: number;
  };
  assert.equal(body.keyId, "0xaa");
  assert.equal(body.verdict, "WARN");
  assert.equal(body.checked, 0);
  assert.equal(body.totalBase, 0);
  assert.deepEqual(body.problems, []);
  assert.equal(body.attestationTx, null);
  assert.match(body.batchId, /^[0-9a-f-]{36}$/i);
  assert.ok(typeof body.createdAt === "number" && body.createdAt > 0);

  // S3.R2: row landed in agent_audit_batches with the expected shape.
  const row = await db.prepare(
    `SELECT id, key_id, user_id, verdict, checked_count, total_base,
            other_base, problems_json, attestation_tx, created_at
       FROM agent_audit_batches
       WHERE id = ?`,
  ).bind(body.batchId).first<{
    id: string; key_id: string; user_id: string; verdict: string;
    checked_count: number; total_base: number; other_base: number;
    problems_json: string; attestation_tx: string | null; created_at: number;
  }>();
  assert.ok(row, "audit row should exist");
  assert.equal(row?.key_id, "0xaa");
  assert.equal(row?.user_id, "user_alice");
  assert.equal(row?.verdict, "WARN");
  assert.equal(row?.checked_count, 0);
  assert.equal(row?.attestation_tx, null);
  assert.equal(row?.problems_json, "[]");
});

test("S3.R1: POST /api/audit with a forged receipt returns verdict=FAIL", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop" },
  ]);
  const res = await req("/api/audit", {
    method: "POST",
    userId: "user_alice",
    db,
    body: {
      keyId: "0xaa",
      receipts: [
        {
          id: "0xbad",
          rail: "cardano-x402",
          status: "pending", // wrong status — auditor flags it
          amountBase: "1500000",
          token: { symbol: "USDM" },
          txHash: "0x" + "f".repeat(64),
          txUrl: "https://example.invalid",
        },
      ],
    },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { verdict: string; problems: string[] };
  assert.equal(body.verdict, "FAIL");
  assert.ok(body.problems.some((p) => p.includes("status pending")));
});

test("S3.R1: POST /api/audit on a valid receipt returns PASS", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop" },
  ]);
  const validTx = "0x" + "f".repeat(64);
  const res = await req("/api/audit", {
    method: "POST",
    userId: "user_alice",
    db,
    body: {
      keyId: "0xaa",
      receipts: [
        {
          id: "0xgood",
          rail: "thaifi-mpp",
          status: "paid",
          amountBase: "1500000",
          token: { symbol: "THCFI" },
          txHash: validTx,
          txUrl: "https://exp.thaifi.com/tx/" + validTx,
        },
      ],
    },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { verdict: string; checked: number; totalBase: number };
  assert.equal(body.verdict, "PASS");
  assert.equal(body.checked, 1);
  assert.equal(body.totalBase, 1500000);
});

test("S3.R1: POST /api/audit without X-Stub-User returns 401", async () => {
  const res = await req("/api/audit", {
    method: "POST",
    body: { keyId: "0xaa" },
  });
  assert.equal(res.status, 401);
});

test("S3.R1: POST /api/audit with unknown keyId returns 404", async () => {
  const res = await req("/api/audit", {
    method: "POST",
    userId: "user_alice",
    body: { keyId: "0xghost" },
  });
  assert.equal(res.status, 404);
});

test("S3.R3: GET /api/agents/:keyId/passbook returns latestAudit field when one exists", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop" },
  ]);
  // Run the audit so a row exists.
  await req("/api/audit", {
    method: "POST",
    userId: "user_alice",
    db,
    body: { keyId: "0xaa" },
  });
  const res = await req("/api/agents/0xaa/passbook", { userId: "user_alice", db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    latestAudit: { verdict: string; checked: number; batchId: string; createdAt: number } | null;
  };
  assert.ok(body.latestAudit, "latestAudit must be present after a POST /api/audit");
  assert.equal(body.latestAudit?.verdict, "WARN");
  assert.equal(body.latestAudit?.checked, 0);
  assert.match(body.latestAudit?.batchId ?? "", /^[0-9a-f-]{36}$/i);
});

test("S3.R3: passbook's latestAudit is null when no audit has been run", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop" },
  ]);
  const res = await req("/api/agents/0xaa/passbook", { userId: "user_alice", db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { latestAudit: unknown | null };
  assert.equal(body.latestAudit, null);
});