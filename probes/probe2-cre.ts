/**
 * Probe 2: CRE hello-world simulate (≤1h budget).
 * Needs: `cre` CLI installed (docs.chain.link/cre) + CRE account logged in.
 * Verifies: `cre` on PATH; then human runs `cre init` + `cre workflow simulate`
 * in workflows/cre-auditor and pastes the log to docs/evidence/cre-simulate.txt.
 */
import { spawnSync } from "node:child_process";
const r = spawnSync("cre", ["version"], { encoding: "utf8" });
if (r.error || r.status !== 0) {
  console.log("NOT CONFIGURED — cre CLI not found on PATH.");
  console.log("  install: https://docs.chain.link/cre/getting-started/cli-installation/macos-linux");
  console.log("  then: cre init (scaffold) → cre workflow simulate (capture output)");
  process.exit(2);
}
console.log(`cre CLI found: ${r.stdout.trim()}`);
console.log("PASS (CLI present — hello-world simulate is a guided human step)");
