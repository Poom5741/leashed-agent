# Slice 3 close-out — POST /api/audit + SPA Rerun audit + SPA Revoke (M12)

## Result
- **15/15 backend tests green** (`pnpm -C apps/api-agents test` — 8 slice-2
  + 7 new slice-3, all 8 original slice-2 tests still pass after the
  + migration + new auth-scope + new passbook lookup were added).
- **Backend typecheck clean** (`pnpm -C apps/api-agents typecheck`).
- **SPA typecheck + build clean** (`pnpm -C apps/web-agents typecheck`,
  `pnpm -C apps/web-agents build`).
- **3/3 in-browser click-test steps pass.**

## Files added / changed

New:
- `apps/api-agents/src/auditor.ts` — TS port of the CRE auditor algorithm
  (auditor/main.ts:49-76), with one divergence: empty receipts →
  `verdict = "WARN"` instead of `"PASS"` (the per-request equivalent of
  M5c's empty-tolerance).
- `apps/api-agents/migrations/0004_audit_batches.sql` — new D1 table +
  indices.
- `apps/api-agents/test/audit.test.ts` — 7 new tests.
- `.super-speckit/verification/slice-3-spec.md` — design record.
- `.super-speckit/verification/slice-3-spa-green.md` — this file.

Edit:
- `apps/api-agents/src/index.ts` — imports + new `app.use("/api/audit", ...)`
  stub auth middleware + `POST /api/audit` route + extended passbook with
  `latestAudit` lookup.
- `apps/api-agents/src/db.ts` — `NewAuditBatch`, `AuditBatchRow`,
  `insertAuditBatch`, `latestAuditForKey` helpers.
- `apps/api-agents/test/agents.test.ts` — `fakeD1()` now creates
  `agent_audit_batches` so the slice-2 contract stays green after the
  new passbook lookup was added.
- `apps/web-agents/src/api/client.ts` — `auditAgent(keyId)` +
  `AuditResult` type + `Passbook.latestAudit` field.
- `apps/web-agents/src/pages/PassbookPage.tsx` — audit panel + Rerun
  button + optimistic verdict update on POST.
- `apps/web-agents/src/pages/AgentsListPage.tsx` — per-card Revoke button
  with optimistic state update.
- `apps/web-agents/src/styles.css` — `.status-PASS/WARN/FAIL`,
  `.audit-card`, `.problems`, `button.primary`, `button.revoke-btn`.
- `docs/verification-matrix.md` — S3.R1–S3.R4 rows added, status `live`.
- `.super-speckit/verification/feature-map.md` — F13 → `live`,
  F12 footnote cleaned (revoke button now lives there).
- `HANDOFF.md` — slice-3 close-out summary + slice-4 pre-flight added.

## API surface

| Method | Path | Body | Result |
|---|---|---|---|
| `POST` | `/api/audit` | `{keyId, creditCapBase?, receipts?, agent?}` | `{keyId, verdict, checked, totalBase, otherBase, problems, attestationTx, batchId, createdAt}` |
| `GET` | `/api/agents/:keyId/passbook` | — | adds `latestAudit` (same shape, minus `keyId`) |

`POST /api/audit` requires `X-Stub-User`. Returns `401` without it,
`404` on unknown `keyId`, `200` otherwise. Persists every request to
`agent_audit_batches`.

## Click-test results (ZCode in-app browser)

Driven from `browser-use` Playwright locators. Tab id: `iab-tab:dd21ce6c-aac1-4714-9a19-4440dffcf0b6`.

### Step 1 — Passbook page renders `latestAudit` panel
Open `/agents/0xaa`. Pre-existing audit (from earlier curl POST) renders:

```yaml
- heading "Audit" [level=2]
- generic: WARN
- generic: · checked 0 receipts
- generic: batch 5f0ad096…
- generic: · no CRE attestation (Hono in-process audit)
- generic: · 10/6/2026, 5:07:23 PM
- button "Rerun audit"
```

✅ **PASS.**

### Step 2 — Click Rerun audit → new batchId, same shape
`getByRole("button", { name: "Rerun audit" })` → click → snapshot:

```yaml
- generic: batch 833d46ea…  ← was 5f0ad096…
- generic: · 10/6/2026, 5:08:05 PM  ← timestamp advanced
```

DB confirms: `wrangler d1 execute ... "SELECT count(*) FROM agent_audit_batches WHERE key_id='0xaa'"` → **2** rows.

✅ **PASS.**

### Step 3 — Click Revoke on the list card → card flips to `[revoked]`, no nav
`getByRole("button", { name: /revoke agent 0xaa/ })` → click → snapshot:

```yaml
- url: http://127.0.0.1:5173/agents   ← stayed on list (preventDefault worked)
- main:
  - heading "Your leashed agents"
  - link "noodle-shop revoked [revoked] 0xaa …"   ← was "approved"
    (Revoke button gone — the `a.status !== "revoked"` branch fired.

DB confirms: `agent_pairings` row `test01` → `status='revoked'`.

✅ **PASS.**

(Seed restored to `approved` after the test so the dev environment stays usable.)

## Risks encountered & fixed

- The new passbook lookup `latestAuditForKey` queried
  `agent_audit_batches` on every read, so the slice-2
  `fakeD1()` schema had to gain that table — without it, all 8
  slice-2 tests started failing with `SQLITE_ERROR: no such table`
  on S2.R3. Patched in commit `M12`.
- `/api/audit` lives outside `/api/agents/*`, so the stub-auth
  middleware needed a second `app.use("/api/audit", ...)` instance.
  Without it, the no-auth test returned `404` instead of `401`.
- A `kill -9` on `:8787` left an orphan `workerd` subprocess; the
  new wrangler picked port 8788 and only the next `pkill -f workerd`
  fully cleared it. The dev-server restart gotcha is now in HANDOFF.

## Out of scope (deferred)

- Real CRE workflow spawn from `/api/audit` (Hono in-process TS port
  is the per-request UX layer; the CRE workflow remains the canonical
  proof for the Chainlink CRE track).
- Wallet auth replacement (same `X-Stub-User` stub as slice 2).
- Cross-user audit lookup (the route only audits the caller's own
  agents, matching the slice-2 auth model).

## Evidence links

- Spec: `.super-speckit/verification/slice-3-spec.md`
- This file: `.super-speckit/verification/slice-3-spa-green.md`
- Matrix: `docs/verification-matrix.md` S3.R1–S3.R4 rows
- Feature map: `.super-speckit/verification/feature-map.md` F13 row
- HANDOFF: `HANDOFF.md`