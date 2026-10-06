import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Slice-1 smoke test for S1.R7: the new `agent` and `marketplace` command
// families must coexist with the existing CLI commands. We invoke the binary
// via `tsx src/index.ts --help` (the package's entry) and assert both command
// families appear in the help output.
//
// We resolve the entry path relative to this test file so the test runs from
// anywhere in the monorepo.

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");

function runHelp(): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["tsx", join(pkgRoot, "src", "index.ts"), "--help"],
      { cwd: pkgRoot },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

test("`npx thaifi-wallet-cli-platform --help` lists both `agent` and `marketplace` command families", async () => {
  const res = await runHelp();
  // We don't require exit 0 (some CLIs exit 1 on --help), only that the help text
  // is on stdout/stderr.
  const out = res.stdout + "\n" + res.stderr;
  assert.match(out, /\bagent\b/, "help output must mention the `agent` command family");
  assert.match(out, /\bmarketplace\b/, "help output must mention the `marketplace` command family");
});