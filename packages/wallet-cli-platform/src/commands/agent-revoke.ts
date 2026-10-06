import { loadStore, saveStore, getAgent } from "../store.js";
import type { HttpClient } from "./agent-deploy.js";

export interface AgentRevokeOpts {
  keyId: string;
  storeDir: string;
  http: HttpClient;
}

export async function runAgentRevoke(opts: AgentRevokeOpts): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const { keyId, storeDir, http } = opts;
  const store = loadStore(storeDir);
  const agent = getAgent(store, keyId);

  if (!agent) {
    return { exitCode: 1, stdout: "", stderr: `Unknown keyId: ${keyId}` };
  }

  const res = await http.post("/api/agent/revoke", { keyId });

  if (res.status >= 500) {
    return { exitCode: 1, stdout: "", stderr: "Server error — retry later" };
  }

  if (res.status !== 200) {
    return { exitCode: 1, stdout: "", stderr: `Unexpected status: ${res.status}` };
  }

  agent.revokedAt = new Date().toISOString();
  saveStore(store, storeDir);

  return { exitCode: 0, stdout: "Agent revoked", stderr: "" };
}
