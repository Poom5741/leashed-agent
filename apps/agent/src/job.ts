/**
 * leashed-agent job runner — a Thai SME marketing job on a leash.
 *
 * Job: given a business brief, (1) pay an LLM for poster copy, (2) pay the
 * iApp image service for the rendered Thai-text poster. Every spend passes
 * the policy engine first; every settled payment becomes a Receipt in the
 * ledger (the dashboard's source of truth alongside the chain).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { evaluate, remainingBase, type Policy } from "@leashed/receipts";
import type { Receipt } from "@leashed/receipts";
import { createThaifiClient, lastJson } from "@leashed/payments-thaifi";

const LEDGER_PATH = process.env.LEDGER_PATH ?? join(homedir(), ".leashed", "ledger.json");
const THCFI = { symbol: "THCFI", decimals: 6 };
const LLM = "https://mpp.thaifi.com/llm/chat";
const POSTER = "https://mpp.thaifi.com/iapp/generate";

const POLICY: Policy = {
  maxPerPaymentBase: { THCFI: "2000000" }, // 2 THCFI per single payment
  maxTotalBase: { THCFI: "5000000" }, // 5 THCFI per job session
};

function loadLedger(): Receipt[] {
  if (!existsSync(LEDGER_PATH)) return [];
  return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Receipt[];
}

function saveLedger(receipts: Receipt[]): void {
  mkdirSync(LEDGER_PATH.slice(0, LEDGER_PATH.lastIndexOf("/")), { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(receipts, null, 2));
}

async function main(): Promise<void> {
  const brief = process.argv.slice(2).join(" ") ||
    "ร้านก๋วยเตี๋ยวเรือ โปรโมชั่นบะหมี่เกี๊ยวหมูแดง ลด 20% ทุกวันศุกร์";
  const ledger = loadLedger();
  const client = createThaifiClient();

  console.log("── leashed-agent ─────────────────────────────────");
  console.log(`brief: ${brief}`);
  console.log(`budget remaining: ${Number(remainingBase(POLICY, ledger, "THCFI")) / 1e6} THCFI\n`);

  // Step 1 — pay the LLM for poster copy (skippable when the LLM upstream is down).
  let copyJson: { headline?: string; subline?: string; scene?: string } = {};
  const posterOnly = process.env.JOB_MODE === "poster-only";
  if (posterOnly) {
    console.log("[1/2] LLM skipped (poster-only mode) — using brief as poster text\n");
    copyJson = { headline: brief.slice(0, 25), scene: brief };
  } else {
    const copyPrompt = {
      messages: [
        {
          role: "system",
          content:
            "You write Thai promo-poster copy. Reply ONLY with JSON: {\"headline\": \"<= 25 Thai chars\", \"subline\": \"<= 40 Thai chars\", \"scene\": \"one-line Thai image scene description\"}.",
        },
        { role: "user", content: brief },
      ],
      max_tokens: 300,
    };
    const gate1 = evaluate(POLICY, ledger, { rail: "thaifi-mpp", serviceId: "llm", token: THCFI, amountBase: "200000" });
    if (!gate1.allowed) {
      console.error(`LEASH REFUSED (llm): ${gate1.reason}`);
      process.exit(1);
    }
    console.log("[1/2] paying Qwen3.8 for poster copy (0.2 THCFI) …");
    const copy = await client.request(LLM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(copyPrompt),
    });
    if (copy.httpStatus !== 200 || !copy.receipt) {
      console.error(`LLM step failed (HTTP ${copy.httpStatus}):\n${copy.body.slice(0, 600)}`);
      process.exit(1);
    }
    ledger.push(copy.receipt);
    saveLedger(ledger);
    const completion = lastJson(copy.body) as { choices?: { message?: { content?: string } }[] } | null;
    const content = completion?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    try {
      copyJson = JSON.parse(jsonMatch?.[0] ?? "{}");
    } catch {
      console.error(`could not parse copy from model:\n${content.slice(0, 400)}`);
      process.exit(1);
    }
    console.log(`      copy: "${copyJson.headline}" / "${copyJson.subline}"`);
    console.log(`      receipt: ${copy.receipt.txUrl}\n`);
  }

  // Step 2 — pay iApp for the rendered poster.
  const gate2 = evaluate(POLICY, ledger, { rail: "thaifi-mpp", serviceId: "iapp", token: THCFI, amountBase: "1500000" });
  if (!gate2.allowed) {
    console.error(`LEASH REFUSED (iapp): ${gate2.reason}`);
    console.error(`note: raise the per-payment cap in POLICY to run the poster step`);
    process.exit(1);
  }
  console.log("[2/2] paying iApp for the Thai-text poster (1.5 THCFI) …");
  const poster = await client.request(
    POSTER,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: copyJson.scene ?? brief,
        text: copyJson.headline ?? brief.slice(0, 25),
        size: "1024x1024",
      }),
    },
    { purpose: "poster" },
  );
  if (poster.httpStatus !== 200 || !poster.receipt) {
    console.error(`poster step failed (HTTP ${poster.httpStatus}):\n${poster.body.slice(0, 600)}`);
    process.exit(1);
  }
  ledger.push(poster.receipt);
  saveLedger(ledger);
  const savedImg = poster.body.match(/Saved image → (.+)/)?.[1];
  console.log(`      poster: ${savedImg ?? "(see CLI output)"}`);
  console.log(`      receipt: ${poster.receipt.txUrl}\n`);

  // Session summary (the dashboard will render this from the ledger + chain).
  const spent = ledger.filter((r) => r.status === "paid").reduce((s, r) => s + BigInt(r.amountBase), 0n);
  console.log("── job complete ──────────────────────────────────");
  for (const r of ledger.slice(-2)) {
    console.log(`  ${r.status === "paid" ? "✔" : "✘"} ${r.serviceId.padEnd(8)} ${r.amountDisplay.padStart(10)}  ${r.txUrl}`);
  }
  console.log(`  spent this session: ${Number(spent) / 1e6} THCFI · remaining leash: ${Number(remainingBase(POLICY, ledger, "THCFI")) / 1e6} THCFI`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
