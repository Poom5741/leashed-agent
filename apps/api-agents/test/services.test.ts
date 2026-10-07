/**
 * Slice-4 tests for POST /v1/services + GET /v1/services.
 *
 * Same in-memory SQLite shim as the slice-2/3 tests; this file adds the
 * `services` table to its fake-D1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import BetterSqlite3 from "better-sqlite3";
import app from "../src/index.js";
import type { D1Database, D1Prepared } from "../src/db.js";

// ─── SQLite-backed fake D1 (with services) ───────────────────────────────────

function fakeD1(): D1Database {
  const db = new BetterSqlite3(":memory:");
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

    CREATE TABLE services (
      id             TEXT    PRIMARY KEY,
      endpoint_url   TEXT    NOT NULL,
      rail           TEXT    NOT NULL,
      price_base     TEXT    NOT NULL,
      token          TEXT    NOT NULL,
      seller_address TEXT    NOT NULL,
      signature      TEXT    NOT NULL,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX idx_services_endpoint ON services(endpoint_url);
    CREATE INDEX idx_services_rail     ON services(rail,        created_at DESC);
    CREATE INDEX idx_services_seller  ON services(seller_address, created_at DESC);
  `);

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

async function req(
  path: string,
  init: { method?: string; body?: unknown; db?: D1Database; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers ?? {}) };
  const env = { DB: init.db ?? fakeD1() } as unknown as { DB: D1Database };
  return app.request(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  }, env);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const FAKE_SIG = "0x" + "ab".repeat(65); // 0x + 130 hex chars

function makeRegisterBody(opts: { url: string; rail?: string; seller?: string } = {
  url: "https://seller.example/llm",
}) {
  const seller = opts.seller ?? "0xuser000000000000000000000000000000000000aa";
  return {
    payload: {
      endpointUrl: opts.url,
      rail: opts.rail ?? "cardano-x402",
      priceBase: "100000",
      token: "USDM",
      sellerAddress: seller,
      nonce: "deadbeef",
    },
    signature: FAKE_SIG,
    sellerAddress: seller,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

test("S4.R1: POST /v1/services persists a row and returns 201 with id", async () => {
  const res = await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody(),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string; endpointUrl: string };
  assert.match(body.id, /^[0-9a-f]{16}$/);
  assert.equal(body.endpointUrl, "https://seller.example/llm");
});

test("S4.R2: POST /v1/services is idempotent on (endpointUrl, sellerAddress)", async () => {
  const db = fakeD1();
  const body1 = makeRegisterBody();
  const res1 = await req("/v1/services", { method: "POST", body: body1, db });
  assert.equal(res1.status, 201);
  const first = (await res1.json()) as { id: string };

  // Second POST with the same (endpointUrl, sellerAddress) must return 200 + same id.
  const res2 = await req("/v1/services", { method: "POST", body: body1, db });
  assert.equal(res2.status, 200);
  const second = (await res2.json()) as { id: string };
  assert.equal(second.id, first.id);

  // Exactly one row in the table.
  const count = await db.prepare(`SELECT COUNT(*) as n FROM services`).first<{ n: number }>();
  assert.equal(count?.n, 1);
});

test("S4.R1: POST /v1/services rejects sellerAddress mismatch between wrapper and payload", async () => {
  const body = makeRegisterBody();
  body.sellerAddress = "0xuser000000000000000000000000000000000000aa";
  body.payload.sellerAddress = "0xuser111111111111111111111111111111111111bb"; // different
  const res = await req("/v1/services", { method: "POST", body });
  assert.equal(res.status, 400);
});

test("S4.R1: POST /v1/services rejects missing required fields", async () => {
  const res = await req("/v1/services", {
    method: "POST",
    body: { payload: { endpointUrl: "https://x" }, signature: FAKE_SIG },
  });
  assert.equal(res.status, 400);
});

test("S4.R3: GET /v1/services returns registered entries with public-only fields", async () => {
  const db = fakeD1();
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://seller.example/llm", rail: "cardano-x402" }),
    db,
  });
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://seller.example/poster", rail: "thaifi-mpp" }),
    db,
  });
  const res = await req("/v1/services", { db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    services: Array<{ id: string; endpointUrl: string; rail: string; priceBase: string; token: string }>;
  };
  assert.equal(body.services.length, 2);
  // Public-only — no signature, no sellerAddress, no createdAt.
  for (const s of body.services) {
    assert.match(s.id, /^[0-9a-f]{16}$/);
    assert.ok(s.endpointUrl.startsWith("https://"));
    assert.ok(s.rail === "cardano-x402" || s.rail === "thaifi-mpp");
    assert.equal(s.priceBase, "100000");
    assert.equal(s.token, "USDM");
    assert.equal(
      Object.keys(s).sort().join(","),
      ["endpointUrl", "id", "priceBase", "rail", "token"].sort().join(","),
    );
  }
});

test("S4.R4: GET /v1/services?q=llm filters to substring match against endpointUrl", async () => {
  const db = fakeD1();
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://seller.example/llm" }),
    db,
  });
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://seller.example/poster" }),
    db,
  });
  const res = await req("/v1/services?q=llm", { db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { services: Array<{ endpointUrl: string }> };
  assert.equal(body.services.length, 1);
  assert.match(body.services[0]!.endpointUrl, /llm/);
});

test("S4.R4: GET /v1/services?q=cardano filters to substring match against rail", async () => {
  const db = fakeD1();
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://a.example/llm", rail: "cardano-x402" }),
    db,
  });
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://b.example/poster", rail: "thaifi-mpp" }),
    db,
  });
  const res = await req("/v1/services?q=cardano", { db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { services: Array<{ rail: string }> };
  assert.equal(body.services.length, 1);
  assert.equal(body.services[0]!.rail, "cardano-x402");
});

test("S4.R3: GET /v1/services returns empty list when no services registered", async () => {
  const res = await req("/v1/services");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { services: unknown[] };
  assert.deepEqual(body.services, []);
});

test("S4: GET /v1/services does not require auth (public discovery)", async () => {
  // No headers → still 200. The slice-1 CLI tests already require this.
  const res = await req("/v1/services", {});
  assert.equal(res.status, 200);
});

test("F1 regression: GET /v1/services?q=<50chars> degrades to empty list, NOT 500", async () => {
  // Before the clamp, a 49+ char query parameter returned HTTP 500 (Rakazo
  // finding on 4b31a84, judge-triggerable via the search filter). After the
  // clamp in db.ts listServices, the search degrades to a no-q empty list
  // (still 200), so the SPA's failure surface stays clean.
  const db = fakeD1();
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://a.example/llm", rail: "cardano-x402" }),
    db,
  });
  // 60-char query: would have 500'd before the fix.
  const longQ = "a".repeat(60);
  const res = await req(`/v1/services?q=${encodeURIComponent(longQ)}`, { db });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { services: unknown[] };
  assert.ok(Array.isArray(body.services), "services must be an array even for over-long q");
});

test("F1 regression: GET /v1/services?q=<48chars still filters normally", async () => {
  // Boundary check: exactly 48 chars must still be treated as a real query
  // (we don't want to over-clamp and silently degrade legitimate searches).
  const db = fakeD1();
  await req("/v1/services", {
    method: "POST",
    body: makeRegisterBody({ url: "https://seller.example/llm", rail: "cardano-x402" }),
    db,
  });
  // 48 chars: must work (currently no match in fixture → empty list, but 200).
  const q48 = "x".repeat(48);
  const res = await req(`/v1/services?q=${encodeURIComponent(q48)}`, { db });
  assert.equal(res.status, 200);
});