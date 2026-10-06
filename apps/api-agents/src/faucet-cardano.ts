// Cardano preprod tUSDM faucet — REAL tokens on the sponsor chain.
// Moneta (the USDM issuer) runs a public CIP-99 testnet claim service that
// grants tUSDM (+ tADA) to any addr_test1 address, no registration. We proxy
// that claim so the browser has no CORS problems, and rate-limit per judge
// address in D1 (claims ledger only — the chain is the balance truth).
//
// Proven upstream: POST {address, code} → 200 {status:"accepted",
// tokens:{<policy>.tUSDM: 1000000000, lovelaces: 5000000}} (10 tUSDM + 5 tADA).

import { Hono } from "hono";
import type { Bindings } from "./index.js";

const CLAIM_URL = "https://beta.onbd.io/api/claim/v1/01ksj7qeeg0kbh5s64ds2x9yya";
const CAMPAIGN_CODE = "01KSJ8PW11CPCG40G7S7TVKXZ9";
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const app = new Hono<{ Bindings: Bindings }>();

app.post("/v1/faucet/cardano", async (c) => {
  let body: { address?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid JSON" }, 400);
  }

  const address = (body.address ?? "").trim();
  if (!/^addr_test1[02-9ac-hj-np-z]{53,}$/.test(address)) {
    return c.json(
      { ok: false, error: "invalid Cardano testnet address (must be addr_test1…)" },
      400,
    );
  }

  const db = c.env.DB;
  const key = "ada:" + address.toLowerCase();
  const now = Date.now();

  // Atomic per-address claim slot (24 h). D1 tracks claims only.
  const claim = await db
    .prepare(
      `INSERT INTO faucet_claims (address, last_claimed_at, total_claimed)
       VALUES (?, ?, 0) ON CONFLICT(address) DO NOTHING`,
    )
    .bind(key, now)
    .run();
  if (!claim.meta.changes) {
    const row = await db
      .prepare("SELECT last_claimed_at FROM faucet_claims WHERE address = ?")
      .bind(key)
      .first<{ last_claimed_at: number }>();
    const elapsed = row ? now - row.last_claimed_at : CLAIM_COOLDOWN_MS;
    if (elapsed < CLAIM_COOLDOWN_MS) {
      const hours = Math.ceil((CLAIM_COOLDOWN_MS - elapsed) / 3_600_000);
      return c.json(
        { ok: false, error: `this address already claimed — try again in ~${hours} h` },
        429,
      );
    }
  }

  try {
    const upstream = await fetch(CLAIM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ address, code: CAMPAIGN_CODE }),
    });
    const data = (await upstream.json().catch(() => null)) as
      | { code?: number; status?: string; error?: string; tokens?: Record<string, string>; lovelaces?: string }
      | null;

    if (!upstream.ok || !data || (data.code !== 200 && data.status !== "accepted")) {
      // Upstream rejection (e.g. already claimed there) — release our slot.
      await db.prepare("DELETE FROM faucet_claims WHERE address = ?").bind(key).run();
      return c.json(
        {
          ok: false,
          error: data?.error ?? `claim service returned ${upstream.status}`,
        },
        502,
      );
    }

    await db
      .prepare("UPDATE faucet_claims SET last_claimed_at = ?, total_claimed = total_claimed + 1 WHERE address = ?")
      .bind(now, key)
      .run();

    return c.json({
      ok: true,
      status: data.status,
      granted: data.tokens ?? {},
      lovelaces: data.lovelaces ?? "0",
      note: "Tokens arrive on Cardano preprod within a few minutes. Verify on preprod.cardanoscan.io by searching your address.",
    });
  } catch (err) {
    await db.prepare("DELETE FROM faucet_claims WHERE address = ?").bind(key).run();
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "claim failed" },
      502,
    );
  }
});

export default app;
