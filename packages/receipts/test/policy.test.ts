import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, remainingBase } from "../src/policy.js";
import type { Receipt } from "../src/schema.js";

const THCFI = { symbol: "THCFI", decimals: 6 };
const policy = {
  maxPerPaymentBase: { THCFI: "2000000" }, // 2 THCFI per payment
  maxTotalBase: { THCFI: "10000000" }, // 10 THCFI total
};

function paid(amountBase: string, serviceId = "llm"): Receipt {
  return {
    id: crypto.randomUUID(),
    rail: "thaifi-mpp",
    serviceId,
    purpose: "test",
    token: THCFI,
    amountBase,
    amountDisplay: "0.2 THCFI",
    payTo: "0xseller",
    status: "paid",
    createdAt: new Date().toISOString(),
  };
}

test("allows a payment within all caps", () => {
  const v = evaluate(policy, [], { rail: "thaifi-mpp", serviceId: "llm", token: THCFI, amountBase: "200000" });
  assert.deepEqual(v, { allowed: true });
});

test("refuses payment over the per-payment cap", () => {
  const v = evaluate(policy, [], { rail: "thaifi-mpp", serviceId: "llm", token: THCFI, amountBase: "2000001" });
  assert.equal(v.allowed, false);
  if (!v.allowed) assert.match(v.reason, /per-payment cap/);
});

test("refuses unknown token", () => {
  const v = evaluate(policy, [], { rail: "cardano-x402", serviceId: "poster", token: { symbol: "tUSDM", decimals: 6 }, amountBase: "100000" });
  assert.equal(v.allowed, false);
  if (!v.allowed) assert.match(v.reason, /not in the policy/);
});

test("refuses service not on the allowlist", () => {
  const v = evaluate({ ...policy, allowedServices: ["llm"] }, [], { rail: "thaifi-mpp", serviceId: "poster", token: THCFI, amountBase: "1" });
  assert.equal(v.allowed, false);
  if (!v.allowed) assert.match(v.reason, /allowlist/);
});

test("counts only paid receipts toward the total cap", () => {
  const history = [paid("9000000"), { ...paid("9000000"), status: "failed" as const }];
  const v = evaluate(policy, history, { rail: "thaifi-mpp", serviceId: "llm", token: THCFI, amountBase: "1000000" });
  assert.deepEqual(v, { allowed: true });
  const v2 = evaluate(policy, [paid("9000000")], { rail: "thaifi-mpp", serviceId: "llm", token: THCFI, amountBase: "1000001" });
  assert.equal(v2.allowed, false);
  if (!v2.allowed) assert.match(v2.reason, /total cap/);
});

test("remainingBase never goes negative", () => {
  const history = [paid("9000000")];
  assert.equal(remainingBase(policy, history, "THCFI"), 1000000n);
  assert.equal(remainingBase(policy, [paid("10000000")], "THCFI"), 0n);
});
