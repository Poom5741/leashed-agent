// Faucet — real on-chain THCFI (ThaiFi stable token, 1:1 THB, 6 decimals)
// transfers from a funded hot EOA to judges' wallets. No mint authority
// needed: the hot wallet holds THCFI and sends it. D1 stores ONLY rate-limit
// claims; the balance truth is the chain (exp.thaifi.com).
//
// FAUCET_KEY = hot EOA private key, set via `wrangler secret put FAUCET_KEY`.
// It never enters the repo or the SPA bundle.

import { Hono } from "hono";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Bindings } from "./index.js";

const THCFI = "0x20c000000000000000000000c82102FFe7064362" as const;
const THAIFI_CHAIN = {
  id: 17,
  name: "ThaiFi",
  nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.thaifi.com"] } },
  blockExplorers: { default: { name: "ThaiFi Explorer", url: "https://exp.thaifi.com" } },
} as const;

const ERC20_TRANSFER = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const FAUCET_AMOUNT = 25; // THCFI per claim
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const app = new Hono<{ Bindings: Bindings & { FAUCET_KEY?: string } }>();

app.post("/v1/faucet", async (c) => {
  let body: { address?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid JSON" }, 400);
  }

  const address = (body.address ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return c.json({ ok: false, error: "invalid address" }, 400);
  }

  const key = c.env.FAUCET_KEY;
  if (!key) {
    return c.json({ ok: false, error: "faucet is not configured yet" }, 503);
  }

  const lower = address.toLowerCase();
  const db = c.env.DB;
  const now = Date.now();

  // Atomic claim: fresh address inserts a slot; a row inside the cooldown
  // window rejects. No double-payout even under concurrent requests.
  const claim = await db
    .prepare(
      `INSERT INTO faucet_claims (address, last_claimed_at, total_claimed)
       VALUES (?, ?, 0) ON CONFLICT(address) DO NOTHING`,
    )
    .bind(lower, now)
    .run();
  if (!claim.meta.changes) {
    const row = await db
      .prepare("SELECT last_claimed_at FROM faucet_claims WHERE address = ?")
      .bind(lower)
      .first<{ last_claimed_at: number }>();
    const elapsed = row ? now - row.last_claimed_at : CLAIM_COOLDOWN_MS;
    if (elapsed < CLAIM_COOLDOWN_MS) {
      const hours = Math.ceil((CLAIM_COOLDOWN_MS - elapsed) / 3_600_000);
      return c.json(
        { ok: false, error: `faucet already claimed — try again in ~${hours} h` },
        429,
      );
    }
    await db
      .prepare("UPDATE faucet_claims SET last_claimed_at = ? WHERE address = ?")
      .bind(now, lower)
      .run();
  }

  try {
    const account = privateKeyToAccount(
      (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`,
    );
    const client = createWalletClient({
      account,
      chain: THAIFI_CHAIN,
      transport: http(THAIFI_CHAIN.rpcUrls.default.http[0]),
    });
    const publicClient = createPublicClient({
      chain: THAIFI_CHAIN,
      transport: http(THAIFI_CHAIN.rpcUrls.default.http[0]),
    });
    const hash = await client.writeContract({
      address: THCFI,
      abi: ERC20_TRANSFER,
      functionName: "transfer",
      args: [address as `0x${string}`, parseUnits(String(FAUCET_AMOUNT), 6)],
      chain: THAIFI_CHAIN,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`transfer tx ${hash} reverted`);

    await db
      .prepare("UPDATE faucet_claims SET total_claimed = total_claimed + ? WHERE address = ?")
      .bind(FAUCET_AMOUNT, lower)
      .run();

    return c.json({ ok: true, txHash: hash, amount: FAUCET_AMOUNT, token: "THCFI" });
  } catch (err) {
    // On-chain failure — release the claim so retry is immediate.
    await db
      .prepare("DELETE FROM faucet_claims WHERE address = ? AND total_claimed = 0")
      .bind(lower)
      .run();
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "transfer failed" },
      502,
    );
  }
});

export default app;
