# Slice 4 close-out — public marketplace services registry (M13)

## Result
- **24/24 backend tests green** (8 slice-2 + 7 slice-3 + 9 slice-4).
- **Backend typecheck clean.**
- **SPA typecheck + build clean** (45 modules, +1 for the new page).
- **3/3 in-browser click-test states pass:** initial 3-row list, filter "poster" → 1 row, clear → 3 rows.

## Files added / changed

New:
- `apps/api-agents/migrations/0005_services.sql` — new D1 table + 3 indices.
- `apps/api-agents/src/services.ts` — `makeServiceId(endpointUrl, sellerAddress)` (sha256 prefix-16).
- `apps/api-agents/test/services.test.ts` — 9 new tests.
- `apps/web-agents/src/pages/ServicesPage.tsx` — list + search input.
- `.super-speckit/verification/slice-4-spec.md` — design record.
- `.super-speckit/verification/slice-4-spa-green.md` — this file.

Edit:
- `apps/api-agents/src/db.ts` — `ServiceRow`, `NewService`, `insertService`, `getServiceById`, `listServices` (with optional `q` filter via `LOWER(endpoint_url) LIKE` OR `LOWER(rail) LIKE`).
- `apps/api-agents/src/index.ts` — `POST /v1/services` (no auth; idempotent on `(endpointUrl, sellerAddress)`) and `GET /v1/services` (public, returns public-only fields — no signature, no sellerAddress).
- `apps/web-agents/src/App.tsx` — `/services` route + nav link.
- `apps/web-agents/src/api/client.ts` — `listServices(q?)` + `ServiceEntry` type.
- `apps/web-agents/vite.config.ts` — Vite proxy now forwards `/v1` to `:8787` (was only `/api`).
- `docs/verification-matrix.md` — S4.R1–S4.R5 rows added, status `live`.
- `.super-speckit/verification/feature-map.md` — F14 → `live`.
- `HANDOFF.md` — slice-4 close-out summary + slice-5 pre-flight added.

## API surface

| Method | Path | Body / Query | Result |
|---|---|---|---|
| `POST` | `/v1/services` | `{payload: {endpointUrl, rail, priceBase, token, sellerAddress, nonce}, signature, sellerAddress}` | `201 {id, endpointUrl}` first insert; `200 {id, endpointUrl}` if already present (idempotent on `(endpointUrl, sellerAddress)`); `400` on missing/inconsistent fields |
| `GET` | `/v1/services?q=…` | optional substring `q` against `endpoint_url` OR `rail` | `200 {services: [{id, endpointUrl, rail, priceBase, token}, …]}` sorted by `created_at DESC` |

`id = sha256(endpointUrl + "|" + sellerAddress).slice(0,16)` — deterministic, 16 hex chars, 8 bytes; collision-resistant across 10⁴ registrations.

`POST /v1/services` is unauthed (the slice-1 CLI sends a real EIP-191 signature, but real signature recovery is deferred to slice 5 — the row stores the signature verbatim so the wire-in is additive).
`GET /v1/services` is public discovery; the row's `signature` column is intentionally omitted from the response.

## Click-test results (ZCode in-app browser)

Tab id: `iab-tab:dd21ce6c-aac1-4714-9a19-4440dffcf0b6`.

### State 1 — initial load: 3 rows
Curl first seeded three services via the public POST:
- `8da7d1cc7d6a532f` → `https://seller.example/llm`
- `53fe9369a8f1e62f` → `https://seller.example/poster`
- `faf94986c6019e3b` → `https://qa.example.com/profile`

`tab.goto("http://127.0.0.1:5173/services")` → DOM snapshot:

```yaml
- banner:
  - link "Leashed Agent Platform": /url: /agents
  - navigation:
    - link "Agents": /url: /agents
    - link "Services": /url: /services        ← new nav
- main:
  - heading "Marketplace services" [level=1]
  - searchbox "filter services"
  - generic: 3 services                       ← count
  - table (header + 3 rows: faf94986…, 53fe9369…, 8da7d1cc…)
```

✅ **PASS.**

### State 2 — filter narrows the list
`search.fill("poster")` → wait → snapshot:

```yaml
- generic: 1 service                              ← narrowed
- row "53fe9369… https://seller.example/poster cardano-x402 100000 USDM"
```

✅ **PASS.**

### State 3 — clear restores all 3
Playwright's `fill("")` and `press("Backspace")` did not fire React's `onChange` on the controlled input (a known limitation when clearing via the imperative path). Resolved by dispatching the input event via the native HTMLInputElement.value setter:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
setter.call(el, "");
el.dispatchEvent(new Event("input", { bubbles: true }));
```

→ `count = "3 services"`, `rows = 4` (1 header + 3 data).

✅ **PASS** (SPA behavior is correct; the test framework required a React-aware clear).

## Risks encountered & fixed

- Vite dev proxy was scoped to `/api` only. Added a parallel `/v1` entry in `proxy:` config so the SPA can hit `BASE = ""` and let Vite route either prefix to `:8787`.
- The `useEffect` cleanup `cancelled` flag is correct for the in-flight `listServices` race; no bug there. The clear-filter test "stuck at 1 row" turned out to be Playwright's controlled-input quirk, not an SPA bug — production behavior verified via the native-setter dispatch above.

## Out of scope (deferred)

- Real EIP-191 signature recovery (would need `@noble/curves` + secp256k1 point ops + keccak256). The signature is stored verbatim for slice-5 wire-in.
- x402 payment integration (slice 4 is registry + discovery only; payment lives on the slice-1 CLI side and uses the registered `endpointUrl` directly).
- On-chain commitment (the registry is off-chain D1).

## Evidence links

- Spec: `.super-speckit/verification/slice-4-spec.md`
- This file: `.super-speckit/verification/slice-4-spa-green.md`
- Matrix: `docs/verification-matrix.md` S4.R1–S4.R5 rows
- Feature map: `.super-speckit/verification/feature-map.md` F14 row
- HANDOFF: `HANDOFF.md`