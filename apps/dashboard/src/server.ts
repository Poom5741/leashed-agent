/**
 * Oversight dashboard API — the human's window onto the leashed agent.
 * Reads only verifiable sources: the receipt ledger + on-chain truth
 * (thaifi whoami spend limits, Blockfrost balances). Serves the SPA.
 */
import express from "express";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAuditorVerdict } from "./auditor.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const PORT = Number(process.env.DASHBOARD_PORT ?? 4030);
const LEDGER_PATH = process.env.LEDGER_PATH ?? join(homedir(), ".leashed", "ledger.json");

const envText = existsSync(join(ROOT, ".env")) ? readFileSync(join(ROOT, ".env"), "utf8") : "";
const envGet = (k: string) => envText.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m"))?.[1];

const app = express();
app.use(express.json());

let whoamiCache: { at: number; text: string } | null = null;
function thaifiWhoami(): Promise<string> {
  if (whoamiCache && Date.now() - whoamiCache.at < 15_000) return Promise.resolve(whoamiCache.text);
  return new Promise((resolve) => {
    execFile("npx", ["-y", "thaifi-wallet-cli", "whoami"], { timeout: 20_000 }, (_e, stdout) => {
      whoamiCache = { at: Date.now(), text: stdout };
      resolve(stdout);
    });
  });
}

async function blockfrost(address: string) {
  const key = envGet("BLOCKFROST_API_KEY_PREPROD");
  if (!key) return null;
  try {
    const res = await fetch(`https://cardano-preprod.blockfrost.io/api/v0/addresses/${address}/extended`, {
      headers: { project_id: key },
    });
    return (await res.json()) as { amount?: { unit: string; quantity: string }[] };
  } catch {
    return null;
  }
}

app.get("/api/state", async (_req, res) => {
  const ledger = existsSync(LEDGER_PATH) ? (JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as unknown[]) : [];
  const [whoami, cardano] = await Promise.all([
    thaifiWhoami(),
    blockfrost(envGet("CARDANO_CLIENT_ADDRESS") ?? "addr_test1qr7yx9hyhumrlh2thm5ttdckdhgqjj43xpjrvxczctgkn3vtsa735q8tjczwf9jk7h3zjas70damh6vgtetd0s33xyyqm274nc"),
  ]);
  const auditor = readAuditorVerdict(join(ROOT, "docs", "auditor-latest.json"));
  const clientAddr = envGet("CARDANO_CLIENT_ADDRESS") ?? "addr_test1qr7yx9hyhumrlh2thm5ttdckdhgqjj43xpjrvxczctgkn3vtsa735q8tjczwf9jk7h3zjas70damh6vgtetd0s33xyyqm274nc";
  const tUSDM = (cardano?.amount ?? []).find((a) => a.unit.endsWith("0014df10745553444d"))?.quantity ?? "0";
  const tADA = (cardano?.amount ?? []).find((a) => a.unit === "lovelace")?.quantity ?? "0";
  res.json({
    agent: {
      account: whoami.match(/Account:\s+(\S+)/)?.[1] ?? null,
      key: whoami.match(/Agent key:\s+(\S+)/)?.[1] ?? null,
      limitLeft: whoami.match(/Limit left:\s+(.+)/)?.[1]?.trim() ?? null,
      expires: whoami.match(/Key expires:\s+(\S+)/)?.[1] ?? null,
    },
    thaifiBalances: {
      THCFI: whoami.match(/THCFI:\s+([\d.]+)/)?.[1] ?? null,
      pathUSD: whoami.match(/pathUSD:\s+\$([\d.]+)/)?.[1] ?? null,
    },
    cardano: { address: clientAddr, tADA: String(Number(tADA) / 1e6), tUSDM: String(Number(tUSDM) / 1e6) },
    receipts: ledger,
    auditor,
    sources: { ledger: LEDGER_PATH, thaifi: "wallet.thaifi.com on-chain limits", cardano: "Blockfrost preprod" },
    updatedAt: new Date().toISOString(),
  });
});

// ---- Agent Console: run the agent from the browser ----
import { spawn as spawnProc } from "node:child_process";
let job: { running: boolean; output: string; startedAt?: string } = { running: false, output: "" };
app.post("/api/job", (req, res) => {
  if (job.running) { res.status(409).json({ error: "job already running" }); return; }
  const brief = (req.body?.brief as string) || "ร้านก๋วยเตี๋ยวเรือ โปรโมชั่นบะหมี่เกี๊ยวหมูแดง ลด 20% ทุกวันศุกร์";
  const mode = req.body?.mode === "poster-only" ? "poster-only" : "full";
  job = { running: true, output: "", startedAt: new Date().toISOString() };
  res.json({ started: true });
  const child = spawnProc("npx", ["tsx", "src/job.ts", brief], {
    cwd: join(ROOT, "apps", "agent"),
    env: { ...process.env, LEDGER_PATH, JOB_MODE: mode },
  });
  child.stdout.on("data", (d) => (job.output += d));
  child.stderr.on("data", (d) => (job.output += d));
  child.on("close", (code) => { job.running = false; job.output += `\n[exit ${code}]`; });
});
app.get("/api/job", (_req, res) => res.json(job));

// ---- Audit: re-run the CRE auditor from the browser ----
let auditRun: { running: boolean; output: string } = { running: false, output: "" };
app.post("/api/audit", (_req, res) => {
  if (auditRun.running) { res.status(409).json({ error: "audit already running" }); return; }
  auditRun = { running: true, output: "" };
  res.json({ started: true });
  const child = spawnProc("/bin/zsh", ["-lc", `export PATH="$HOME/.cre/bin:$PATH"; cd '${join(ROOT, "workflows", "leashed-auditor")}' && cre workflow simulate auditor --target staging-settings --non-interactive --trigger-index 0 2>&1`]);
  child.stdout.on("data", (d) => (auditRun.output += d));
  child.stderr.on("data", (d) => (auditRun.output += d));
  child.on("close", (code) => {
    auditRun.running = false;
    const m = auditRun.output.match(/\{"verdict"[\s\S]*?\}/);
    if (m) {
      try {
        const verdict = JSON.parse(m[0]);
        verdict.attestationTx = "simulated — see docs/cre-auditor-evidence.txt";
        writeFileSync(join(ROOT, "docs", "auditor-latest.json"), JSON.stringify(verdict, null, 1));
        auditRun.output += "\n[verdict saved to docs/auditor-latest.json]";
      } catch { /* keep raw output */ }
    }
    auditRun.output += `\n[exit ${code}]`;
  });
});
app.get("/api/audit", (_req, res) => res.json(auditRun));

// ---- Fund: PromptPay QR top-up via ThaiFi Pay merchant API ----
type QrOrder = { orderId?: string; qrImage?: string; status?: string; total?: string; txHash?: string };
let order: { id?: string; qrImage?: string; status?: string; total?: string; txHash?: string } | null = null;
const paysoHeaders = () => ({ authorization: `Bearer ${envGet("PAYSO_API_KEY") ?? ""}`, "content-type": "application/json" });

app.post("/api/deposit", async (req, res) => {
  const amount = Math.max(6, Math.min(10000, Number(req.body?.amount ?? 20)));
  try {
    const r = await fetch("https://pay.thaifi.com/v1/qr/orders", {
      method: "POST",
      headers: paysoHeaders(),
      body: JSON.stringify({
        amountThb: amount,
        payoutToken: "THCFI",
        recipient: (await thaifiWhoami()).match(/Account:\s+(\S+)/)?.[1] ?? envGet("CARDANO_CLIENT_ADDRESS"),
        metadata: { source: "leashed-passbook" },
      }),
    });
    const body = (await r.json()) as QrOrder & { referenceNo?: string };
    if (!r.ok) { res.status(r.status).json({ error: "order failed", detail: body }); return; }
    order = { id: body.orderId, qrImage: body.qrImage, status: body.status ?? "pending", total: body.total };
    res.json({ started: true, amount, orderId: body.orderId });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});
app.get("/api/deposit", async (_req, res) => {
  if (!order?.id) { res.json({ order }); return; }
  try {
    const r = await fetch(`https://pay.thaifi.com/v1/qr/orders/${order.id}`, { headers: paysoHeaders() });
    const body = (await r.json()) as QrOrder;
    order = { ...order, status: body.status, txHash: body.txHash };
  } catch { /* keep last known state */ }
  res.json({ order });
});

app.use(express.static(join(HERE, "..", "public")));

app.listen(PORT, () => console.log(`leashed dashboard on http://localhost:${PORT}`));
