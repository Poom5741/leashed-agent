import { test } from "node:test";
import assert from "node:assert/strict";
import type { FacilitatorClient } from "@x402/core/server";
import { createReceiptSeller, SELLER_NETWORK, DEFAULT_SELLER_ADDRESS } from "../src/receipt-seller.js";
import app from "../src/index.js";

const receipt = { id: "poster-1", rail: "thaifi-mpp", amountBase: "100000", status: "paid" };
function harness(valid = true, settled = true) {
  let settlements = 0;
  const facilitator: FacilitatorClient = {
    getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: "exact", network: SELLER_NETWORK }], extensions: [], signers: {} }),
    verify: async () => ({ isValid: valid, ...(valid ? {} : { invalidReason: "invalid_payment" }) }),
    settle: async () => { settlements++; return { success: settled, transaction: "a".repeat(64), network: SELLER_NETWORK, ...(settled ? {} : { errorReason: "settlement_failed" }) }; },
  };
  const seller = createReceiptSeller(() => facilitator);
  const env = { BLOCKFROST_API_KEY_PREPROD: "test-only" };
  const request = (body: unknown, payment?: unknown) => seller.request("https://seller.example/verify-receipt", {
    method: "POST", headers: { "Content-Type": "application/json", ...(payment ? { "Payment-Signature": Buffer.from(JSON.stringify(payment)).toString("base64") } : {}) }, body: JSON.stringify(body),
  }, env);
  const payment = async () => {
    const probe = await request(receipt);
    assert.equal(probe.status, 402);
    const required = JSON.parse(Buffer.from(probe.headers.get("payment-required")!, "base64").toString()) as { accepts: unknown[] };
    return { x402Version: 2, accepted: required.accepts[0], payload: {} };
  };
  return { request, payment, settlements: () => settlements };
}

test("unpaid receipt returns exact Cardano price and public resource URL", async () => {
  const h = harness();
  const res = await h.request(receipt);
  assert.equal(res.status, 402);
  assert.ok(res.headers.get("payment-required"));
  const body = JSON.parse(Buffer.from(res.headers.get("payment-required")!, "base64").toString()) as { resource: { url: string }; accepts: Array<{ amount: string; network: string; payTo: string }> };
  assert.equal(body.resource.url, "https://seller.example/verify-receipt");
  assert.equal(body.accepts[0]!.amount, "100000");
  assert.equal(body.accepts[0]!.network, SELLER_NETWORK);
  assert.equal(body.accepts[0]!.payTo, DEFAULT_SELLER_ADDRESS);
  assert.equal(h.settlements(), 0);
});
test("verified and settled payment releases verdict with settlement header", async () => {
  const h = harness();
  const res = await h.request(receipt, await h.payment());
  assert.equal(res.status, 200);
  assert.equal((await res.json() as { valid: boolean }).valid, true);
  const settlement = JSON.parse(Buffer.from(res.headers.get("payment-response")!, "base64").toString());
  assert.equal(settlement.success, true);
  assert.equal(settlement.transaction, "a".repeat(64));
  assert.equal(h.settlements(), 1);
});
test("invalid payment cannot access verdict or settle", async () => {
  const h = harness(false);
  const res = await h.request(receipt, await h.payment());
  assert.equal(res.status, 402);
  assert.equal(h.settlements(), 0);
});
test("failed settlement never releases a successful verdict", async () => {
  const h = harness(true, false);
  const res = await h.request(receipt, await h.payment());
  assert.equal(res.status, 402);
  assert.notEqual((await res.json() as { valid?: boolean }).valid, true);
});
test("invalid receipt returns 422 without broadcasting a payment", async () => {
  const h = harness();
  const res = await h.request({ ...receipt, amountBase: "-1" }, await h.payment());
  assert.equal(res.status, 422);
  assert.equal(h.settlements(), 0);
});
test("unconfigured seller fails closed without affecting API health", async () => {
  const seller = createReceiptSeller();
  assert.equal((await seller.request("/verify-receipt", { method: "POST" }, {})).status, 503);
  assert.equal((await seller.request("/seller/health", {}, {})).status, 503);
  assert.equal((await app.request("/api/healthz", {}, {} as never)).status, 200);
});
test("browser preflight permits payment signature and exposes x402 headers", async () => {
  const res = await app.request("/verify-receipt", { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Payment-Signature" } }, {} as never);
  assert.equal(res.status, 204);
  assert.match(res.headers.get("access-control-allow-headers")!, /Payment-Signature/i);
});
