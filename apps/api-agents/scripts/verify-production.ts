/** One paid production call; use a real paid receipt as the input. */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createCardanoPayer } from "../../../packages/payments-cardano/src/client.js";

const endpoint = "https://leashed-api-agents.poom-a1d.workers.dev/verify-receipt";
const receiptFile = process.env.RECEIPT_FILE;
const mnemonic = process.env.CARDANO_CLIENT_MNEMONIC;
const projectId = process.env.BLOCKFROST_API_KEY_PREPROD;
if (!receiptFile || !mnemonic || !projectId) {
  throw new Error("Set RECEIPT_FILE, CARDANO_CLIENT_MNEMONIC, and BLOCKFROST_API_KEY_PREPROD");
}
const input = JSON.parse(readFileSync(receiptFile, "utf8"));
const receipt = Array.isArray(input) ? input[0] : input;
assert.ok(receipt?.id && receipt.status === "paid", "Input must be a paid receipt");
const request = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(receipt) };
const unpaid = await fetch(endpoint, request);
assert.equal(unpaid.status, 402, "Production seller must enforce payment");
const required = JSON.parse(Buffer.from(unpaid.headers.get("payment-required")!, "base64").toString());
assert.equal(required.accepts[0].amount, "100000");
assert.equal(required.accepts[0].network, "cardano:preprod");
assert.equal(required.accepts[0].payTo, "addr_test1qpp9lasgrs65nnxftsd209zre9ygqe3peweujljkt04hxe49ngjh2lm9snn4xp6h5hwj866wc7umsyn2rcg960735z2quxf8pp");
const payer = createCardanoPayer({ mnemonic, provider: { blockfrost: { baseUrl: "https://cardano-preprod.blockfrost.io/api/v0", projectId } } });
const paid = await payer.payFetch(endpoint, request);
assert.equal(paid.response.status, 200, `Paid call failed: ${paid.body}`);
const verdict = JSON.parse(paid.body);
assert.equal(verdict.valid, true);
assert.equal(paid.settlement?.success, true);
assert.match(paid.settlement?.transaction ?? "", /^[a-f0-9]{64}$/);
const evidence = {
  observedAt: new Date().toISOString(), verifierUrl: endpoint,
  unpaidStatus: unpaid.status, paidStatus: paid.response.status,
  verdict, settlement: paid.settlement,
  explorerUrl: `https://preprod.cardanoscan.io/transactions/${paid.settlement!.transaction}`,
};
const output = process.env.EVIDENCE_FILE ?? "/tmp/leashed-worker-x402-evidence.json";
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
console.log(`Evidence saved to ${output}`);
