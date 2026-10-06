import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AuthUser, Env } from "./env";
import { SESSION_COOKIE, sha256Hex, signSession, verifySession } from "./session";
import { sendOtpEmail } from "./email";
import { buildAuthorizeUrl, exchangeCode, lineReady, verifyIdToken } from "./line";
import { tidxQuery } from "./tidx";
import { requireAgentAuth, type AgentIdentity } from "./agentAuth";
import {
  handleAgentOrder,
  handleAgentOrderStatus,
  handleOrder,
  handleOrderStatus,
  handlePayso,
} from "./payso";

type AppEnv = { Bindings: Env; Variables: { userId: string; agent: AgentIdentity } };

const app = new Hono<AppEnv>();

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const BACKUP_MAX_CHARS = 128 * 1024;
const STATE_COOKIE = "thaifi_oauth_state";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** TIP-20 tokens we can label in history (anything else falls back to raw units + address). */
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x20c0000000000000000000000000000000000000": { symbol: "pathUSD", decimals: 6 },
  "0x20c000000000000000000000c82102ffe7064362": { symbol: "THCFI", decimals: 6 },
  "0x20c0000000000000000000007c24a0c628e8a940": { symbol: "THCOC", decimals: 6 },
  "0x20c0000000000000000000003d2b4e7bce39ad58": { symbol: "USDC", decimals: 6 },
};

// ---------------------------------------------------------------------------
// Helpers

async function sessionClaims(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  return token ? verifySession(c.env.JWT_SECRET, token) : null;
}

const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const claims = token ? await verifySession(c.env.JWT_SECRET, token) : null;
  if (!claims) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", claims.sub);
  await next();
};

function setSessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function upsertUser(
  db: D1Database,
  provider: string,
  providerId: string,
  email: string | null,
  displayName: string | null,
  picture: string | null,
): Promise<string> {
  const result = await db
    .prepare(
      `INSERT INTO users (id, provider, provider_id, email, display_name, picture, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (provider, provider_id) DO UPDATE SET
         email = COALESCE(excluded.email, users.email),
         display_name = COALESCE(excluded.display_name, users.display_name),
         picture = COALESCE(excluded.picture, users.picture)
       RETURNING id`,
    )
    .bind(crypto.randomUUID(), provider, providerId, email, displayName, picture, Date.now())
    .first<{ id: string }>();
  if (!result) throw new Error("user upsert failed");
  return result.id;
}

async function getUserById(db: D1Database, id: string): Promise<AuthUser | null> {
  const row = await db
    .prepare("SELECT id, provider, email, display_name, picture FROM users WHERE id = ?1")
    .bind(id)
    .first<{ id: string; provider: string; email: string | null; display_name: string | null; picture: string | null }>();
  if (!row) return null;
  return { id: row.id, provider: row.provider, email: row.email, displayName: row.display_name, picture: row.picture };
}

// ---------------------------------------------------------------------------
// Meta

// Every /api response: never cached anywhere (browser or CF edge), and stamped
// so a 403 in the wild can be attributed — a 403 WITHOUT this header never
// reached this Worker (blocked at the Cloudflare edge).
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-ThaiFi-Worker", "api");
});

// Serve the agent skill file from the asset layer with no-store: the zone's
// edge cache ignores query strings, so a plain asset would serve stale
// content for hours after every edit.
app.get("/SKILL.md", async (c) => {
  const asset = await c.env.ASSETS.fetch(new Request("https://assets.local/SKILL.md"));
  c.header("Cache-Control", "no-store");
  c.header("X-ThaiFi-Worker", "api");
  return new Response(asset.body, asset);
});

app.get("/api/healthz", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "degraded", db: "unreachable" });
  }
});

app.get("/api/config", (c) => {
  return c.json({ lineEnabled: lineReady(c.env), appName: c.env.APP_NAME });
});

// ---------------------------------------------------------------------------
// Email OTP auth

app.post("/api/auth/email/request", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return c.json({ error: "Invalid email address." }, 400);

  const now = Date.now();
  const row = await c.env.DB.prepare("SELECT request_count, window_start FROM otp_tokens WHERE email = ?1")
    .bind(email)
    .first<{ request_count: number; window_start: number }>();
  let requestCount = 1;
  let windowStart = now;
  if (row && now - row.window_start < 60 * 60 * 1000) {
    if (row.request_count >= OTP_MAX_PER_HOUR) {
      return c.json({ error: "Too many codes requested for this email. Try again later." }, 429);
    }
    requestCount = row.request_count + 1;
    windowStart = row.window_start;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await c.env.DB.prepare(
    `INSERT INTO otp_tokens (email, code_hash, expires_at, attempts, request_count, window_start, created_at)
     VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)
     ON CONFLICT (email) DO UPDATE SET
       code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, request_count = excluded.request_count,
       window_start = excluded.window_start, created_at = excluded.created_at`,
  )
    .bind(email, await sha256Hex(code), now + OTP_TTL_SECONDS * 1000, requestCount, windowStart, now)
    .run();

  try {
    await sendOtpEmail(c.env, email, code, 10);
  } catch (err) {
    console.error("OTP email send failed:", err);
    return c.json({ error: "Could not send the sign-in email. Try again in a minute." }, 502);
  }
  return c.json({ ok: true });
});

app.post("/api/auth/email/verify", async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>().catch(() => ({}) as { email?: string; code?: string });
  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return c.json({ error: "Invalid email or code." }, 400);

  const row = await c.env.DB.prepare("SELECT code_hash, expires_at, attempts FROM otp_tokens WHERE email = ?1")
    .bind(email)
    .first<{ code_hash: string; expires_at: number; attempts: number }>();
  if (!row) return c.json({ error: "Invalid or expired code." }, 400);
  if (row.expires_at < Date.now()) {
    await c.env.DB.prepare("DELETE FROM otp_tokens WHERE email = ?1").bind(email).run();
    return c.json({ error: "Code expired. Request a new one." }, 400);
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return c.json({ error: "Too many attempts. Request a new code." }, 429);
  }
  if ((await sha256Hex(code)) !== row.code_hash) {
    await c.env.DB.prepare("UPDATE otp_tokens SET attempts = attempts + 1 WHERE email = ?1").bind(email).run();
    return c.json({ error: "Invalid code." }, 400);
  }
  await c.env.DB.prepare("DELETE FROM otp_tokens WHERE email = ?1").bind(email).run();

  const userId = await upsertUser(c.env.DB, "email", email, email, email.split("@")[0], null);
  const token = await signSession(c.env.JWT_SECRET, userId, "email", SESSION_TTL_SECONDS);
  setSessionCookie(c, token);
  return c.json({
    user: { id: userId, provider: "email", email, displayName: email.split("@")[0], picture: null },
  });
});

// ---------------------------------------------------------------------------
// LINE Login

app.get("/api/auth/line/start", (c) => {
  if (!lineReady(c.env)) return c.json({ error: "LINE login is not configured." }, 503);
  const state = crypto.randomUUID() + crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 });
  return c.redirect(buildAuthorizeUrl(c.env, new URL(c.req.url).origin, state));
});

// Callback path must match the URL registered in the LINE Developers console.
app.get("/line-callback", async (c) => {
  const origin = new URL(c.req.url).origin;
  const fail = (reason: string) => c.redirect(`${origin}/?loginError=${encodeURIComponent(reason)}`);

  deleteCookie(c, STATE_COOKIE, { path: "/" });
  const code = c.req.query("code");
  const state = c.req.query("state");
  const expected = getCookie(c, STATE_COOKIE);

  if (c.req.query("error")) return fail(c.req.query("error_description") ?? "LINE login was cancelled");
  if (!code || !state || !expected || state !== expected) return fail("invalid_state");
  if (!lineReady(c.env)) return fail("line_not_configured");

  try {
    const idToken = await exchangeCode(c.env, code, origin);
    const profile = await verifyIdToken(c.env, idToken);
    const userId = await upsertUser(c.env.DB, "line", profile.sub, profile.email ?? null, profile.name ?? null, profile.picture ?? null);
    const token = await signSession(c.env.JWT_SECRET, userId, "line", SESSION_TTL_SECONDS);
    setSessionCookie(c, token);
    return c.redirect(`${origin}/`);
  } catch (err) {
    console.error("LINE callback failed:", err);
    return fail("line_login_failed");
  }
});

// ---------------------------------------------------------------------------
// Session

app.get("/api/me", async (c) => {
  const claims = await sessionClaims(c);
  if (!claims) return c.json({ user: null });
  const user = await getUserById(c.env.DB, claims.sub);
  return c.json({ user });
});

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Encrypted key backups (D1) — ciphertext only; restore needs the user's
// passkey or recovery password, so the server can never move funds.

app.use("/api/backups", requireAuth);
app.use("/api/backups/*", requireAuth);

app.get("/api/backups", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT address, updated_at FROM backups WHERE user_id = ?1 ORDER BY updated_at DESC")
    .bind(c.get("userId"))
    .all<{ address: string; updated_at: number }>();
  return c.json({ backups: (results ?? []).map((r) => ({ address: r.address, updatedAt: r.updated_at })) });
});

app.put("/api/backups/:address", async (c) => {
  const address = c.req.param("address");
  if (!ADDRESS_RE.test(address)) return c.json({ error: "Invalid wallet address." }, 400);

  const body = await c.req.json<{ backup?: string }>().catch(() => ({}) as { backup?: string });
  const backup = body.backup ?? "";
  if (!backup || backup.length > BACKUP_MAX_CHARS) {
    return c.json({ error: "Backup payload missing or too large (max 128KB)." }, 400);
  }

  let parsed: {
    version?: number;
    wallet?: { address?: string; encryptedSecret?: string; iv?: string; prfSalt?: string; credentialId?: string; guard?: string };
    recoveryEncrypted?: string;
  };
  try {
    parsed = JSON.parse(backup);
  } catch {
    return c.json({ error: "Backup is not valid JSON." }, 400);
  }
  const w = parsed.wallet;
  // PIN-guard wallets carry no passkey material (empty prfSalt/credentialId).
  const isPin = parsed.wallet?.guard === "pin";
  if (
    !w?.address ||
    !w.encryptedSecret ||
    !w.iv ||
    (!isPin && (!w.prfSalt || !w.credentialId))
  ) {
    return c.json({ error: "Backup is missing wallet fields." }, 400);
  }
  if (w.address.toLowerCase() !== address.toLowerCase()) {
    return c.json({ error: "Backup wallet address does not match the URL." }, 400);
  }
  if (!parsed.recoveryEncrypted) {
    return c.json({ error: "Cloud backup requires recovery data (set a recovery password)." }, 400);
  }

  await c.env.DB
    .prepare(
      `INSERT INTO backups (user_id, address, backup, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id, address) DO UPDATE SET backup = excluded.backup, updated_at = excluded.updated_at`,
    )
    .bind(c.get("userId"), address.toLowerCase(), backup, Date.now())
    .run();
  return c.json({ ok: true });
});

app.get("/api/backups/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const row = await c.env.DB
    .prepare("SELECT backup, updated_at FROM backups WHERE user_id = ?1 AND address = ?2")
    .bind(c.get("userId"), address)
    .first<{ backup: string; updated_at: number }>();
  if (!row) return c.json({ error: "Backup not found." }, 404);
  return c.json({ backup: row.backup, updatedAt: row.updated_at });
});

app.delete("/api/backups/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  await c.env.DB.prepare("DELETE FROM backups WHERE user_id = ?1 AND address = ?2")
    .bind(c.get("userId"), address)
    .run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// History (TIDX proxy) — public, read-only.

app.get("/api/history", async (c) => {
  const address = c.req.query("address") ?? "";
  if (!ADDRESS_RE.test(address)) return c.json({ error: "Invalid address." }, 400);
  const a = address.toLowerCase();

  // `from`/`to` are reserved words in ClickHouse — backtick them. The address
  // is regex-validated hex, so interpolating into SQL is safe.
  const sql =
    `SELECT block_num, block_timestamp, tx_hash, token, \`from\`, \`to\`, amount ` +
    `FROM token_transfers WHERE \`from\` = '${a}' OR \`to\` = '${a}' ` +
    `ORDER BY block_num DESC, tx_idx DESC, log_idx DESC LIMIT 50`;

  const result = await tidxQuery(c.env, sql);
  if (!result.ok) return c.json({ error: result.error ?? "TIDX query failed." }, 502);

  const col = (name: string) => result.columns.indexOf(name);
  const items = result.rows.map((row) => {
    const from = String(row[col("from")]);
    const to = String(row[col("to")]);
    const token = String(row[col("token")]).toLowerCase();
    const meta = KNOWN_TOKENS[token];
    const direction = to === a ? "in" : "out";
    return {
      txHash: String(row[col("tx_hash")]),
      block: Number(row[col("block_num")]),
      time: String(row[col("block_timestamp")]),
      token,
      tokenSymbol: meta?.symbol ?? `${token.slice(0, 6)}…${token.slice(-4)}`,
      tokenDecimals: meta?.decimals ?? null,
      from,
      to,
      direction,
      counterparty: direction === "in" ? from : to,
      amount: String(row[col("amount")]),
    };
  });
  return c.json({ items });
});

// ---------------------------------------------------------------------------
// Agent CLI pairings (ThaiFi Wallet CLI)
//
// Flow: CLI POSTs /pair/start (public) → user approves in the web wallet
// (authed, and sends the on-chain authorizeKey tx from their passkey/PIN
// wallet) → CLI polls status until approved. The on-chain access key with
// its spending limit is the source of truth; this table is just the session.

app.post("/api/agent/pair/start", async (c) => {
  const body = await c.req
    .json<{ keyId?: string; name?: string; signatureType?: string }>()
    .catch(() => ({}) as { keyId?: string; name?: string; signatureType?: string });
  const keyId = (body.keyId ?? "").trim();
  const name = (body.name ?? "").trim().slice(0, 64) || "unknown-host";
  const keyType = body.signatureType === "secp256k1" ? "secp256k1" : "p256";
  if (!ADDRESS_RE.test(keyId)) return c.json({ error: "Invalid keyId." }, 400);

  const now = Date.now();
  // Housekeeping: drop pairings older than an hour.
  await c.env.DB.prepare("DELETE FROM agent_pairings WHERE created_at < ?1 AND status = 'pending'")
    .bind(now - 60 * 60 * 1000)
    .run();

  const id = crypto.randomUUID();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await c.env.DB.prepare(
    `INSERT INTO agent_pairings (id, code, key_id, key_type, name, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)`,
  )
    .bind(id, code, keyId.toLowerCase(), keyType, name, now)
    .run();

  return c.json({ pairingId: id, code });
});

app.get("/api/agent/pair/status/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT status, key_id, name, user_address, expiry, limit_amount, limit_period
     FROM agent_pairings WHERE id = ?1`,
  )
    .bind(c.req.param("id"))
    .first<{
      status: string;
      key_id: string;
      name: string;
      user_address: string | null;
      expiry: number | null;
      limit_amount: string | null;
      limit_period: number | null;
    }>();
  if (!row) return c.json({ error: "Pairing not found." }, 404);

  // Expire stale pending pairings (> 1h).
  const created = await c.env.DB.prepare("SELECT created_at FROM agent_pairings WHERE id = ?1")
    .bind(c.req.param("id"))
    .first<{ created_at: number }>();
  if (row.status === "pending" && created && Date.now() - created.created_at > 60 * 60 * 1000) {
    await c.env.DB.prepare("UPDATE agent_pairings SET status = 'expired' WHERE id = ?1")
      .bind(c.req.param("id"))
      .run();
    row.status = "expired";
  }

  return c.json({
    status: row.status,
    keyId: row.key_id,
    name: row.name,
    userAddress: row.user_address,
    expiry: row.expiry,
    limitAmount: row.limit_amount,
    limitPeriod: row.limit_period,
  });
});

// Agent deposit QR — authenticated with ThaiFi Agent Auth (on-chain access-key
// proof, no cookie session): the CLI signs a challenge with its access key;
// {account, keyId} is recovered from the signature envelope and the key's
// active status is verified against the AccountKeychain precompile. Registered
// BEFORE the /api/agent requireAuth guards below (self-authenticating).
const requireAgent: MiddlewareHandler<AppEnv> = (c, next) => {
  const verify = requireAgentAuth({
    realm: "thaifi-wallet",
    secretKey: c.env.JWT_SECRET,
    rpcUrl: c.env.THAIFI_RPC_URL || "https://rpc.thaifi.com",
    chainId: Number(c.env.THAIFI_CHAIN_ID || 17),
  });
  return verify(c, next);
};

app.use("/api/agent/deposit/qr", requireAgent);
app.use("/api/agent/deposit/qr/*", requireAgent);
app.post("/api/agent/deposit/qr", handleAgentOrder);
app.get("/api/agent/deposit/qr/:referenceNo", handleAgentOrderStatus);

// Everything below requires a signed-in account.
app.use("/api/agent", requireAuth);
app.use("/api/agent/*", requireAuth);

/** Authorize a pending pairing for the signed-in account (after the on-chain
 *  authorizeKey tx has been sent client-side). */
app.post("/api/agent/pairs/approve", async (c) => {
  const body = await c.req
    .json<{
      pairingId?: string;
      userAddress?: string;
      expiry?: number;
      limitAmount?: string;
      limitPeriod?: number;
    }>()
    .catch(() => ({}) as Record<string, never>);
  const pairingId = body.pairingId ?? "";
  const userAddress = (body.userAddress ?? "").toLowerCase();
  if (!ADDRESS_RE.test(userAddress)) return c.json({ error: "Invalid wallet address." }, 400);

  const row = await c.env.DB.prepare("SELECT status FROM agent_pairings WHERE id = ?1")
    .bind(pairingId)
    .first<{ status: string }>();
  if (!row || row.status !== "pending") {
    return c.json({ error: "Pairing not found or already handled." }, 404);
  }

  await c.env.DB.prepare(
    `UPDATE agent_pairings
     SET status = 'approved', user_id = ?1, user_address = ?2,
         expiry = ?3, limit_amount = ?4, limit_period = ?5
     WHERE id = ?6`,
  )
    .bind(
      c.get("userId"),
      userAddress,
      body.expiry ?? null,
      body.limitAmount ?? null,
      body.limitPeriod ?? null,
      pairingId,
    )
    .run();
  return c.json({ ok: true });
});

/** List this account's approved agent pairings. */
app.get("/api/agent/pairs", async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, key_id, key_type, name, user_address, expiry, limit_amount, limit_period, created_at
       FROM agent_pairings WHERE user_id = ?1 AND status = 'approved'
       ORDER BY created_at DESC`,
    )
    .bind(c.get("userId"))
    .all<{
      id: string;
      key_id: string;
      key_type: string;
      name: string;
      user_address: string | null;
      expiry: number | null;
      limit_amount: string | null;
      limit_period: number | null;
      created_at: number;
    }>();
  return c.json({
    pairs: (results ?? []).map((r) => ({
      id: r.id,
      keyId: r.key_id,
      keyType: r.key_type,
      name: r.name,
      userAddress: r.user_address,
      expiry: r.expiry,
      limitAmount: r.limit_amount,
      limitPeriod: r.limit_period,
      createdAt: r.created_at,
    })),
  });
});

/** Remove a pairing row (call AFTER the on-chain revokeKey tx). */
app.delete("/api/agent/pairs/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM agent_pairings WHERE id = ?1 AND user_id = ?2")
    .bind(c.req.param("id"), c.get("userId"))
    .run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Public chain stats for the welcome page (TIDX + RPC)

app.get("/api/stats", async (c) => {
  try {
    const stats = await tidxQuery(
      c.env,
      "SELECT max(block_num) AS max_block, count(*) AS tx_count FROM txs",
    );
    const transfers = await tidxQuery(
      c.env,
      "SELECT block_num, block_timestamp, tx_hash, token, `from`, `to`, amount FROM token_transfers ORDER BY block_num DESC, tx_idx DESC, log_idx DESC LIMIT 5",
    );
    if (!stats.ok || !transfers.ok) throw new Error(stats.error ?? transfers.error);

    // pathUSD total supply straight from the chain.
    const supplyRes = await fetch(c.env.THAIFI_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: "0x20c0000000000000000000000000000000000000", data: "0x18160ddd" }, "latest"],
        id: 1,
      }),
    });
    const supplyJson = (await supplyRes.json()) as { result?: string };
    const supply = BigInt(supplyJson.result ?? "0x0").toString();

    const col = (name: string) => transfers.columns.indexOf(name);
    const recent = transfers.rows.map((row) => {
      const from = String(row[col("from")]);
      const to = String(row[col("to")]);
      const token = String(row[col("token")]).toLowerCase();
      const meta = KNOWN_TOKENS[token];
      return {
        txHash: String(row[col("tx_hash")]),
        from,
        to,
        direction: "out",
        counterparty: to,
        amount: String(row[col("amount")]),
        tokenSymbol: meta?.symbol ?? `${token.slice(0, 6)}…${token.slice(-4)}`,
        tokenDecimals: meta?.decimals ?? null,
        time: String(row[col("block_timestamp")]),
      };
    });

    const latestBlockRow = stats.rows[0]?.[stats.columns.indexOf("max_block")];
    const txCount = stats.rows[0]?.[stats.columns.indexOf("tx_count")];

    return c.json({
      latestBlock: Number(latestBlockRow ?? 0),
      txCount: Number(txCount ?? 0),
      supply,
      recent,
    });
  } catch (err) {
    console.error("stats failed:", err);
    return c.json({ error: "stats unavailable" }, 502);
  }
});

// Paysolution webhook — temporary debug sink: records every hit (any method,
// query/form/JSON/multipart) to D1; a plain browser GET serves the log viewer.
app.all("/api/payso", handlePayso);

// Paysolution PromptPay top-up orders (session-authenticated; the gateway
// callback itself hits the public /api/payso above).
app.use("/api/payso/order", requireAuth);
app.use("/api/payso/order/*", requireAuth);
app.post("/api/payso/order", handleOrder);
app.get("/api/payso/order/:referenceNo", handleOrderStatus);

export default app;
