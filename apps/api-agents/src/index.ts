/**
 * Leashed Agent Platform — /agents collection (slice 2) + /api/audit (slice 3).
 *
 * Public surface:
 *   POST   /api/agents                       — S2.R1: create a new leashed agent
 *   GET    /api/agents                       — S2.R2: list the user's agents
 *   GET    /api/agents/:keyId/passbook       — S2.R3 + S3.R3: per-agent passbook + latest audit
 *   DELETE /api/agents/:keyId                — S2.R4: revoke an agent
 *   POST   /api/audit                        — S3.R1: run the CRE auditor on demand
 *
 * Auth: stubbed `requireAuth` middleware extracts the user from a header for
 * the pre-flight. Production wire-in: swap `stubAuth` for the upstream wallet
 * fork's `requireAuth` (see slice-2-spec.md).
 *
 * Storage: Cloudflare D1 (`agent_pairings` + `agent_audit_batches`).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  insertAgent,
  listAgentsByUser,
  getAgentByKeyId,
  revokeAgent,
  insertAuditBatch,
  latestAuditForKey,
  insertService,
  getServiceById,
  listServices,
  type D1Database,
} from "./db.js";
import { auditReceipts, type AuditVerdict } from "./auditor.js";
import { makeServiceId } from "./services.js";
import faucetCardanoApp from "./faucet-cardano.js";
import receiptSellerApp, { type SellerBindings } from "./receipt-seller.js";

export type Bindings = SellerBindings & { ALLOWED_ORIGINS?: string };
export type Variables = { userId: string };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS — allow the deployed SPA + the workers.dev preview + localhost dev.
// Reads comma-separated ALLOWED_ORIGINS env var so the deployment can
// tighten without redeploying code. Wildcard fallback when origin is
// unset (e.g. server-to-server).
const allowed = (envOrigins: string | undefined) => {
  const defaults = [
    "http://localhost:5173",
    "http://localhost:8787",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8787",
    "https://leashed-api-agents.poom-a1d.workers.dev",
    "https://leashed-agent-platform.pages.dev",
    "https://leashed-agent-platform.poom-a1d.pages.dev",
  ];
  const list = envOrigins
    ? envOrigins.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return [...defaults, ...list];
};

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const envOrigins = (c.env as { ALLOWED_ORIGINS?: string }).ALLOWED_ORIGINS;
      const list = allowed(envOrigins);
      // No Origin header (server-to-server, curl, etc.) → wildcard
      if (!origin) return "*";
      // Trusted origin → reflect it back
      if (list.includes(origin)) return origin;
      // Known origin but untrusted → deny explicitly
      return null;
    },
    allowHeaders: ["Content-Type", "X-Stub-User", "Payment-Signature", "X-Payment"],
    exposeHeaders: ["Payment-Required", "Payment-Response", "X-Payment-Response"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    maxAge: 86400,
    credentials: false,
  }),
);

app.use("/api/agents/*", async (c, next) => {
  const userId = c.req.header("X-Stub-User");
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", userId);
  await next();
});

app.use("/api/audit", async (c, next) => {
  const userId = c.req.header("X-Stub-User");
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", userId);
  await next();
});

app.post("/api/agents", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    template?: string;
    keyId?: string;
    leash?: { limitAmount?: string; limitPeriod?: number; expiry?: number };
  }>();
  if (!body.template || !body.keyId || !body.leash?.limitAmount || !body.leash.limitPeriod || !body.leash.expiry) {
    return c.json({ error: "missing required fields" }, 400);
  }
  const id = crypto.randomUUID();
  await insertAgent(c.env.DB, {
    id,
    userId,
    userAddress: null,
    keyId: body.keyId,
    template: body.template,
    leash: {
      limitAmount: body.leash.limitAmount,
      limitPeriod: body.leash.limitPeriod,
      expiry: body.leash.expiry,
    },
  });
  return c.json({
    id,
    keyId: body.keyId,
    template: body.template,
    status: "pending" as const,
  });
});

app.get("/api/agents", async (c) => {
  const userId = c.get("userId");
  const rows = await listAgentsByUser(c.env.DB, userId);
  return c.json({
    agents: rows.map((r) => ({
      id: r.id,
      keyId: r.key_id,
      template: r.template,
      status: r.status,
      userAddress: r.user_address,
      expiry: r.expiry,
      limitAmount: r.limit_amount,
      limitPeriod: r.limit_period,
      createdAt: r.created_at,
    })),
  });
});

app.get("/api/agents/:keyId/passbook", async (c) => {
  const userId = c.get("userId");
  const keyId = c.req.param("keyId");
  const row = await getAgentByKeyId(c.env.DB, userId, keyId);
  if (!row) return c.json({ error: "not found" }, 404);
  const latest = await latestAuditForKey(c.env.DB, userId, keyId);
  return c.json({
    keyId: row.key_id,
    template: row.template,
    status: row.status,
    leaseState: row.status === "revoked" ? "revoked" : "ok",
    receipts: [],
    limitAmount: row.limit_amount,
    limitPeriod: row.limit_period,
    createdAt: row.created_at,
    latestAudit: latest
      ? {
          verdict: latest.verdict,
          checked: latest.checked_count,
          totalBase: latest.total_base,
          otherBase: latest.other_base,
          problems: JSON.parse(latest.problems_json) as string[],
          batchId: latest.id,
          attestationTx: latest.attestation_tx,
          createdAt: latest.created_at,
        }
      : null,
  });
});

app.delete("/api/agents/:keyId", async (c) => {
  const userId = c.get("userId");
  const keyId = c.req.param("keyId");
  const { changed, status } = await revokeAgent(c.env.DB, userId, keyId);
  if (!status) return c.json({ error: "not found" }, 404);
  return c.json({ keyId, status, revoked: changed });
});

// Slice 3 — POST /api/audit. Wraps the CRE auditor algorithm in process so
// any wallet holder can audit any of their own agents on demand and have
// the verdict persisted to D1. Real Chainlink CRE attestation is kept on
// the cron-triggered workflow (see workflows/leashed-auditor/); this route
// is the per-user, on-demand UX layer with attestationTx=null.
app.post("/api/audit", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    keyId?: string;
    creditCapBase?: string;
    receipts?: Parameters<typeof auditReceipts>[0]["receipts"];
    agent?: Parameters<typeof auditReceipts>[0]["agent"];
  }>();
  if (!body.keyId) return c.json({ error: "missing keyId" }, 400);

  const agentRow = await getAgentByKeyId(c.env.DB, userId, body.keyId);
  if (!agentRow) return c.json({ error: "not found" }, 404);

  const creditCapBase = body.creditCapBase ?? agentRow.limit_amount ?? "0";
  // On-demand API has no leash telemetry feed yet; pass limitLeft="" so the
  // leash cross-check (main.ts:71-73) is a no-op and the empty-passbook WARN
  // branch is the dominant outcome. Real telemetry wire-in lands in slice 5.
  const result = auditReceipts(
    { receipts: body.receipts ?? [], agent: body.agent ?? { limitLeft: "" } },
    creditCapBase,
  );

  const id = crypto.randomUUID();
  const now = Date.now();
  await insertAuditBatch(c.env.DB, {
    id,
    keyId: body.keyId,
    userId,
    verdict: result.verdict as AuditVerdict,
    checkedCount: result.checked,
    totalBase: result.totalBase,
    otherBase: result.otherBase,
    problemsJson: JSON.stringify(result.problems),
    attestationTx: null,
    createdAt: now,
  });

  return c.json({
    keyId: body.keyId,
    verdict: result.verdict,
    checked: result.checked,
    totalBase: result.totalBase,
    otherBase: result.otherBase,
    problems: result.problems,
    attestationTx: null,
    batchId: id,
    createdAt: now,
  });
});

app.route("/", faucetCardanoApp);
app.route("/", receiptSellerApp);

app.get("/api/healthz", (c) => c.json({ ok: true }));

// ---------- Slice 4 — public marketplace services registry ----------
//
// POST is signed-payload style: the slice-1 CLI constructs `{payload,
// signature, sellerAddress}` where `payload` is canonicalised JSON of the
// service description and `signature` is an EIP-191 personal_sign over
// that canonical payload. For slice 4 we treat the signature as metadata
// (the row stores it verbatim); real secp256k1 + keccak256 signature
// recovery lands in slice 5.
//
// GET is fully public — discovery is open; the row's `signature` column
// is intentionally omitted from the response.

app.post("/v1/services", async (c) => {
  const body = await c.req.json<{
    payload?: {
      endpointUrl?: string;
      rail?: string;
      priceBase?: string;
      token?: string;
      sellerAddress?: string;
      nonce?: string;
    };
    signature?: string;
    sellerAddress?: string;
  }>();
  const p = body.payload;
  if (
    !p ||
    !p.endpointUrl ||
    !p.rail ||
    !p.priceBase ||
    !p.token ||
    !p.sellerAddress ||
    !body.signature ||
    !body.sellerAddress
  ) {
    return c.json({ error: "missing required fields" }, 400);
  }
  if (body.sellerAddress !== p.sellerAddress) {
    return c.json({ error: "sellerAddress mismatch between payload and wrapper" }, 400);
  }

  const id = makeServiceId(p.endpointUrl, p.sellerAddress);
  const existing = await getServiceById(c.env.DB, id);
  if (existing) {
    return c.json({ id: existing.id, endpointUrl: existing.endpoint_url }, 200);
  }

  await insertService(c.env.DB, {
    id,
    endpointUrl: p.endpointUrl,
    rail: p.rail,
    priceBase: p.priceBase,
    token: p.token,
    sellerAddress: p.sellerAddress,
    signature: body.signature,
    createdAt: Date.now(),
  });
  return c.json({ id, endpointUrl: p.endpointUrl }, 201);
});

app.get("/v1/services", async (c) => {
  const q = c.req.query("q");
  const rows = await listServices(c.env.DB, { q });
  return c.json({
    services: rows.map((r) => ({
      id: r.id,
      endpointUrl: r.endpoint_url,
      rail: r.rail,
      priceBase: r.price_base,
      token: r.token,
    })),
  });
});

export default app;
