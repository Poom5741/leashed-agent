# Verification matrix — platform-fork

> Each row maps a testable requirement to the public seam that proves it.
> Filled slice-by-slice in Stage 6, grown as maker work progresses.

## Slice 1 — `wallet-cli` platform commands (cheapest public seam)

| # | Requirement | Public seam | Verification | Status |
|---|---|---|---|---|
| S1.R1 | `thaifi agent deploy <template>` creates a new P256 access key on-chain bound to the active wallet, with a per-token spending leash (defaults: 2 THCFI / 0.1 tUSDM / 0.05 tADA, 30-day window). | `npx thaifi-wallet-cli agent deploy noodle-shop` exits 0, prints new key + leash, persists to `~/.thaifi/store.json` under the same wallet. | CLI exits 0; `whoami` shows the new key; the key is callable via `request` and reverts with `SpendingLimitExceeded` past cap. | **live (M9a 9b343dc)** |
| S1.R2 | `thaifi agent ls` lists all access keys (agents) for the active wallet, with their leash + last-used timestamps. | `npx thaifi-wallet-cli agent ls` prints a table. | Output matches `store.json` exactly; no orphans; revoked keys show `[revoked]`. | **live (M9a 9b343dc)** |
| S1.R3 | `thaifi agent run --brief ... --budget ...` re-wires `apps/agent/src/job.ts` to the active agent's key and budget. | `npx thaifi-wallet-cli agent run --brief "test" --budget 1.5` pays 1.5 THCFI on-chain via the active agent key, writes a receipt to the agent's ledger. | On-chain tx hash returned; receipt appears in `agent ls`'s last-used; budget decrements. | **live (M9a 9b343dc)** |
| S1.R4 | `thaifi agent revoke <id>` removes one access key on-chain without affecting others. | `npx thaifi-wallet-cli agent revoke 0x72…1E67` exits 0; subsequent `request` via that key returns `SpendingLimitExceeded` or signature-invalid. | CLI exits 0; revoked key's `request` fails; other agents still work. | **live (M9a 9b343dc)** |
| S1.R5 | `thaifi marketplace register <url> --rail cardano-x402 --price 0.10 --token USDM` POSTs a seller entry to the registry. | After register, `thaifi marketplace ls` shows the entry. | Entry appears in registry; `sellerAddress` matches the registered wallet. | **live (M9a 9b343dc)** |
| S1.R6 | `thaifi marketplace ls [--q ...]` discovers registered sellers (CLI consumer only in v0). | `npx thaifi-wallet-cli marketplace ls --q verify` returns the verify-receipt seller. | Output is a parseable list with `id, endpointUrl, rail, priceBase, token`. | **live (M9a 9b343dc)** |
| S1.R7 | All new commands coexist with the existing `login/whoami/balance/transfer/request/services/fund/deposit/tokens/logout` — no breaking change. | `npx thaifi-wallet-cli --help` shows both old and new commands; existing tests pass. | `pnpm -r --if-present run test` green; all old command smoke tests still pass. | **live (M9a 9b343dc)** |

## Slice 2 — `wallet /agents` SPA page + Hono API + D1

> D1 inspection complete (M10): existing schema has `users`, `otp_tokens`, `backups`, `agent_pairings` (id, user_id, code, key_id, key_type, name, status, user_address, expiry, limit_amount, limit_period, created_at). Slice 2 **reuses** `agent_pairings` and adds a `template TEXT` column + extends the `status` enum to include `revoked` via a new migration `0003_agents_template.sql`. Hono routes live alongside the existing `/api/agent/pairs*` block under the same `requireAuth` middleware.

| # | Requirement | Public seam | Verification | Status |
|---|---|---|---|---|
| S2.R1 | `POST /api/agents` creates a new leashed agent (server-side: writes a new `agent_pairings` row with `status='pending'`, returns the pairing id + approval URL). | `curl -X POST .../api/agents -H "Cookie: thaifi_session=…" -d '{"template":"noodle-shop","keyId":"0x…","leash":{...}}'` | HTTP 200; `agent_pairings` row exists with new `id`, `key_id`, `user_id` matches the authed session, `status='pending'`, `template='noodle-shop'`. | **live (M11a 080cb44)** — TDD: `apps/api-agents/test/agents.test.ts` "S2.R1: POST /api/agents creates a new agent with template='noodle-shop'" |
| S2.R2 | `GET /api/agents` lists the user's agents. | `curl .../api/agents -H "Cookie: …"` | HTTP 200; JSON array; each entry has `id, keyId, template, status, userAddress, expiry, limitAmount, limitPeriod, createdAt`; filters by `user_id` so no cross-user leak. | **live (M11a 080cb44)** — TDD: "S2.R2: GET /api/agents returns the user's agents only (no cross-user leak)" + M11d curl 200 |
| S2.R3 | `GET /api/agents/:keyId/passbook` returns per-agent receipts + current spend. | `curl .../api/agents/0x…/passbook` | HTTP 200; `receipts` is the same shape as `apps/dashboard` v1 passbook (txHash, amount, token, explorer URL, paidStamp); `currentSpend` is sum of receipts in current `limitPeriod` window; `leaseState` is one of `ok \| over_limit \| revoked`. | **live (M11a 080cb44)** — TDD happy + 404; M11d curl 200 for `0xaa`, 404 for `0xghost` |
| S2.R4 | `DELETE /api/agents/:keyId` marks the agent `revoked` server-side (idempotent with on-chain revokeKey tx that the SPA fires client-side). | `curl -X DELETE .../api/agents/0x…` | HTTP 200; row's `status='revoked'`; subsequent `GET /api/agents` shows the row with `status='revoked'` and the [revoked] tag in the SPA. | **live (M11a 080cb44)** — TDD happy + idempotent |
| S2.R5 | `/agents` SPA page lists the user's agents and is reachable at `https://wallet.thaifi.com/agents` (judge-access build). | open `https://wallet.thaifi.com/agents` in a browser | page renders; shows all the user's agents (from `GET /api/agents`); each is a clickable card linking to its passbook; revoke button on each card. | **live (M11b 9bbb562 + M11d)** — empty-state + seeded card observed in IAB click test (`slice-2-spa-green.md`); revoke button lands in slice 3 |
| S2.R6 | Passbook drilldown page renders per-agent receipts. | click an agent card → `/agents/:keyId` | page shows the agent's leash summary, the receipt list (matching `GET /api/agents/:keyId/passbook`), and a "Rerun audit" button (slice 3 will wire this to `POST /api/agents/:keyId/audit`). | **live (M11b 9bbb562 + M11d)** — passbook page observed in IAB click test (`slice-2-spa-green.md`); "Rerun audit" button lands in slice 3 |
| S2.R7 | D1 migration `0003_agents_template.sql` is applied + `agent_pairings.template` column is backfilled from existing rows with `template='legacy'`. | inspect D1 schema after deploy | `\d agent_pairings` shows the `template` column; existing rows have `template='legacy'`; existing `idx_pairings_user` and `idx_pairings_key` are preserved. | **live (M10b 6c0b5a2 + M11d)** — TDD test "S2.R7: schema default" + local-DB migrations apply + seed succeeded |

## Slice 3 — public CRE auditor `POST /api/audit`

> Slice 3 reuses the structural auditor algorithm from the existing CRE workflow (`workflows/leashed-auditor/auditor/main.ts:49-76`) as a TS port in process — same checks, no Chainlink CRE attestation. The CRE workflow keeps its cron cadence for the Chainlink CRE track; this slice is the per-user, on-demand UX layer.

| # | Requirement | Public seam | Verification | Status |
|---|---|---|---|---|
| S3.R1 | `POST /api/audit` accepts `{keyId, creditCapBase?}` and returns a `{verdict, checked, totalBase, otherBase, problems, batchId, createdAt}` row persisted to `agent_audit_batches`. | `curl -X POST .../api/audit -H "X-Stub-User: user_alice" -d '{"keyId":"0x…"}'` | HTTP 200; `verdict ∈ {PASS,WARN,FAIL}`; `batchId` is a UUID; one new row in `agent_audit_batches`. | **live (M12)** — TDD `audit.test.ts` happy + forged + valid-receipt + 401 + 404 |
| S3.R2 | `GET /api/agents/:keyId/passbook` returns the latest audit (the same shape, minus `keyId`) under `latestAudit`. | `curl .../api/agents/0x…/passbook` | HTTP 200; `latestAudit` is `null` before the first POST, then `{verdict, checked, totalBase, otherBase, problems, batchId, attestationTx, createdAt}` matching the most recent `agent_audit_batches` row by `key_id`. | **live (M12)** — TDD `audit.test.ts` "S3.R3: passbook returns latestAudit field when one exists" + "S3.R3: passbook's latestAudit is null when no audit has been run" |
| S3.R3 | The passbook page gains a "Rerun audit" button that POSTs to `/api/audit` and updates the audit card in place with the new verdict. | open `/agents/0xaa`, click "Rerun audit" | button is reachable on the passbook page; click → POST 200; the audit card re-renders with a new `batchId` (different UUID). | **live (M12)** — see `.super-speckit/verification/slice-3-spa-green.md` step 2 |
| S3.R4 (carry-over) | The `/agents` list page adds a per-card "Revoke" button that calls `DELETE /api/agents/:keyId` and flips the card to `[revoked]` optimistically. | click Revoke on a list card | card flips from `approved` → `revoked [revoked]`; URL does not change (preventDefault on the inner button). | **live (M12)** — see `.super-speckit/verification/slice-3-spa-green.md` step 3 |

## Slice 4 — public marketplace services registry (Hono + SPA)

> Slice 1 already shipped the CLI half (`marketplace register|ls`). Slice 4 is the server half — `POST /v1/services` accepts the CLI's signed payload, `GET /v1/services` is the public discovery endpoint, and the SPA has a `/services` page with a search input.

| # | Requirement | Public seam | Verification | Status |
|---|---|---|---|---|
| S4.R1 | `POST /v1/services` accepts the slice-1 body shape `{payload: {endpointUrl, rail, priceBase, token, sellerAddress, nonce}, signature, sellerAddress}` and persists a row with `id = sha256(endpointUrl + "\|" + sellerAddress).slice(0, 16)`. | `curl -X POST .../v1/services -d '{...}'` | HTTP 201 `{id, endpointUrl}` on first insert; HTTP 400 on missing/inconsistent fields; HTTP 200 (same id) on re-register (idempotent). | **live (M13)** — TDD `services.test.ts` happy + idempotent + 400 branches (4 tests) |
| S4.R2 | `POST /v1/services` is idempotent on `(endpointUrl, sellerAddress)` — re-registering the same pair returns the same id and does not duplicate the row. | two POSTs with the same body → same `id`; `SELECT count(*) FROM services` = 1 | HTTP 200 second time, `count = 1`. | **live (M13)** — TDD "POST /v1/services is idempotent" |
| S4.R3 | `GET /v1/services` returns registered entries, sorted by `created_at DESC`. Public-only fields — no `signature`, no `sellerAddress`. | `curl .../v1/services` → 200 with `{services: [{id, endpointUrl, rail, priceBase, token}, …]}` | HTTP 200; key set per entry matches `[id, endpointUrl, priceBase, rail, token]` exactly. | **live (M13)** — TDD happy + empty-list branches (2 tests) |
| S4.R4 | `GET /v1/services?q=foo` filters by case-insensitive substring against `endpointUrl` or `rail`. | register two services on different hosts and rails; `?q=foo` returns only the match. | HTTP 200, narrowed list. | **live (M13)** — TDD "q=llm filters endpoint" + "q=cardano filters rail" (2 tests) |
| S4.R5 | The SPA has a `/services` page that lists entries from `GET /v1/services` with a search input that narrows in real time. | navigate to `/services`; type "poster" → list narrows; clear → restores. | IAB click test — see `.super-speckit/verification/slice-4-spa-green.md`. | **live (M13)** |

## Slice 5 — recording + slides reframe + 4-track submission

_(rows added when slice 5 starts)_