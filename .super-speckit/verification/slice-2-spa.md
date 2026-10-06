# Slice 2 SPA — `apps/web-agents` (M11b)

## What's committed
- React 19 + react-router-dom v7 + Vite 6 SPA scaffold
- 2 pages: `/agents` (list), `/agents/:keyId` (passbook drilldown)
- API client (`src/api/client.ts`) calls the slice-2 Hono worker at `/api/agents`
- Paper-ledger visual style carried from the v1 dashboard (`apps/dashboard/public/index.html`):
  - bg `#f6f1e7`, ink `#1a1a1a`, stamp `#a83232`, monospace ledger typography
- Vite dev server proxies `/api` → `http://127.0.0.1:8787` (the Hono worker)

## What's NOT in this commit (manual verification needed)

**S2.R5 — list page renders.** `pnpm dev` then open http://127.0.0.1:5173/agents.
Expected: card grid with one card per agent from `GET /api/agents`. With the
test D1 empty, the page should show the "No agents yet" empty state.

**S2.R6 — passbook page renders.** Click any agent card → navigates to
`/agents/:keyId`. Page shows template, keyId, status, leaseState, limit.
Receipts list shows empty state since `receipts: []` in v0.

## How to verify locally

Two terminals:

```
# terminal 1 — Hono worker
cd apps/api-agents
pnpm dev
# → wrangler dev on :8787

# terminal 2 — SPA
cd apps/web-agents
pnpm dev
# → vite dev on :5173
```

Then open http://127.0.0.1:5173/agents in a browser. Use the test D1 to seed
some agents via `wrangler d1 execute leashed-agents-test-db --command "..."`
if you want cards > empty.

## Manual verification checklist

- [ ] Open `/agents` → see "No agents yet" empty state (initial)
- [ ] Seed 1 agent via D1 → reload `/agents` → see 1 card with template + keyId
- [ ] Click the card → navigates to `/agents/<keyId>` → passbook page renders
- [ ] Passbook shows `status`, `leaseState`, `limit`, empty receipts list
- [ ] Hit `http://127.0.0.1:5173/agents/0xghost` → passbook page shows 404 from the API
- [ ] Browser dev tools network tab: all `/api/*` calls return 200 (except 404 case)

## Files

```
apps/web-agents/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    ├── api/client.ts
    └── pages/
        ├── AgentsListPage.tsx
        └── PassbookPage.tsx
```

## Build sanity

`pnpm build` → 44 modules transformed, 266 KB JS / 84 KB gzipped. Build time 841ms. No warnings.

## Replay

```bash
cd leashed-agent
pnpm install
cd apps/web-agents
pnpm typecheck    # clean
pnpm build        # vite build OK
pnpm dev          # :5173
```

## S2.R row status

- S2.R5 — **pending** until user clicks through the live SPA
- S2.R6 — **pending** until user clicks into a passbook