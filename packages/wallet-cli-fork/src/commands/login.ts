/** `thaifi login` — pair this CLI with a wallet.thaifi.com account.
 *
 * Reliability guarantees (0.3.6+):
 * - The approval URL is always written to ~/.thaifi/pair.log (chmod 600), so
 *   background launchers that lose stdout can recover it.
 * - A pairing created but not yet approved is persisted in the store; re-running
 *   `thaifi login` within the poll window REUSES it (same URL, same key) instead
 *   of creating throwaway pairings on the server.
 */

import { hostname } from "node:os";
import { generatePrivateKey } from "viem/accounts";
import { Account } from "viem/tempo";
import { CONFIG } from "../config.js";
import { loadStore, saveStore, storePath, writePairLog, pairLogPath, type PendingPairing } from "../store.js";

interface PairStartResponse {
  pairingId: string;
  code: string;
}

const signatureType = "p256";

interface PairStatusResponse {
  status: "pending" | "approved" | "rejected" | "claimed" | "expired";
  userAddress?: string;
  expiry?: number;
  limitAmount?: string;
  limitPeriod?: number;
}

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

function pairLogContent(p: PendingPairing, status: string): string {
  return [
    "# ThaiFi CLI pairing",
    "created=" + new Date(p.createdAt).toISOString(),
    "PAIR_URL=" + p.url,
    "PAIR_CODE=" + p.code,
    "KEY_ID=" + p.keyId,
    "MACHINE=" + p.name,
    "STATUS=" + status,
    "",
  ].join("\n");
}

export async function login(options: { browser?: boolean } = {}): Promise<void> {
  const existing = loadStore();

  if (existing?.userAddress) {
    console.error("Already paired (found " + storePath + "). Run `thaifi logout` first to re-pair.");
    process.exitCode = 1;
    return;
  }

  // Reuse a still-fresh pending pairing instead of creating a new one —
  // a re-run of `thaifi login` (crashed launcher, lost stdout, impatient
  // retry) must never pile up throwaway pairings on the server.
  const pending = existing?.pending;
  let reused = false;
  let privateKey: `0x${string}`;
  let name: string;
  let keyId: string;
  let pairingId: string;
  let code: string;
  let url: string;

  if (pending && Date.now() - pending.createdAt < CONFIG.pollTimeoutMs) {
    reused = true;
    privateKey = pending.privateKey as `0x${string}`;
    keyId = pending.keyId;
    name = pending.name;
    pairingId = pending.pairingId;
    code = pending.code;
    url = pending.url;
    console.log(
      "Pairing already waiting for approval (started " +
        Math.round((Date.now() - pending.createdAt) / 60000) +
        " min ago) — reusing it, no new pairing created.",
    );
  } else {
    // 1. Generate the agent access key (P256 — never leaves this machine).
    privateKey = generatePrivateKey();
    name = hostname();
    keyId = Account.fromP256(privateKey).address;

    console.log("Agent key:  " + keyId);
    console.log("Machine:    " + name);
    console.log("");

    // 2. Start pairing with the web wallet.
    const startRes = await fetch(CONFIG.walletUrl + "/api/agent/pair/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId, name, signatureType }),
    });
    if (!startRes.ok) {
      console.error("Pairing failed to start: HTTP " + startRes.status + " " + (await startRes.text()));
      process.exitCode = 1;
      return;
    }
    ({ pairingId, code } = (await startRes.json()) as PairStartResponse);
    url = `${CONFIG.walletUrl}/pair?id=${pairingId}&code=${code}`;

    // Persist the pending pairing BEFORE printing anything — if this process
    // dies, a re-run recovers the same pairing instead of orphaning it.
    saveStore({
      privateKey,
      keyId,
      name,
      walletUrl: CONFIG.walletUrl,
      rpcUrl: CONFIG.rpcUrl,
      chainId: CONFIG.chainId,
      pending: { pairingId, code, url, keyId, name, privateKey, createdAt: Date.now() },
    });
  }

  // 3. Print + persist the approval URL (both routes land here).
  console.log("Authorize this CLI in the ThaiFi Wallet:");
  console.log("");
  console.log("  " + url);
  console.log("");
  console.log("PAIR_URL=" + url);
  console.log("Pairing code: " + code);
  writePairLog(pairLogContent({ pairingId, code, url, keyId, name, privateKey, createdAt: pending?.createdAt ?? Date.now() }, reused ? "waiting-for-approval (reused)" : "waiting-for-approval"));
  console.log("(approval link saved to " + pairLogPath + ")");

  if (options.browser !== false) {
    await openBrowser(url);
    console.log("(opened in your browser — use --no-browser on a headless machine)");
  }
  console.log("");
  console.log("Waiting for approval (timeout " + CONFIG.pollTimeoutMs / 60000 + " min)…");

  // 4. Poll until approved.
  const deadline = Date.now() + CONFIG.pollTimeoutMs;
  let status: PairStatusResponse | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
    const res = await fetch(`${CONFIG.walletUrl}/api/agent/pair/status/${pairingId}`);
    if (!res.ok) continue;
    status = (await res.json()) as PairStatusResponse;
    if (status.status === "approved") break;
    if (status.status === "rejected" || status.status === "claimed") {
      console.error("Pairing was " + status.status + " on the web wallet.");
      // Clear the dead pending pairing so the next login starts fresh.
      if (existing) saveStore({ ...existing, pending: undefined });
      process.exitCode = 1;
      return;
    }
    process.stdout.write(".");
  }
  if (status?.status !== "approved") {
    console.error(
      "\nPairing timed out. The approval link is still in " +
        pairLogPath +
        " — run `thaifi login` again to reuse it (recommending the user approve) or wait for it to expire server-side.",
    );
    process.exitCode = 1;
    return;
  }

  // 5. Persist the completed pairing (and clear pending).
  saveStore({
    privateKey,
    keyId,
    name,
    walletUrl: CONFIG.walletUrl,
    rpcUrl: CONFIG.rpcUrl,
    chainId: CONFIG.chainId,
    userAddress: status.userAddress,
    pairedAt: Date.now(),
    limitAmount: status.limitAmount,
    limitPeriod: status.limitPeriod,
    keyExpiry: status.expiry,
    pending: undefined,
  });
  writePairLog(pairLogContent({ pairingId, code, url, keyId, name, privateKey, createdAt: pending?.createdAt ?? Date.now() }, "approved"));

  console.log("");
  console.log("✓ Paired!");
  console.log("  Wallet account: " + status.userAddress);
  console.log(
    "  Spend limit:    " +
      Number(status.limitAmount ?? 0) / 10 ** 6 +
      " pathUSD / " +
      Math.round((status.limitPeriod ?? 0) / 86400) +
      " days (THCFI/THCOC limits set at approval)",
  );
  console.log("  Key expires:    " + (status.expiry ? new Date(status.expiry * 1000).toISOString() : "never"));
  console.log("");
  console.log("Try: thaifi whoami");
}
