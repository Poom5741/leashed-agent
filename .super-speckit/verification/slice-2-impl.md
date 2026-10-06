# Slice 2 implementation — `apps/api-agents` (M11a)

## Result
- **8/8 tests pass** (auth guard + S2.R1, S2.R2, S2.R3 happy + 404, S2.R4 happy + idempotent, S2.R7 schema default)
- **`pnpm typecheck` clean** for `apps/api-agents` (pre-existing `payments-cardano` failure unaffected)

## Files

```
apps/api-agents/
├── package.json                          # hono + @cloudflare/workers-types + wrangler + tsx
├── tsconfig.json                        # extends base, adds workers types
├── wrangler.jsonc                       # binds leashed-agents-test-db (1c5cb0b0…7b4b)
├── src/
│   ├── db.ts                            # D1 query helpers: insertAgent, listAgentsByUser,
│   │                                      getAgentByKeyId, revokeAgent
│   └── index.ts                         # Hono app: 4 routes + stub requireAuth (X-Stub-User)
└── test/
    └── agents.test.ts                    # 8 tests against better-sqlite3 in-memory fake D1
```

## API surface (matches `slice-2-spec.md`)

- `POST   /api/agents` — body `{template, keyId, leash:{limitAmount,limitPeriod,expiry}}` → `{id, keyId, template, status:"pending"}`
- `GET    /api/agents` — returns `{agents:[{id, keyId, template, status, userAddress, expiry, limitAmount, limitPeriod, createdAt}]}` filtered by `user_id`
- `GET    /api/agents/:keyId/passbook` — returns `{keyId, template, status, leaseState, receipts:[], limitAmount, limitPeriod, createdAt}`; `leaseState="revoked"` if revoked else "ok"; 404 if not found
- `DELETE /api/agents/:keyId` — sets `status='revoked'`; idempotent (returns current state if already revoked); 404 if not found
- `GET    /api/healthz` — `{ok: true}`

## Auth

Stubbed: middleware reads `X-Stub-User` header. Production wire-in: replace `app.use("/api/agents/*", async (c, next) => { const userId = c.req.header("X-Stub-User"); ... })` with the upstream wallet fork's `requireAuth` (per `slice-2-spec.md` "Auth" section).

## D1 query interface

`apps/api-agents/src/db.ts` exports `D1Database` + `D1Prepared` types that match Cloudflare's D1 binding shape (`prepare/bind/first/all/run`). The `better-sqlite3` test fake implements the same interface so the same queries run in both.

## Test fake

`apps/api-agents/test/agents.test.ts` uses `better-sqlite3` in `:memory:` mode wrapped in the `D1Database` interface. Same migration files (0001, 0002, 0003) apply at test bootstrap, so the test exercises the actual SQL the production D1 will run.

## Replay

```bash
cd leashed-agent
pnpm install
cd apps/api-agents
pnpm test           # 8/8 green
pnpm typecheck      # clean
pnpm dev           # wrangler dev — :8787 (or configured port)
```

## What's NOT in this commit

- `apps/web-agents/` (the SPA half of slice 2) — separate commit M11b, blocked on UI verification per `journey_ux.required_for_ui_changes: true`.
- Real auth middleware — kept as `X-Stub-User` stub for the pre-flight; slice 2 production wire-in lands when the upstream wallet fork's `requireAuth` is vendored into the monorepo.

## S2.R row status update

- S2.R1 — **live** (test: "S2.R1: POST /api/agents creates a new agent with template='noodle-shop'")
- S2.R2 — **live** (test: "S2.R2: GET /api/agents returns the user's agents only (no cross-user leak)")
- S2.R3 — **live** (tests: passbook happy + 404)
- S2.R4 — **live** (tests: revoke happy + idempotent)
- S2.R5 — **pending** (requires SPA + manual journey)
- S2.R6 — **pending** (requires SPA + manual journey)
- S2.R7 — **live** (test: "schema has 12 columns including template (default 'legacy')")