import { loadStore, listAgents } from "../store.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export interface Spawner {
  spawn(
    cmd: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface AgentRunOpts {
  storeDir: string;
  brief: string;
  budget: number;
  spawner: Spawner;
  jobPath?: string;
}

export async function runAgentRun(opts: AgentRunOpts): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const { storeDir, brief, budget, spawner, jobPath: jobPathOpt } = opts;
  const store = loadStore(storeDir);
  const agents = listAgents(store);

  const active = agents.filter((a) => !a.revokedAt);
  if (active.length === 0) {
    return { exitCode: 1, stdout: "", stderr: "No active agent" };
  }

  if (budget < 0) {
    return { exitCode: 1, stdout: "", stderr: "Invalid budget" };
  }

  const selected = active.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]!;

  const jobPath = jobPathOpt ?? resolve(fileURLToPath(import.meta.url), "../../../../apps/agent/src/job.ts");

  const env: Record<string, string> = {
    ...process.env,
    AGENT_KEY_ID: selected.keyId,
    AGENT_LEASH_PER_TOKEN_BASE: JSON.stringify(selected.leash.perTokenBase),
    AGENT_LEASH_PERIOD_SEC: String(selected.leash.periodSec),
    AGENT_LEASH_KEY_EXPIRY: String(selected.leash.keyExpiry),
  };

  const res = await spawner.spawn("tsx", [jobPath, "--brief", brief, "--budget", String(budget)], env);
  return { exitCode: res.code, stdout: res.stdout, stderr: res.stderr };
}
