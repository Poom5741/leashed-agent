# Slice 2 SPA green — `apps/web-agents` in-browser click test (M11d)

## Result
- **6/6 click-test steps pass.** S2.R5 + S2.R6 transition from pending → live.
- **API contract confirmed end-to-end** against `apps/api-agents` running on
  `http://127.0.0.1:8787` + SPA on `http://127.0.0.1:5173` (Vite proxy
  forwards `/api/*` to the worker).

## How the test was run

Driven from the agent via the ZCode in-app browser (`browser-use` plugin,
Playwright locators built from `domSnapshot()`). No screenshots taken —
every check is a structural locator state read.

```
const browser = await agent.browsers.getDefault();
const tab = await browser.tabs.new();
await tab.goto("http://127.0.0.1:5173/agents");
await tab.playwright.waitForLoadState({ state: "domcontentloaded" });
// ... per-step snapshots + locator actions, see step logs below
```

Tab id (for replay): `iab-tab:dd21ce6c-aac1-4714-9a19-4440dffcf0b6`.

## Step-by-step

### Step 1 — empty state ("No agents yet")

After deleting the temporary local seed row + `tab.goto("/agents")`:

```yaml
- banner:
  - link "Leashed Agent Platform": /url: /agents
  - navigation:
    - link "Agents": /url: /agents
- main:
  - heading "No agents yet" [level=1]
  - paragraph: "Deploy one from the CLI:"
  - code: npx @leashed/wallet-cli-platform agent deploy noodle-shop
```

✅ Renders the h1 + CLI hint. Step 1 PASS.

### Step 2 — seed `agent_pairings` row

```bash
cd apps/api-agents
wrangler d1 execute leashed-agents-test-db --command "
  INSERT INTO agent_pairings
    (id, user_id, code, key_id, key_type, name, status,
     expiry, limit_amount, limit_period, template, created_at)
  VALUES ('test01','user_alice','0','0xaa','p256','',
          'approved',1893456000,'2000000',2592000,
          'noodle-shop',1700000000000)
" --local
# changes: 1
```

⚠️ **Env-setup gotcha** (now in HANDOFF): the handoff originally wrote the
seed with `--remote`, while `pnpm dev` binds the local D1 (`Mode: local`).
A fresh checkout must run **both** the local migrations apply and the
local seed insert before `pnpm dev` serves a non-empty list. The first
attempt of step 3 returned HTTP 500 with `D1_ERROR: no such table:
agent_pairings` until the local migrations were applied.

### Step 3 — reload `/agents`, list shows the seeded card

```yaml
- main:
  - heading "Your leashed agents" [level=1]
  - 'link "noodle-shop approved 0xaa limit: 2000000 period: 2592000s"':
      /url: /agents/0xaa
    - generic: noodle-shop
    - generic: approved
    - code: "0xaa"
    - generic: "limit: 2000000"
    - generic: "period: 2592000s"
```

✅ One card, template `noodle-shop`, status `approved`, keyId `0xaa`. Step 3 PASS.

### Step 4 — click card → `/agents/0xaa` passbook

Locator: `getByRole("link", { name: /noodle-shop.*0xaa/ })` (count=1,
unique). `card.click()` → `tab.url()` = `http://127.0.0.1:5173/agents/0xaa`.

```yaml
- main:
  - link "← back to agents": /url: /agents
  - heading "noodle-shop" [level=1]
  - generic: keyId
  - code: "0xaa"
  - generic: status
  - generic: approved
  - generic: leaseState
  - generic: ok
  - generic: limit
  - code: 2000000 / 2592000s
  - heading "Receipts" [level=2]
  - paragraph:
    - text: "No receipts yet. Run the agent:"
    - code: npx @leashed/wallet-cli-platform agent run --brief "…" --budget 1.5
```

✅ h1, keyId, status=approved, leaseState=ok, limit `2000000/2592000s`,
receipts placeholder + CLI hint. Step 4 PASS.

### Step 5 — `/agents/0xghost` → 404

`tab.goto("http://127.0.0.1:5173/agents/0xghost")` →

```yaml
- main:
  - paragraph: "Failed to load passbook: 404 Not Found"
  - link "← back to agents": /url: /agents
```

✅ Step 5 PASS.

### Step 6 — API status codes (dev-tools network equivalent)

| Endpoint | Code |
|---|---|
| `GET /api/agents` | 200 |
| `GET /api/agents/0xaa/passbook` | 200 |
| `GET /api/agents/0xghost/passbook` | 404 |
| `GET /api/healthz` | 200 |

✅ Step 6 PASS.

## What this confirms

- S2.R5 (`/agents` SPA list page) — **live**.
- S2.R6 (`/agents/:keyId` passbook page) — **live**.
- Front-end SPA + backend Hono agree on:
  - stub-auth via `X-Stub-User: user_alice`
  - shape of the list card (template + status + keyId + limit + period)
  - shape of the passbook view (keyId + status + leaseState + limit + receipts[])
  - 404 error surface for unknown keyIds
  - Vite proxy `/api` → `:8787` working

## What this does NOT confirm (deferred to slice 3)

- Revoke button on each card — UI not yet wired (per `slice-2-spa.md`,
  revoke ships with slice 3 alongside `POST /api/audit`).
- "Rerun audit" button on the passbook — placeholder copy already
  present, action lands in slice 3.

## Cross-references

- Feature map: F12 row now reads `live`, evidence points here.
- Matrix: S2.R1–R7 all now read `live`; R5 + R6 evidence points here.
- HANDOFF: env-setup note appended (`--local` migrations + seed).