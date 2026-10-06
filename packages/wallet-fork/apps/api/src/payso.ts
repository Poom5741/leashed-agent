import type { Context } from "hono";
import type { Env } from "./env";
import type { AgentIdentity } from "./agentAuth";
import { deliveredThbLast24h, isDepositToken, mintOrder } from "./hotwallet";

type Ctx = Context<{ Bindings: Env; Variables: { userId: string } }>;
/** Agent routes (ThaiFiAgent auth) — identity proven on-chain by the middleware. */
type AgentCtx = Context<{ Bindings: Env; Variables: { agent: AgentIdentity } }>;

// Temporary debug sink for the paysolution payment-gateway webhook while we
// discover what it actually sends (GET or POST, form or query). Every hit is
// stored in a D1 table so the integrator can just open this URL in a browser
// to see recent callbacks — no `wrangler tail` needed. Drop both the route and
// the table once paysolution is wired up for real.

const MAX_BODY = 64 * 1024;
const KEEP_ROWS = 50;
const REDACTED_HEADERS = new Set(["cookie", "authorization"]);

// TEMPORARY pin: while integrating, accept only this exact signature and
// reject everything else. Replace with real HMAC verification against the
// paysolution merchant key before this handles real money.
const EXPECTED_SIGNATURE = "mnXSHypdDVApP1k8MuURZo9aztNTf3MjNU";

// PromptPay QR issuance (None-UI API) — params go in the query string.
const PAYSO_API = "https://apis.paysolutions.asia/tep/api/v2/promptpaynew";
const PAYSO_MERCHANT_ID_FALLBACK = "72600138";
const MIN_TOTAL = 6; // payso floor
const MAX_TOTAL = 10000; // our per-order sanity cap (THB)
const QR_TTL_MS = 15 * 60 * 1000; // payso says ~10-15 min; we poll with our own value
const MAX_PENDING_PER_USER = 5;

type PaysoQrResponse = {
  status?: string;
  message?: string;
  data?: {
    orderNo?: number | string;
    referenceNo?: string;
    total?: number;
    orderdatetime?: string;
    expiredate?: string;
    image?: string;
  } | null;
};

let tableEnsured = false;
let ordersEnsured = false;

async function ensureTable(c: { env: Env }) {
  if (tableEnsured) return;
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payso_debug (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       received_at INTEGER NOT NULL,
       method TEXT NOT NULL,
       url TEXT NOT NULL,
       ip TEXT,
       content_type TEXT,
       query TEXT,
       headers TEXT NOT NULL,
       body_text TEXT,
       body_json TEXT,
       sig_valid INTEGER NOT NULL DEFAULT 0
     )`,
  ).run();
  // table created before sig_valid existed (first test deploy) — add it best-effort
  await c.env.DB.prepare("ALTER TABLE payso_debug ADD COLUMN sig_valid INTEGER NOT NULL DEFAULT 0")
    .run()
    .catch(() => {});
  tableEnsured = true;
}

async function ensureOrdersTable(c: { env: Env }) {
  if (ordersEnsured) return;
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payso_orders (
       reference_no TEXT PRIMARY KEY,  -- 12-digit numeric string we generate
       user_id TEXT NOT NULL,
       address TEXT NOT NULL,          -- lowercase wallet address to credit
       total TEXT NOT NULL,            -- THB with 2 decimals, e.g. "100.00"
       status TEXT NOT NULL DEFAULT 'pending', -- pending|paid|delivering|delivered|capped|qr_error|callback:<code>
       payso_order_no TEXT,
       qr_image TEXT,
       expires_at INTEGER,
       created_at INTEGER NOT NULL,
       paid_at INTEGER,
       callback_json TEXT,
       token TEXT,                     -- THCFI | THCOC
       tx_hash TEXT                    -- mint tx once delivered
     )`,
  ).run();
  // columns added after the first deploy — duplicate-column errors ignored
  await c.env.DB.prepare("ALTER TABLE payso_orders ADD COLUMN token TEXT").run().catch(() => {});
  await c.env.DB.prepare("ALTER TABLE payso_orders ADD COLUMN tx_hash TEXT").run().catch(() => {});
  ordersEnsured = true;
}

type PaysoRow = {
  id: number;
  received_at: number;
  method: string;
  url: string;
  ip: string | null;
  content_type: string | null;
  query: string | null;
  headers: string;
  body_text: string | null;
  body_json: string | null;
  sig_valid: number;
};

export async function handlePayso(c: Ctx) {
  const url = new URL(c.req.url);
  const method = c.req.method.toUpperCase();

  // Plain GET (no query string, no body) = a human opening the URL in a
  // browser → serve the log viewer instead of recording the hit.
  let bodyText = "";
  let bodyJson: string | null = null;
  let parsed: Record<string, unknown> | null = null;
  if (method !== "GET" && method !== "HEAD") {
    const ct = (c.req.header("content-type") ?? "").toLowerCase();
    if (ct.includes("multipart/form-data")) {
      try {
        const form = await c.req.parseBody();
        const obj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(form)) {
          obj[k] = typeof v === "string" ? v : `file:${v.name}(${v.size}B)`;
        }
        parsed = obj;
        bodyJson = JSON.stringify(obj);
      } catch {
        // keep raw text below
      }
    }
    bodyText = await c.req.text().catch(() => "");
    if (bodyText.length > MAX_BODY) {
      bodyText = bodyText.slice(0, MAX_BODY) + `\n…[truncated, ${bodyText.length} bytes total]`;
    }
    if (!bodyJson && bodyText) {
      if (ct.includes("application/json")) {
        try {
          const obj = JSON.parse(bodyText) as Record<string, unknown>;
          parsed = obj;
          bodyJson = JSON.stringify(obj);
        } catch {
          // not JSON — fine, raw text is kept
        }
      } else if (ct.includes("form-urlencoded")) {
        const obj: Record<string, string> = {};
        for (const [k, v] of new URLSearchParams(bodyText)) obj[k] = v;
        parsed = obj;
        bodyJson = JSON.stringify(obj);
      }
    }
  }

  if (method === "GET" && url.search.length === 0 && !bodyText) {
    return renderViewer(c);
  }

  // Signature pin: only the expected value passes; everything else is logged
  // (sig_valid = 0) and rejected with 403.
  const signature =
    (typeof parsed?.signature === "string" ? parsed.signature : null) ??
    url.searchParams.get("signature");
  const sigValid = signature === EXPECTED_SIGNATURE;

  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headers[k] = REDACTED_HEADERS.has(k) ? "<redacted>" : v.slice(0, 500);
  });

  try {
    await ensureTable(c);
    await c.env.DB.prepare(
      `INSERT INTO payso_debug
         (received_at, method, url, ip, content_type, query, headers, body_text, body_json, sig_valid)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
      .bind(
        Date.now(),
        method,
        c.req.url,
        c.req.header("cf-connecting-ip") ?? null,
        c.req.header("content-type") ?? null,
        url.search || null,
        JSON.stringify(headers),
        bodyText || null,
        bodyJson,
        sigValid ? 1 : 0,
      )
      .run();
    await c.env.DB.prepare(
      `DELETE FROM payso_debug WHERE id NOT IN
         (SELECT id FROM payso_debug ORDER BY id DESC LIMIT ${KEEP_ROWS})`,
    ).run();
  } catch (err) {
    console.error("payso debug log failed:", err);
  }

  // Forward BEFORE any signature decision: any refno that isn't one of OUR
  // deposit orders belongs to the ThaiFi Pay gateway (pay.thaifi.com) — both
  // valid- and invalid-signature callbacks must reach it (verification happens
  // downstream via the payso status API). Without this, a gateway callback
  // would be answered 200/403 and payso would never retry it.
  const forwardRef =
    (typeof parsed?.refno === "string" && parsed.refno) || url.searchParams.get("refno") || "";
  if (c.env.PAY_FORWARD_URL && forwardRef) {
    const local = await c.env.DB.prepare("SELECT 1 AS ok FROM payso_orders WHERE reference_no = ?1")
      .bind(forwardRef)
      .first()
      .catch(() => null);
    if (!local) {
      try {
        const res = await fetch(c.env.PAY_FORWARD_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": c.env.INTERNAL_CALLBACK_SECRET ?? "",
          },
          body: JSON.stringify({ method, query: Object.fromEntries(url.searchParams), body: parsed ?? bodyText }),
          signal: AbortSignal.timeout(15_000),
        });
        const text = await res.text().catch(() => "");
        return new Response(text, {
          status: res.status,
          headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
        });
      } catch (err) {
        console.error("payso forward to pay worker failed:", err);
        return c.json({ ok: false, error: "forward failed" }, 502);
      }
    }
  }

  if (!sigValid) {
    return c.json({ ok: false, error: "invalid signature" }, 403);
  }

  // Valid gateway callback — try to match it against a top-up order, mark it
  // paid and mint the tokens. Debug log keeps everything either way.
  const result = await processCallback(c, parsed).catch((err) => {
    console.error("payso callback processing failed:", err);
    return { ok: true, note: "processing error" } as ProcessResult;
  });
  if (result.fail) {
    // 502 so paysolution retries its callback → delivery is retried with it
    return c.json({ ok: false, error: "delivery failed", ...result }, 502);
  }
  return c.json({ ok: true, ...result, method, query: Object.fromEntries(url.searchParams) });
}

// ---------------------------------------------------------------------------
// Top-up orders (session routes + agent routes, wired in index.ts)

function genReferenceNo() {
  // 12-digit numeric, unique-ish: 10-digit epoch seconds + 2 random digits.
  // D1 PRIMARY KEY collision retried by the caller.
  const secs = Math.floor(Date.now() / 1000).toString();
  const rand = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");
  return secs + rand;
}

export type CreatedOrder = {
  referenceNo: string;
  total: string;
  orderNo: string | number | null;
  image: string;
  expiresAt: number;
};

export type CreateOrderResult =
  | { ok: true; order: CreatedOrder }
  | { ok: false; status: 400 | 429 | 500 | 502 | 503; error: string; detail?: unknown };

/** Shared core of QR-order creation: validates amount/token, enforces the
 *  pending-order cap (per `userId`), reserves a reference number, calls the
 *  payso PromptPay API and stores the QR. The caller decides who the
 *  recipient (`address`) is — the session route checks D1 ownership, the
 *  agent route passes the on-chain-verified identity. */
async function createQrOrder(
  c: { env: Env },
  args: { userId: string; address: string; amount: number; token: string },
): Promise<CreateOrderResult> {
  if (!Number.isFinite(args.amount) || args.amount < MIN_TOTAL || args.amount > MAX_TOTAL) {
    return { ok: false, status: 400, error: `amount must be ${MIN_TOTAL}-${MAX_TOTAL} THB` };
  }
  const token = args.token.toUpperCase();
  if (!isDepositToken(token)) return { ok: false, status: 400, error: "token must be THCFI or THCOC" };

  const key = c.env.PAYSO_AUTH_KEY;
  if (!key) return { ok: false, status: 503, error: "payso not configured" };

  await ensureOrdersTable(c);
  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM payso_orders WHERE user_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?)",
  )
    .bind(args.userId, Date.now())
    .first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING_PER_USER) {
    return { ok: false, status: 429, error: "too many pending orders" };
  }

  const user = await c.env.DB.prepare("SELECT email, display_name FROM users WHERE id = ?")
    .bind(args.userId)
    .first<{ email: string | null; display_name: string | null }>();
  const email = user?.email || `topup.${args.address.slice(2, 10)}@users.thaifi.com`;
  const name = (user?.display_name || "ThaiFi Wallet User").slice(0, 100);
  const total = args.amount.toFixed(2);

  let referenceNo = "";
  for (let i = 0; i < 5 && !referenceNo; i++) {
    const candidate = genReferenceNo();
    const inserted = await c.env.DB.prepare(
      "INSERT OR IGNORE INTO payso_orders (reference_no, user_id, address, total, status, created_at, token) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6)",
    )
      .bind(candidate, args.userId, args.address, total, Date.now(), token)
      .run();
    if ((inserted.meta.changes ?? 0) > 0) referenceNo = candidate;
  }
  if (!referenceNo) return { ok: false, status: 500, error: "could not allocate reference" };

  const merchantId = c.env.PAYSO_MERCHANT_ID || PAYSO_MERCHANT_ID_FALLBACK;
  const params = new URLSearchParams({
    merchantID: merchantId,
    productDetail: "ThaiCoin top-up",
    customerEmail: email,
    customerName: name,
    total,
    referenceNo,
  });
  let payso: PaysoQrResponse | null = null;
  try {
    const res = await fetch(`${PAYSO_API}?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    payso = (await res.json().catch(() => null)) as PaysoQrResponse | null;
    if (!res.ok || payso?.status !== "success" || !payso.data?.image) {
      await c.env.DB.prepare("UPDATE payso_orders SET status = 'qr_error' WHERE reference_no = ?")
        .bind(referenceNo)
        .run();
      return { ok: false, status: 502, error: "payso qr failed", detail: payso ?? `http ${res.status}` };
    }
  } catch (err) {
    console.error("payso promptpay call failed:", err);
    await c.env.DB.prepare("UPDATE payso_orders SET status = 'qr_error' WHERE reference_no = ?")
      .bind(referenceNo)
      .run();
    return { ok: false, status: 502, error: "payso unreachable" };
  }

  const expiresAt = Date.now() + QR_TTL_MS;
  await c.env.DB.prepare(
    "UPDATE payso_orders SET payso_order_no = ?, qr_image = ?, expires_at = ? WHERE reference_no = ?",
  )
    .bind(String(payso.data.orderNo ?? ""), payso.data.image, expiresAt, referenceNo)
    .run();

  return {
    ok: true,
    order: {
      referenceNo,
      total,
      orderNo: payso.data.orderNo ?? null,
      image: payso.data.image,
      expiresAt,
    },
  };
}

export async function handleOrder(c: Ctx) {
  const body = await c.req
    .json<{ amount?: number | string; address?: string; token?: string }>()
    .catch(() => ({}) as { amount?: number | string; address?: string; token?: string });
  const address = typeof body.address === "string" ? body.address.toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(address)) return c.json({ error: "invalid address" }, 400);
  const userId = c.get("userId");

  // Only credit addresses this account actually controls (has a cloud backup for).
  const owned = await c.env.DB.prepare("SELECT 1 AS ok FROM backups WHERE user_id = ? AND address = ?")
    .bind(userId, address)
    .first();
  if (!owned) return c.json({ error: "address not bound to your account" }, 403);

  const result = await createQrOrder(c, {
    userId,
    address,
    amount: Number(body.amount),
    token: typeof body.token === "string" ? body.token : "",
  });
  if (!result.ok) return c.json({ error: result.error, detail: result.detail }, result.status);
  return c.json(result.order);
}

/** Agent route (ThaiFiAgent auth): the recipient is the wallet the verified
 *  access key belongs to — identity comes from the signature envelope, never
 *  the request body. user_id = the wallet address, so the pending cap is per
 *  wallet. */
export async function handleAgentOrder(c: AgentCtx) {
  const agent = c.get("agent");
  const body = await c.req
    .json<{ amount?: number | string; token?: string }>()
    .catch(() => ({}) as { amount?: number | string; token?: string });
  const address = agent.account.toLowerCase();
  const result = await createQrOrder(c, {
    userId: address,
    address,
    amount: Number(body.amount),
    token: typeof body.token === "string" ? body.token : "",
  });
  if (!result.ok) return c.json({ error: result.error, detail: result.detail }, result.status);
  return c.json(result.order);
}

export async function handleOrderStatus(c: Ctx) {
  await ensureOrdersTable(c);
  const ref = c.req.param("referenceNo");
  const row = await c.env.DB.prepare(
    "SELECT user_id, status, total, paid_at, expires_at, payso_order_no, token, tx_hash FROM payso_orders WHERE reference_no = ?",
  )
    .bind(ref)
    .first<{
      user_id: string;
      status: string;
      total: string;
      paid_at: number | null;
      expires_at: number | null;
      payso_order_no: string | null;
      token: string | null;
      tx_hash: string | null;
    }>();
  if (!row || row.user_id !== c.get("userId")) return c.json({ error: "not found" }, 404);
  return c.json({
    referenceNo: ref,
    status: row.status,
    total: row.total,
    token: row.token,
    orderNo: row.payso_order_no,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    txHash: row.tx_hash,
  });
}

/** Agent route (ThaiFiAgent auth) — visible only to the wallet that owns the
 *  order. Includes the stored QR image so a restarted CLI can re-render it. */
export async function handleAgentOrderStatus(c: AgentCtx) {
  await ensureOrdersTable(c);
  const ref = c.req.param("referenceNo");
  const row = await c.env.DB.prepare(
    "SELECT address, status, total, paid_at, expires_at, payso_order_no, token, tx_hash, qr_image FROM payso_orders WHERE reference_no = ?",
  )
    .bind(ref)
    .first<{
      address: string;
      status: string;
      total: string;
      paid_at: number | null;
      expires_at: number | null;
      payso_order_no: string | null;
      token: string | null;
      tx_hash: string | null;
      qr_image: string | null;
    }>();
  if (!row || row.address !== c.get("agent").account.toLowerCase()) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json({
    referenceNo: ref,
    status: row.status,
    total: row.total,
    token: row.token,
    orderNo: row.payso_order_no,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    txHash: row.tx_hash,
    image: row.qr_image,
  });
}

// Match a valid gateway callback to an order. Only status "CP" (completed)
// marks it paid; paysolution retries callbacks, so everything here is idempotent.
// Delivery = mint 1 THB : 1 token to the order's address. A D1 status
// transition ('paid' → 'delivering') acts as the claim so concurrent retries
// can never double-mint; a failed mint reverts to 'paid' and we return 502 so
// the gateway's own retry schedule re-triggers delivery.
const DAILY_THB_CAP = 50000;

type ProcessResult = { order?: string; note?: string; fail?: boolean };

async function processCallback(c: Ctx, parsed: Record<string, unknown> | null): Promise<ProcessResult> {
  await ensureOrdersTable(c);
  const refno = typeof parsed?.refno === "string" ? parsed.refno : null;
  const status = typeof parsed?.status === "string" ? parsed.status : null;
  if (!refno) return { note: "no refno in callback" };
  const row = await c.env.DB.prepare(
    "SELECT status, address, total, token FROM payso_orders WHERE reference_no = ?",
  )
    .bind(refno)
    .first<{ status: string; address: string; total: string; token: string | null }>();
  if (!row) return { note: "unknown reference" };

  if (status !== "CP") {
    if (!["paid", "delivering", "delivered", "capped"].includes(row.status)) {
      await c.env.DB.prepare(
        "UPDATE payso_orders SET status = ?, callback_json = ? WHERE reference_no = ?",
      )
        .bind(`callback:${status ?? "?"}`, JSON.stringify(parsed), refno)
        .run();
    }
    return { order: status ?? "?" };
  }

  // CP — completed payment
  if (row.status === "delivered") return { order: "already-delivered" };
  if (row.status === "pending") {
    await c.env.DB.prepare(
      "UPDATE payso_orders SET status = 'paid', paid_at = ?, callback_json = ? WHERE reference_no = ?",
    )
      .bind(Date.now(), JSON.stringify(parsed), refno)
      .run();
    row.status = "paid";
  }

  if (row.status === "paid") {
    if (!isDepositToken(row.token ?? "")) {
      await c.env.DB.prepare("UPDATE payso_orders SET status = 'capped' WHERE reference_no = ?")
        .bind(refno)
        .run();
      return { order: "bad-token" };
    }
    const delivered = await deliveredThbLast24h(c, row.address);
    if (delivered + Number(row.total) > DAILY_THB_CAP) {
      // terminal — needs manual review, stop gateway retries with a 200
      await c.env.DB.prepare("UPDATE payso_orders SET status = 'capped' WHERE reference_no = ?")
        .bind(refno)
        .run();
      return { order: "daily-cap-exceeded" };
    }
    const claim = await c.env.DB.prepare(
      "UPDATE payso_orders SET status = 'delivering' WHERE reference_no = ? AND status = 'paid'",
    )
      .bind(refno)
      .run();
    if ((claim.meta.changes ?? 0) !== 1) return { order: "delivery-in-progress" };
    try {
      const txHash = await mintOrder(c, refno);
      await c.env.DB.prepare(
        "UPDATE payso_orders SET status = 'delivered', tx_hash = ? WHERE reference_no = ?",
      )
        .bind(txHash, refno)
        .run();
      return { order: "delivered", note: txHash };
    } catch (err) {
      console.error("payso delivery failed:", err);
      await c.env.DB.prepare(
        "UPDATE payso_orders SET status = 'paid' WHERE reference_no = ? AND status = 'delivering'",
      )
        .bind(refno)
        .run();
      return { order: "delivery-failed", fail: true };
    }
  }

  // 'delivering' — another retry loop is already on it
  return { order: "delivery-in-progress" };
}

function esc(s: string) {  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtTime(ms: number) {
  return (
    new Date(ms).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false }) + " ICT"
  );
}

async function renderViewer(c: Ctx) {
  let rows: PaysoRow[] = [];
  let error: string | null = null;
  try {
    await ensureTable(c);
    const res = await c.env.DB.prepare(
      "SELECT * FROM payso_debug ORDER BY id DESC LIMIT 50",
    ).all<PaysoRow>();
    rows = res.results ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const cards = rows
    .map((r) => {
      const body = r.body_json
        ? `<div class="label">body (parsed)</div><pre>${esc(r.body_json)}</pre>`
        : r.body_text
          ? `<div class="label">body (raw)</div><pre>${esc(r.body_text)}</pre>`
          : "";
      const query = r.query
        ? `<div class="label">query</div><pre>${esc(r.query)}</pre>`
        : "";
      return `<div class="card">
        <div class="head">
          <span class="method ${esc(r.method)}">${esc(r.method)}</span>
          <span class="sig ${r.sig_valid ? "ok" : "bad"}">sig ${r.sig_valid ? "✓" : "✗ rejected"}</span>
          <span class="time">${esc(fmtTime(r.received_at))}</span>
          <span class="meta">ip ${esc(r.ip ?? "?")} · ${esc(r.content_type ?? "no content-type")}</span>
        </div>
        ${query}
        ${body}
        <div class="label">headers</div>
        <pre>${esc(
          Object.entries(JSON.parse(r.headers) as Record<string, string>)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n"),
        )}</pre>
      </div>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>/api/payso — webhook debug</title>
<style>
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #01052d;
         color: #eef0fa; margin: 0; padding: 24px; line-height: 1.5; }
  h1 { font-size: 1.1rem; color: #e8c25a; margin: 0 0 4px; }
  .hint { color: #a6adcf; font-size: .8rem; margin-bottom: 20px; }
  .card { border: 1px solid rgba(212,175,55,.25); border-radius: 10px; padding: 12px 14px;
          margin-bottom: 14px; overflow: auto; }
  .head { display: flex; gap: 12px; flex-wrap: wrap; align-items: baseline; margin-bottom: 6px; }
  .method { font-weight: 700; }
  .method.POST { color: #7fe0a7; } .method.GET { color: #7fb8ff; }
  .sig { font-size: .75rem; }
  .sig.ok { color: #7fe0a7; } .sig.bad { color: #ff8f8f; font-weight: 700; }
  .time { color: #e8c25a; font-size: .8rem; }
  .meta { color: #a6adcf; font-size: .75rem; }
  .label { color: #a6adcf; font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; margin-top: 8px; }
  pre { margin: 2px 0 0; white-space: pre-wrap; word-break: break-all; font-size: .8rem; }
  .empty { color: #a6adcf; }
  .err { color: #ff8f8f; font-size: .8rem; }
</style></head><body>
<h1>/api/payso — paysolution webhook debug</h1>
<div class="hint">บันทึก 50 รายการล่าสุด · รีเฟรชอัตโนมัติทุก 5 วินาที · ทุก request ที่มี query หรือ body จะตอบ 200 {ok:true} กลับไป</div>
${error ? `<div class="err">db error: ${esc(error)}</div>` : ""}
${rows.length === 0 && !error ? '<div class="empty">ยังไม่มี request เข้ามา — รอ webhook หรือยิงทดสอบด้วย curl ได้เลย</div>' : cards}
</body></html>`;

  return c.html(html);
}
