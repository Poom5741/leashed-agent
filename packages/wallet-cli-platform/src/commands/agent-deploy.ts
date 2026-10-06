import { loadStore, saveStore, addAgent } from "../store.js";
import type { AgentRecord } from "../store.js";

export interface HttpClient {
  post(url: string, body: unknown): Promise<{ status: number; body: unknown }>;
  get(url: string): Promise<{ status: number; body: unknown }>;
}

export interface DeployDefaults {
  perTokenBase: { THCFI: string; tUSDM: string; tADA: string };
  periodSec: number;
  pollMs: number;
  timeoutMs: number;
}

export const DEFAULTS: DeployDefaults = {
  perTokenBase: { THCFI: "2000000", tUSDM: "100000", tADA: "50000" },
  periodSec: 60 * 60 * 24 * 30,
  pollMs: 1000,
  timeoutMs: 5 * 60 * 1000,
};

export interface AgentDeployOpts {
  storeDir: string;
  template?: string;
  http: HttpClient;
  defaults?: DeployDefaults;
}

export async function runAgentDeploy(opts: AgentDeployOpts): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: { keyId: string };
}> {
  const { storeDir, http, defaults = DEFAULTS } = opts;
  const store = loadStore(storeDir);

  if (!store.wallet) {
    return { exitCode: 1, stdout: "", stderr: "Not paired — run `thaifi login` first" };
  }

  const keyAddress = store.wallet.address;

  // ── polling loop ──────────────────────────────────────────────────────────
  const { perTokenBase, periodSec, pollMs, timeoutMs } = defaults;
  const keyExpiry = Math.floor(Date.now() / 1000) + periodSec;

  const pairRes = await http.post("/api/agent/pair", {
    keyAddress,
    leash: { perTokenBase, periodSec, keyExpiry },
  });

  if (pairRes.status === 401 || pairRes.status === 403) {
    return { exitCode: 1, stdout: "", stderr: "Unauthorized" };
  }

  if (pairRes.status >= 500) {
    return { exitCode: 1, stdout: "", stderr: "Server error — retry later" };
  }

  if (pairRes.status !== 200) {
    return { exitCode: 1, stdout: "", stderr: `Unexpected status: ${pairRes.status}` };
  }

  const pairBody = pairRes.body as { pairingId: string };
  const pairingId: string = pairBody.pairingId;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const pollRes = await http.get(`/api/agent/pair/${pairingId}`);
    if (pollRes.status !== 200) {
      return { exitCode: 1, stdout: "", stderr: `Poll failed: ${pollRes.status}` };
    }
    const pollBody = pollRes.body as { status: string; key?: { keyId: string }; leash?: AgentRecord["leash"] };
    if (pollBody.status === "approved") {
      const keyId: string = pollBody.key!.keyId;
      const stdout = `key: ${keyId}`;
      const agent: AgentRecord = {
        keyId,
        template: opts.template ?? "default",
        leash: pollBody.leash!,
        createdAt: new Date().toISOString(),
      };
      addAgent(store, agent);
      saveStore(store, storeDir);
      return { exitCode: 0, stdout, stderr: "", result: { keyId } };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }

  return { exitCode: 1, stdout: "", stderr: "Timed out waiting for approval" };
}
