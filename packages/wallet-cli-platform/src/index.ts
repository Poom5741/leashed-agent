import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { runAgentDeploy } from "./commands/agent-deploy.js";
import { runAgentLs } from "./commands/agent-ls.js";
import { runAgentRun } from "./commands/agent-run.js";
import { runAgentRevoke } from "./commands/agent-revoke.js";
import { runMarketplaceRegister, runMarketplaceLs } from "./commands/marketplace.js";

const DEFAULT_STORE_DIR = join(homedir(), ".thaifi");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: thaifi-wallet-cli-platform <command>

Commands:
  agent deploy <template>    Deploy a new agent
  agent ls                   List agents
  agent run [options]        Run an agent job
  agent revoke <keyId>       Revoke an agent
  marketplace register       Register a marketplace service
  marketplace ls             List marketplace services
`);
  process.exit(0);
}

async function spawnChild(
  cmd: string,
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

const noOpHttp = {
  async post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  },
  async get(url: string) {
    const res = await fetch(url, { method: "GET" });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  },
};

const noOpSigner = async (_msg: Uint8Array): Promise<Uint8Array> => new Uint8Array(65);

const [family, subcommand, ...rest] = args;

async function main() {
  if (family === "agent") {
    if (subcommand === "deploy") {
      const res = await runAgentDeploy({ storeDir: DEFAULT_STORE_DIR, http: noOpHttp });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.exitCode);
    }

    if (subcommand === "ls") {
      const res = await runAgentLs({ storeDir: DEFAULT_STORE_DIR });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.exitCode);
    }

    if (subcommand === "run") {
      const brief = rest[rest.indexOf("--brief") + 1] ?? "";
      const budget = parseInt(rest[rest.indexOf("--budget") + 1] ?? "-1", 10);
      const res = await runAgentRun({
        storeDir: DEFAULT_STORE_DIR,
        brief,
        budget,
        spawner: { spawn: spawnChild },
      });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.exitCode);
    }

    if (subcommand === "revoke") {
      const keyId = rest[0] ?? "";
      const res = await runAgentRevoke({ keyId, storeDir: DEFAULT_STORE_DIR, http: noOpHttp });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.exitCode);
    }
  }

  if (family === "marketplace") {
    if (subcommand === "register") {
      const endpointUrl = rest[rest.indexOf("--endpoint") + 1] ?? "";
      const rail = rest[rest.indexOf("--rail") + 1] ?? "";
      const price = parseFloat(rest[rest.indexOf("--price") + 1] ?? "0");
      const token = rest[rest.indexOf("--token") + 1] ?? "";
      const res = await runMarketplaceRegister({
        endpointUrl,
        rail,
        price,
        token,
        storeDir: DEFAULT_STORE_DIR,
        http: noOpHttp,
        signer: noOpSigner,
      });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.exitCode);
    }

    if (subcommand === "ls") {
      const query = rest[rest.indexOf("--q") + 1];
      const res = await runMarketplaceLs({ storeDir: DEFAULT_STORE_DIR, http: noOpHttp, query });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.exitCode);
    }
  }

  console.log(`Unknown command: ${family} ${subcommand}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
