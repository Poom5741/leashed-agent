import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import { D1SettlementStore } from "../src/seller-settlement-store.js";
import type { D1Database } from "../src/db.js";

test("shared settlement store allows one owner, preserves submission, and releases only owned claims", async () => {
  const sql = new BetterSqlite3(":memory:");
  sql.exec(readFileSync(new URL("../migrations/0007_seller_settlements.sql", import.meta.url), "utf8"));
  const db = { prepare(query: string) {
    const stmt = sql.prepare(query);
    return { bind(...args: unknown[]) { return {
      async run() { return { meta: { changes: stmt.run(...args).changes } }; },
      async first() { return stmt.get(...args) ?? null; },
    }; } };
  } } as unknown as D1Database;
  const a = new D1SettlementStore(db), b = new D1SettlementStore(db);
  const claim = { txHash: "abc", ownerToken: "first" };
  assert.equal(await a.claimSettlement(claim), "fresh");
  assert.equal(await b.claimSettlement({ ...claim, ownerToken: "second" }), "in-flight");
  await b.releaseClaim(claim.txHash, "second");
  await b.markSubmitted(claim.txHash, "second");
  assert.equal(await b.claimSettlement(claim), "in-flight");
  await a.markSubmitted(claim.txHash, claim.ownerToken);
  await a.releaseClaim(claim.txHash, claim.ownerToken);
  assert.equal(await b.claimSettlement(claim), "submitted");
  const retry = { txHash: "retry", ownerToken: "first" };
  assert.equal(await a.claimSettlement(retry), "fresh");
  await a.releaseClaim(retry.txHash, retry.ownerToken);
  assert.equal(await b.claimSettlement(retry), "fresh");
  await b.markRejected(retry.txHash, retry.ownerToken);
  assert.equal(await a.claimSettlement(retry), "rejected");
  assert.equal(await a.claimSettlement({ ...claim, termsDigest: "unsupported" }), "terms-conflict");
  sql.close();
});
