/**
 * Oversight dashboard API — the human's window onto the leashed agent.
 * Reads only verifiable sources: the receipt ledger + on-chain truth
 * (thaifi whoami spend limits, Blockfrost balances). Serves the SPA.
 */
import express from "express";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  const auditor = existsSync(join(ROOT, "docs", "auditor-latest.json"))
    ? JSON.parse(readFileSync(join(ROOT, "docs", "auditor-latest.json"), "utf8"))
    : null;
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

app.use(express.static(join(HERE, "..", "public")));

app.listen(PORT, () => console.log(`leashed dashboard on http://localhost:${PORT}`));
