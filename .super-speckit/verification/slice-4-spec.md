# Slice 4 spec — marketplace services registry (Hono + SPA)

> Author: M12 (slice-3 close-out) + slice-4 maker lane (M13).
> Source: `packages/wallet-cli-platform/src/commands/marketplace.ts` — the
> slice-1 CLI pinned the request/response contract for `POST /v1/services`
> (body `{payload, signature, sellerAddress}` → `201 {id}`) and
> `GET /v1/services` (returns `{services: [{id, endpointUrl, rail, priceBase, token}, …]}`).

## Goal

A discoverable registry of seller services, reachable by the CLI (slice 1)
and by the SPA. The Lede-vendor CLI's `marketplace register` already POSTs
the right body shape and expects 201 + `{id}`; slice 4 is the server half
that makes that work end-to-end, plus a `/services` SPA page so a wallet
holder can browse the same data without touching the CLI.

## Scope (decided: tight, half-day)

### In scope

- New D1 table `services` (`0005_services.sql`).
- `POST /v1/services` — accepts `{payload, signature, sellerAddress}`,
  validates minimum shape (no EIP-191 recovery), persists with
  `id = keccak256(endpointUrl + sellerAddress)[:16]`, returns `201 {id}`.
  Idempotent: if a row with that id already exists, return `200 {id}`.
- `GET /v1/services?q=…` — returns `{services: [{id, endpointUrl, rail, priceBase, token}, …]}`.
  `q` is a case-insensitive substring match against `endpointUrl` or `rail`.
- SPA `/services` page listing services with a search input.
- Backend TDD: happy POST, idempotent POST, happy GET, GET with `q` filter,
  empty-list GET.
- SPA in-browser click test.

### Out of scope (deferred to slice 5)

- Real EIP-191 signature recovery (would need `@noble/curves` + `keccak256`
  + secp256k1 point ops). The slice-1 CLI sends a real signature, but the
  slice-1 tests don't enforce that the server verify it — the contract is
  "the body shape includes a 65-byte hex signature". Slice 4 stores the
  signature as opaque metadata for the slice-5 production wire-in.
- x402 payment integration (`payment-cardano` adapter) — slice 4 is pure
  registry + discovery.
- On-chain commitment (the registry is off-chain D1; the on-chain side
  belongs to slice 5 production).
- The pre-existing package.json / pnpm-lock changes from the local-DB
  setup (better-sqlite3 devDep) — those are inherited from slice 2.

## Public surface

### `POST /v1/services`

Request body:
```json
{
  "payload": {
    "endpointUrl": "https://seller.example/llm",
    "rail": "cardano-x402",
    "priceBase": "100000",
    "token": "USDM",
    "sellerAddress": "0x…",
    "nonce": "deadbeef"
  },
  "signature": "0x…",
  "sellerAddress": "0x…"
}
```

Response:
- **201** `{ "id": "abc123…", "endpointUrl": "…" }` on first insert.
- **200** `{ "id": "abc123…", "endpointUrl": "…" }` if the row already exists (idempotent re-register).
- **400** if the body is missing `payload.endpointUrl`, `payload.rail`,
  `payload.priceBase`, `payload.token`, `payload.sellerAddress`,
  `signature`, or `sellerAddress` (the outer one must equal the inner
  one).

### `GET /v1/services?q=…`

Response:
- **200** `{ "services": [{ "id", "endpointUrl", "rail", "priceBase", "token" }] }`
  sorted by `created_at DESC`.

No auth. Discovery is public. The `signature` column is **not** returned.

## D1 schema

```sql
CREATE TABLE services (
  id             TEXT    PRIMARY KEY,    -- keccak256(endpointUrl|sellerAddress)[:16]
  endpoint_url   TEXT    NOT NULL,
  rail           TEXT    NOT NULL,
  price_base     TEXT    NOT NULL,       -- string match "0.10 USDM" → "100000" base units
  token          TEXT    NOT NULL,
  seller_address TEXT    NOT NULL,
  signature      TEXT    NOT NULL,       -- 0x+130 hex chars, stored verbatim from CLI
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_services_endpoint ON services(endpoint_url);
CREATE INDEX idx_services_rail ON services(rail, created_at DESC);
CREATE INDEX idx_services_seller ON services(seller_address);
```

## Id generation

`id = keccak256(endpointUrl + "|" + sellerAddress).slice(0, 16)` — 16 hex chars, 8 bytes, fits in 64 bits. Cheap; deterministic; collision risk ≈ `2^32` registrations — fine for a hackathon registry.

Use Node's `node:crypto` `createHash("sha256")` since the API server is a Node-compatible Worker (Cloudflare Workers supports `crypto.subtle`; `node:crypto` works under `nodejs_compat` flag, which `wrangler.jsonc` already sets).

## Verification

| # | Requirement | Verification | Status |
|---|---|---|---|
| S4.R1 | `POST /v1/services` accepts the slice-1 body shape and persists a row. | `curl -X POST .../v1/services -d '{...}'` → 201 `{id}`. | TDD `services.test.ts` happy. |
| S4.R2 | `POST /v1/services` is idempotent on `(endpointUrl, sellerAddress)`. | second POST → 200 with the same id, no duplicate row. | TDD "idempotent re-register". |
| S4.R3 | `GET /v1/services` returns the registered entries. | `curl .../v1/services` → 200 with `{services: [...]}` matching the inserts. | TDD happy. |
| S4.R4 | `GET /v1/services?q=foo` filters by substring against `endpointUrl` or `rail`. | register 3 services with different endpoints; `?q=llm` returns only the matching one. | TDD "q filter". |
| S4.R5 | SPA `/services` page renders the same list + has a search input. | open `/services`; type "llm" → list narrows. | SPA click test. |

## Files touched

New:
- `apps/api-agents/migrations/0005_services.sql`
- `apps/api-agents/src/services.ts` (id gen + filters)
- `apps/api-agents/test/services.test.ts`
- `apps/web-agents/src/pages/ServicesPage.tsx`
- `.super-speckit/verification/slice-4-impl.md`
- `.super-speckit/verification/slice-4-spa-green.md`

Edit:
- `apps/api-agents/src/index.ts` (add `POST /v1/services` + `GET /v1/services`).
- `apps/api-agents/src/db.ts` (add `insertService` + `listServices`).
- `apps/web-agents/src/App.tsx` (add `/services` route).
- `apps/web-agents/src/api/client.ts` (add `listServices`).
- `apps/web-agents/src/pages/AgentsListPage.tsx` (add nav link to /services).
- `docs/verification-matrix.md` (S4.R1–S4.R5).
- `.super-speckit/verification/feature-map.md` (F14 → live).
- `HANDOFF.md` (slice-4 close-out + slice-5 pre-flight).