# Slice 2 spec — wallet /agents SPA + Hono API + D1

> **Landing site (user-confirmed 2026-10-06): leashed-agent monorepo.** No separate wallet-fork repo for this slice.
> New apps: `leashed-agent/apps/api-agents/` (Hono worker, Cloudflare D1) and `leashed-agent/apps/web-agents/` (React 19 + Vite SPA).
> Source of truth: `leashed-agent/docs/verification-matrix.md` rows S2.R1–S2.R7.

## D1 schema changes — `apps/api-agents/migrations/0003_agents_template.sql`

```sql
-- Slice 2 — add template + revoked status to agent_pairings.
-- Reuses the existing table; the new /agents collection is just a view
-- over rows where status in ('approved', 'revoked').

ALTER TABLE agent_pairings ADD COLUMN template TEXT NOT NULL DEFAULT 'legacy';
-- Existing rows are backfilled to 'legacy'. New rows from POST /api/agents
-- carry the template the user picked (e.g. 'noodle-shop', 'poster-bot').

-- status column is TEXT (no enum constraint), so 'revoked' is allowed
-- without DDL. The existing check (if any) is application-level.
-- No new index needed — idx_pairings_user (user_id, status) already
-- supports "list this user's agents" efficiently.
```

## Hono API contract — new routes in `apps/api-agents/src/index.ts`

All routes sit under the existing `requireAuth` middleware (already applied
to `/api/agent/*`). The new routes reuse the same `AppEnv` type and `c.env.DB`.

```typescript
// ---------------------------------------------------------------------------
// Slice 2 — /agents collection (the public surface of the platform's
// multi-agent view). Sits next to the existing /api/agent/pairs* block.
//
// Auth: requireAuth (already mounted on /api/agent/* above).
// Source of truth: agent_pairings D1 table.
// ---------------------------------------------------------------------------

// S2.R1 — Create a new leashed agent. CLI calls this AFTER on-chain
// authorizeKey succeeds (the on-chain key is the source of truth; this row
// is the metadata for the SPA).
app.post("/api/agents", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    template: string;
    keyId: string;
    leash: { limitAmount: string; limitPeriod: number; expiry: number };
  }>();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO agent_pairings
       (id, user_id, code, key_id, key_type, name, status, user_address,
        expiry, limit_amount, limit_period, template, created_at)
     VALUES (?, ?, '', ?, 'p256', '', 'pending', ?, ?, ?, ?, ?)`
  ).bind(
    id, userId, body.keyId,
    (await getUserById(c.env.DB, userId))?.email ?? "",
    body.leash.expiry, body.leash.limitAmount, body.leash.limitPeriod,
    body.template, Date.now(),
  ).run();
  return c.json({ id, keyId: body.keyId, status: "pending", template: body.template });
});

// S2.R2 — List the user's agents. Filters by user_id (no cross-user leak).
app.get("/api/agents", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `SELECT id, key_id, template, status, user_address, expiry,
            limit_amount, limit_period, created_at
       FROM agent_pairings
       WHERE user_id = ? AND status IN ('approved', 'pending', 'revoked')
       ORDER BY created_at DESC`
  ).bind(userId).all();
  return c.json({ agents: results ?? [] });
});

// S2.R3 — Per-agent passbook. Reads the same ledger the dashboard reads
// (apps/agent/data/ledger.json or the on-chain leash state via TIDX). For
// the platform passbook, we keep it simple: return the stored receipts
// from agent_pairings (if we add a `receipts_json` column later) OR proxy
// to the existing /api/state (dashboard) for now.
app.get("/api/agents/:keyId/passbook", async (c) => {
  const userId = c.get("userId");
  const keyId = c.req.param("keyId");
  const row = await c.env.DB.prepare(
    `SELECT id, key_id, template, status, limit_amount, limit_period,
            user_address, created_at
       FROM agent_pairings
       WHERE key_id = ? AND user_id = ?`
  ).bind(keyId, userId).first();
  if (!row) return c.json({ error: "not found" }, 404);
  // TODO slice 2: fetch receipts from agent ledger (apps/agent/data/ledger.json
  // in leashed-agent, keyed by keyId). For v0, return an empty receipts list
  // + the lease state derived from status + limit_amount.
  return c.json({
    keyId,
    template: row.template,
    status: row.status,
    leaseState: row.status === "revoked" ? "revoked" : "ok",
    receipts: [],
    limitAmount: row.limit_amount,
    limitPeriod: row.limit_period,
    createdAt: row.created_at,
  });
});

// S2.R4 — Mark an agent revoked. The SPA fires on-chain revokeKey first;
// this endpoint is the metadata update. Idempotent: calling twice on the
// same key is a no-op (returns 200 with current state).
app.delete("/api/agents/:keyId", async (c) => {
  const userId = c.get("userId");
  const keyId = c.req.param("keyId");
  const result = await c.env.DB.prepare(
    `UPDATE agent_pairings
        SET status = 'revoked'
        WHERE key_id = ? AND user_id = ? AND status != 'revoked'`
  ).bind(keyId, userId).run();
  if (result.meta.changes === 0) {
    // No update happened — already revoked OR not found. Return current state.
    const row = await c.env.DB.prepare(
      `SELECT status FROM agent_pairings WHERE key_id = ? AND user_id = ?`
    ).bind(keyId, userId).first();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ keyId, status: row.status });
  }
  return c.json({ keyId, status: "revoked" });
});
```

## SPA page — new `/agents` route in `apps/web-agents/src/`

1. Add a new route at `/agents` (or `/dashboard/agents` if the wallet SPA nests it).
2. Use the existing `useSession` hook to get the authed session, then `fetch('/api/agents')` on mount.
3. Each agent card shows: template name, keyId (truncated), status badge, [revoked] tag if `status === 'revoked'`.
4. Clicking a card navigates to `/agents/:keyId` which shows the passbook from `GET /api/agents/:keyId/passbook`.
5. Reuse the v1 dashboard's "paper ledger" design tokens (color palette + typography) — the SPA scout has those extracted.

## Test briefs (for slice 2 test-designer)

Each S2.R row gets a Hono test fixture:

- **S2.R1**: pre-seeded user, POST with `{template: 'noodle-shop', keyId: '0xabc…', leash: {...}}`, assert row exists with the right fields, assert the returned `id` is a UUID.
- **S2.R2**: pre-seeded 3 agents under user A and 1 agent under user B, GET as A, assert 3 returned, none are B's.
- **S2.R3**: pre-seeded 1 agent with known leash, GET passbook, assert `leaseState` and the receipt shape.
- **S2.R4**: pre-seeded 1 agent (status='approved'), DELETE it, assert row's status is now 'revoked'; DELETE again, assert idempotent.
- **S2.R5**: in a browser, open the /agents page, assert 2 cards render with the right template + status.
- **S2.R6**: click into one card, assert passbook renders.
- **S2.R7**: apply migration 0003, inspect schema, assert `template` column exists, assert existing rows have `template='legacy'`.

## Worktree policy

User opted to edit on `main` directly (36h deadline, kit policy `maker_requires_isolated_worktree: true` overridden for this run). All slice-2 work commits to `main` of `leashed-agent`.
