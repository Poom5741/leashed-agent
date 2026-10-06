/**
 * Slice-2 tests for the /agents collection.
 *
 * Uses an in-memory SQLite database via better-sqlite3 wrapped in a thin
 * shim that matches our D1Database interface (prepare/bind/first/all/run).
 * better-sqlite3 actually executes SQL, so the same statements the real D1
 * will run work here without parser tricks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import BetterSqlite3 from "better-sqlite3";
import app from "../src/index.js";
import type { D1Database, D1Prepared } from "../src/db.js";

// ─── SQLite-backed fake D1 ──────────────────────────────────────────────────

function fakeD1(): D1Database {
  const db = new BetterSqlite3(":memory:");
  // Apply the upstream 0001 + 0002 + slice-2 0003 migrations.
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
    CREATE INDEX idx_users_email ON users (email);
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

    -- Slice 3 — POST /api/audit results. The slice-2 passbook endpoint
    -- queries this table on every read, so its schema must be present in
    -- every fake D1 the slice-2 tests instantiate.
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
  // Seed one user so the user_id FK target is realistic (no actual FK, but
  // the test helpers mirror the upstream shape).
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
  expiry?: number;
  user_address?: string;
}>): void {
  for (const a of agents) {
    db.prepare(
      `INSERT INTO agent_pairings
         (id, user_id, code, key_id, key_type, name, status, user_address,
           expiry, limit_amount, limit_period, template, created_at)
       VALUES (?, ?, '123456', ?, 'p256', '', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      a.id, a.user_id, a.key_id, a.status,
      a.user_address ?? null,
      a.expiry ?? null,
      a.limit_amount ?? null,
      a.limit_period ?? null,
      a.template,
      Date.now(),
    ).run();
  }
}

// ─── request helper ─────────────────────────────────────────────────────────

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

// ─── tests ──────────────────────────────────────────────────────────────────

test("auth: missing X-Stub-User returns 401", async () => {
  const res = await req("/api/agents");
  assert.equal(res.status, 401);
});

test("S2.R1: POST /api/agents creates a new agent with template='noodle-shop'", async () => {
  const res = await req("/api/agents", {
    method: "POST",
    userId: "user_alice",
    body: {
      template: "noodle-shop",
      keyId: "0xabc",
      leash: { limitAmount: "2000000", limitPeriod: 2592000, expiry: 1893456000 },
    },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { id: string; keyId: string; template: string; status: string };
  assert.match(body.id, /^[0-9a-f-]{36}$/i);
  assert.equal(body.keyId, "0xabc");
  assert.equal(body.template, "noodle-shop");
  assert.equal(body.status, "pending");
});

test("S2.R2: GET /api/agents returns the user's agents only (no cross-user leak)", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop" },
    { id: "a2", user_id: "user_alice", key_id: "0xab", status: "approved", template: "poster" },
    { id: "b1", user_id: "user_bob",   key_id: "0xbb", status: "approved", template: "audit-bot" },
  ]);
  const res = await req("/api/agents", { userId: "user_alice", db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { agents: Array<{ keyId: string }> };
  assert.equal(body.agents.length, 2);
  assert.ok(body.agents.every((a) => a.keyId !== "0xbb"), "must not leak user_bob's agent");
});

test("S2.R3: GET /api/agents/:keyId/passbook returns leaseState + receipts", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop", limit_amount: "100", limit_period: 86400 },
  ]);
  const res = await req("/api/agents/0xaa/passbook", { userId: "user_alice", db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { keyId: string; leaseState: string; receipts: unknown[] };
  assert.equal(body.keyId, "0xaa");
  assert.equal(body.leaseState, "ok");
  assert.deepEqual(body.receipts, []);
});

test("S2.R3: passbook returns 404 for an unknown keyId", async () => {
  const res = await req("/api/agents/0xghost/passbook", { userId: "user_alice" });
  assert.equal(res.status, 404);
});

test("S2.R4: DELETE /api/agents/:keyId marks status='revoked'", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "approved", template: "noodle-shop" },
  ]);
  const res = await req("/api/agents/0xaa", { method: "DELETE", userId: "user_alice", db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { keyId: string; status: string; revoked: boolean };
  assert.equal(body.keyId, "0xaa");
  assert.equal(body.status, "revoked");
  assert.equal(body.revoked, true);
});

test("S2.R4: DELETE on an already-revoked keyId is idempotent", async () => {
  const db = fakeD1();
  seed(db, [
    { id: "a1", user_id: "user_alice", key_id: "0xaa", status: "revoked", template: "noodle-shop" },
  ]);
  const res = await req("/api/agents/0xaa", { method: "DELETE", userId: "user_alice", db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string; revoked: boolean };
  assert.equal(body.status, "revoked");
  assert.equal(body.revoked, false);
});

test("S2.R7: schema has 12 columns including template (default 'legacy')", async () => {
  const db = fakeD1();
  // Insert without specifying template; should default to 'legacy'.
  db.prepare(
    `INSERT INTO agent_pairings
       (id, user_id, code, key_id, key_type, name, status, created_at)
     VALUES ('legacy_1', 'user_alice', '0', '0xlegacy', 'p256', '', 'approved', 1700000000000)`,
  ).run();
  const row = await db.prepare(`SELECT template FROM agent_pairings WHERE id='legacy_1'`).first<{ template: string }>();
  assert.equal(row?.template, "legacy");
});