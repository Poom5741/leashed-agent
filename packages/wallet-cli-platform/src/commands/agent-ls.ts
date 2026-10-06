import { loadStore, listAgents } from "../store.js";

export interface AgentLsOpts {
  storeDir: string;
}

export function runAgentLs(opts: AgentLsOpts): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const store = loadStore(opts.storeDir);
  const agents = listAgents(store);

  if (agents.length === 0) {
    return { exitCode: 1, stdout: "", stderr: "No agents" };
  }

  const lines: string[] = ["KEYID".padEnd(66) + "TEMPLATE".padEnd(20) + "CREATED"];

  for (const agent of agents) {
    const parts = [agent.keyId, agent.template, agent.createdAt];
    if (agent.revokedAt) parts.push("[revoked]");
    lines.push(parts.join("").trimEnd());
  }

  return { exitCode: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}
