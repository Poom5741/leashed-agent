import { test } from "node:test";
import assert from "node:assert/strict";
import { createThaifiClient, lastJson, type Runner } from "../src/index.js";

const PAID_OUTPUT = `402 — paying $1.5 to 0xabc0000000000000000000000000000000000001 …
Gas:   pathUSD
Paid. Tx: 0x1111111111111111111111111111111111111111111111111111111111111111
← HTTP 200
{
  "image_base64": "shouldnotmatter",
  "status": "ok"
}
`;

function mockRunner(outputs: { code: number; stdout: string }[], captured: string[][]): Runner {
  let i = 0;
  return async (args) => {
    captured.push(args);
    return outputs[Math.min(i++, outputs.length - 1)];
  };
}

test("parses a paid 402→pay→retry call into a receipt", async () => {
  const captured: string[][] = [];
  const client = createThaifiClient({
    runner: mockRunner([{ code: 0, stdout: PAID_OUTPUT }], captured),
    now: () => new Date("2026-10-06T04:00:00Z"),
  });
  const res = await client.request("https://mpp.thaifi.com/iapp/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"prompt":"แมวส้ม"}',
    maxSpend: 2,
  });
  assert.equal(res.httpStatus, 200);
  assert.ok(res.receipt);
  assert.equal(res.receipt.status, "paid");
  assert.equal(res.receipt.rail, "thaifi-mpp");
  assert.equal(res.receipt.amountBase, "1500000"); // $1.5 × 1e6
  assert.equal(res.receipt.payTo, "0xabc0000000000000000000000000000000000001");
  assert.equal(res.receipt.txHash, "0x" + "1".repeat(64));
  assert.equal(res.receipt.txUrl, "https://exp.thaifi.com/tx/0x" + "1".repeat(64));
  assert.equal(res.receipt.createdAt, "2026-10-06T04:00:00.000Z");
  // CLI invocation carries the method/body/max-spend
  const args = captured[0];
  assert.ok(args.includes("POST") && args.includes("--max-spend") && args.join(" ").includes("แมวส้ม"));
});

test("a direct 200 (no payment) yields no receipt", async () => {
  const client = createThaifiClient({
    runner: mockRunner([{ code: 0, stdout: "← HTTP 200\n{\"services\":[]}" }], []),
  });
  const res = await client.request("https://mpp.thaifi.com/services");
  assert.equal(res.httpStatus, 200);
  assert.equal(res.receipt, null);
  assert.deepEqual(lastJson(res.body), { services: [] });
});

test("max-spend abort surfaces a non-zero status and no receipt", async () => {
  const client = createThaifiClient({
    runner: mockRunner(
      [{ code: 1, stdout: "", stderr: "Payment of $5 exceeds --max-spend $1 — aborting." }],
      [],
    ),
  });
  const res = await client.request("https://mpp.thaifi.com/qwen/generate", { maxSpend: 1 });
  assert.equal(res.httpStatus, 0);
  assert.equal(res.receipt, null);
  assert.match(res.body, /max-spend/);
});

test("dryRun never passes a payment flag", async () => {
  const captured: string[][] = [];
  const client = createThaifiClient({
    runner: mockRunner([{ code: 0, stdout: "→ POST url" }], captured),
  });
  await client.dryRun("https://mpp.thaifi.com/llm/chat", { method: "POST" });
  const args = captured[0].join(" ");
  assert.ok(args.includes("--dry-run"));
  assert.ok(!args.includes("--max-spend"));
});
