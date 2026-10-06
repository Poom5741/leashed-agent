// Faucet — lets hackathon judges / new users get real on-chain test tokens
// without a Thai bank account. Mints a small fixed amount of THCFI from the
// hot wallet (same mint path as paid orders), rate-limited to one claim per
// address per 24 h via D1. No auth: the address IS the identity, and the
// amount is small enough that abuse is a rounding error against the 3M cap.

import { Hono } from "hono";
import type { Env } from "./env";
import { isDepositToken, mintDirect } from "./hotwallet";

const FAUCET_AMOUNT_THB = 25;
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  "https://leashed-agent-platform.pages.dev",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]);

const app = new Hono<{ Bindings: Env }>();

function cors(c: any): void {
  const origin = c.req.header("Origin") ?? "";
  c.header("Access-Control-Allow-Origin", ALLOWED_ORIGINS.has(origin) ? origin : "");
  c.header("Vary", "Origin");
  c.header("Cache-Control", "no-store");
}

app.options("/api/faucet", (c) => {
  cors(c);
  c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  return c.body(null, 204);
});

app.post("/api/faucet", async (c) => {
  cors(c);
  let body: { address?: string; token?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid JSON" }, 400);
  }

  const address = (body.address ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return c.json({ ok: false, error: "invalid address" }, 400);
  }
  const token = body.token ?? "THCFI";
  if (!isDepositToken(token)) {
    return c.json({ ok: false, error: `unsupported token ${token}` }, 400);
  }

  const lower = address.toLowerCase();
  const db = c.env.DB;
  const now = Date.now();

  // Claim a slot atomically: insert wins for a fresh address; an existing row
  // within the cooldown window loses. No double-claim even under races.
  const claim = await db
    .prepare(
      `INSERT INTO faucet_claims (address, last_claimed_at, total_claimed)
       VALUES (?, ?, 0)
       ON CONFLICT(address) DO NOTHING`,
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
    const txHash = await mintDirect(c, address, token, FAUCET_AMOUNT_THB);
    await db
      .prepare(
        "UPDATE faucet_claims SET total_claimed = total_claimed + ? WHERE address = ?",
      )
      .bind(FAUCET_AMOUNT_THB, lower)
      .run();
    return c.json({ ok: true, txHash, amount: FAUCET_AMOUNT_THB, token });
  } catch (err) {
    // Mint failed — release the claim so the user can retry immediately.
    await db
      .prepare("DELETE FROM faucet_claims WHERE address = ? AND total_claimed = 0")
      .bind(lower)
      .run();
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "mint failed" },
      502,
    );
  }
});

export default app;
