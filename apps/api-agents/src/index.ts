/**
 * Leashed Agent Platform — /agents collection (slice 2).
 *
 * Public surface:
 *   POST   /api/agents                       — S2.R1: create a new leashed agent
 *   GET    /api/agents                       — S2.R2: list the user's agents
 *   GET    /api/agents/:keyId/passbook       — S2.R3: per-agent passbook
 *   DELETE /api/agents/:keyId                — S2.R4: revoke an agent
 *
 * Auth: stubbed `requireAuth` middleware extracts the user from a header for
 * the pre-flight. Production wire-in: swap `stubAuth` for the upstream wallet
 * fork's `requireAuth` (see slice-2-spec.md).
 *
 * Storage: Cloudflare D1 (`agent_pairings` table, extended with `template`).
 */

import { Hono } from "hono";
import {
  insertAgent,
  listAgentsByUser,
  getAgentByKeyId,
  revokeAgent,
  type D1Database,
} from "./db.js";

export type Bindings = { DB: D1Database };
export type Variables = { userId: string };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("/api/agents/*", async (c, next) => {
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
  return c.json({
    keyId: row.key_id,
    template: row.template,
    status: row.status,
    leaseState: row.status === "revoked" ? "revoked" : "ok",
    receipts: [],
    limitAmount: row.limit_amount,
    limitPeriod: row.limit_period,
    createdAt: row.created_at,
  });
});

app.delete("/api/agents/:keyId", async (c) => {
  const userId = c.get("userId");
  const keyId = c.req.param("keyId");
  const { changed, status } = await revokeAgent(c.env.DB, userId, keyId);
  if (!status) return c.json({ error: "not found" }, 404);
  return c.json({ keyId, status, revoked: changed });
});

app.get("/api/healthz", (c) => c.json({ ok: true }));

export default app;