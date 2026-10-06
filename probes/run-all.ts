/**
 * Probe runner — M0 gate. Each probe must pass before the architecture locks.
 * Run: pnpm probe            (all)
 *      pnpm probe 1          (single)
 * Exit 0 = all green.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROBES: { id: string; name: string; script: string; needs: string }[] = [
  { id: "1", name: "Cardano x402 first payment", script: "probe1-cardano-x402.ts", needs: "BLOCKFROST_API_KEY_PREPROD + tADA/tUSDM faucet funds" },
  { id: "2", name: "CRE hello-world simulate", script: "probe2-cre.ts", needs: "cre CLI installed + CRE account login" },
  { id: "3", name: "NOWNodes endpoint", script: "probe3-nownodes.ts", needs: "NOWNODES_API_KEY" },
  { id: "4", name: "ThaiFi rails reachable", script: "probe4-thaifi.ts", needs: "network only" },
  { id: "5", name: "TIDX/MPP receipt attribution", script: "probe5-receipts.ts", needs: "network only" },
  { id: "6", name: "PromptPay + revoke latency", script: "probe6-human.ts", needs: "paired thaifi CLI + real THB (manual, guided)" },
];

const filter = process.argv[2];
let failed = 0;
for (const p of PROBES) {
  if (filter && p.id !== filter) continue;
  const r = spawnSync("tsx", [path.join(here, p.script)], { stdio: "inherit", timeout: 120_000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`\n[${ok ? "PASS" : "FAIL"}] probe ${p.id}: ${p.name}${ok ? "" : `  (needs: ${p.needs})`}\n`);
}
if (failed) {
  console.error(`${failed} probe(s) failed — resolve the "needs" above.`);
  process.exit(1);
}
console.log("All configured probes passed.");
