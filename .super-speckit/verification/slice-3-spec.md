# Slice 3 spec — public CRE auditor `POST /api/audit`

> Author: M11d (slice 2 close-out commit 8) + slice-3 maker lane (M12).
> Source: `workflows/leashed-auditor/auditor/main.ts` (the existing CRE workflow)
> + `docs/cre-auditor-evidence.txt` (the simulator run) + `M5c` empty-tolerance.

## Goal

Anyone with a ThaiFi wallet can audit any of their own leashed agents on
demand. The result lands in D1, the SPA shows it on the passbook page,
and the algorithm matches the canonical CRE workflow byte-for-byte (so
the dashboard's CRE-verdict PR doesn't disagree with this route's verdict).

## Design choice — TS port vs CRE spawn

The CRE workflow (`workflows/leashed-auditor/auditor/main.ts:108-146`) is
cron-triggered, not callable per-request. Two options were considered:

| | TS port in Hono | Spawn `cre workflow simulate` |
|---|---|---|
| Latency | <10ms | ~5s per request |
| Attestation on Sepolia | `null` (honest) | simulated, real shape |
| Algorithmic parity with CRE | exact port | trivially exact |
| Operational deps | none | `cre` binary, bun, .env, RPC key |

Chosen: **TS port in Hono**. The CRE workflow continues to be the
canonical proof for the Chainlink CRE track (see `docs/cre-auditor-evidence.txt`).
This route is the per-user, on-demand UX layer wrapping the same
algorithm in process.

## Public surface

### `POST /api/audit`

Body:
```json
{ "keyId": "0xaa", "creditCapBase": "2000000" }
```

- `keyId` required; resolves to an `agent_pairings` row.
- `creditCapBase` optional; defaults to the row's `limit_amount` if not provided.
- `X-Stub-User` header required (same stub-auth as slice 2).

Responses:
- **200 OK** with `{ keyId, verdict, checked, totalBase, otherBase, problems[], attestationTx: null, batchId, createdAt }`.
  - `verdict ∈ {"PASS", "WARN", "FAIL"}`. `WARN` is a new value added by this slice for the empty-receipts case (M5c made the dashboard tolerate null auditor; here we surface a verdict instead).
- **401** if `X-Stub-User` missing.
- **404** if no `agent_pairings` row matches `(user_id, key_id)`.

### `GET /api/agents/:keyId/passbook` (extended, backward-compatible)

Response gains an optional `latestAudit` field:

```json
{
  "keyId": "0xaa", "template": "...", "status": "approved",
  "leaseState": "ok", "receipts": [],
  "limitAmount": "2000000", "limitPeriod": 2592000, "createdAt": 1700000000000,
  "latestAudit": { "verdict": "WARN", "checked": 0, "problems": [], "batchId": "…", "createdAt": … }
}
```

Existing consumers that ignore unknown fields stay green.

## D1 schema

New table `agent_audit_batches`:

```sql
CREATE TABLE agent_audit_batches (
  id            TEXT    PRIMARY KEY,
  key_id        TEXT    NOT NULL,
  user_id       TEXT    NOT NULL,
  verdict       TEXT    NOT NULL CHECK (verdict IN ('PASS','WARN','FAIL')),
  checked_count INTEGER NOT NULL,
  total_base    INTEGER NOT NULL DEFAULT 0,
  other_base    INTEGER NOT NULL DEFAULT 0,
  problems_json TEXT    NOT NULL DEFAULT '[]',
  attestation_tx TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_audit_batches_key ON agent_audit_batches(key_id, created_at DESC);
CREATE INDEX idx_audit_batches_user ON agent_audit_batches(user_id, created_at DESC);
```

Migration: `apps/api-agents/migrations/0004_audit_batches.sql`.

## Auditor algorithm

Direct port of `workflows/leashed-auditor/auditor/main.ts:49-76`.

```ts
function auditReceipts(state: AuditState, creditCapBase: string): AuditResult {
  const problems: string[] = []
  const receipts = state.receipts ?? []
  const knownRails = ['thaifi-mpp', 'cardano-x402']

  let totalBase = 0
  let otherBase = 0
  for (const r of receipts) {
    if (!r.id) problems.push(`receipt missing id`)
    if (!knownRails.includes(r.rail ?? '')) problems.push(`receipt ${r.id}: unknown rail ${r.rail}`)
    if (r.status !== 'paid') problems.push(`receipt ${r.id}: status ${r.status}`)
    if (!r.txHash || !/^(0x)?[0-9a-fA-F]{64}$/.test(r.txHash ?? '')) problems.push(`receipt ${r.id}: no tx hash`)
    if (!/^\d+$/.test(r.amountBase ?? '')) problems.push(`receipt ${r.id}: amountBase not integer`)
    else if ((r.token?.symbol ?? '') === 'THCFI') totalBase += Number(r.amountBase)
    else otherBase += Number(r.amountBase)
  }
  const leashLeft = Number((state.agent?.limitLeft ?? '').match(/THCFI ([\d,.]+)/)?.[1]?.replace(/,/g, '') ?? '0')
  const cap = Number(creditCapBase)
  const leashSpend = cap - leashLeft * 1e6
  if (leashLeft > 0 && totalBase > leashSpend) {
    problems.push(`ledger total ${totalBase} exceeds on-chain leash spend ${leashSpend}`)
  }

  let verdict: 'PASS' | 'WARN' | 'FAIL'
  if (receipts.length === 0 && problems.length === 0) verdict = 'WARN'
  else if (problems.length === 0) verdict = 'PASS'
  else verdict = 'FAIL'
  return { verdict, checked: receipts.length, totalBase, otherBase, problems }
}
```

Diverges from CRE in one place: empty receipts → `WARN` (not `PASS`).
This is the per-request equivalent of the M5c empty-tolerance: when
there's nothing to audit, return a verdict the caller can branch on instead
of mis-signalling "no issues found".

## Verification

| # | Requirement | Verification | Status |
|---|---|---|---|
| S3.R1 | `POST /api/audit` accepts `{keyId}` and returns a verdict | `curl -X POST … -d '{"keyId":"0xaa"}' -H 'X-Stub-User: user_alice'` → 200 with `verdict` field | TDD `audit.test.ts` "S3.R1 happy returns a verdict" |
| S3.R2 | Every audit lands in D1 as a row in `agent_audit_batches` | inspect D1 after one POST | TDD "S3.R2 row inserted with correct shape" |
| S3.R3 | Passbook page shows the latest audit + "Rerun audit" button | click button on `/agents/0xaa` | SPA click test "Rerun audit" + passbook snapshot |
| S3.R4 (revoke carry-over) | `/agents` list adds a per-card revoke button | click revoke | SPA click test "revoke flips card to [revoked]" |
| S3.R5 | 401 without `X-Stub-User`; 404 on unknown keyId | curl `curl … -H "X-Stub-User: ''"` → 401; unknown keyId → 404 | TDD coverage |

## Out of scope

- Real CRE workflow spawn from the Hono route (the CRE workflow keeps
  its cron cadence; its output lives at `docs/auditor-latest.json`).
- Cross-user audit lookup: only `user_id == X-Stub-User`'s own agents.
- Wallet auth replacement (same `X-Stub-User` stub as slice 2).

## Files touched

New:
- `apps/api-agents/src/auditor.ts`
- `apps/api-agents/migrations/0004_audit_batches.sql`
- `apps/api-agents/test/audit.test.ts`
- `.super-speckit/verification/slice-3-impl.md` (evidence at close-out)
- `.super-speckit/verification/slice-3-spa-green.md` (click test evidence)

Edit:
- `apps/api-agents/src/index.ts` (+ POST /api/audit route, GET /api/agents/:keyId/passbook extended)
- `apps/api-agents/src/db.ts` (+ insertAuditBatch, latestAuditForKey)
- `apps/web-agents/src/api/client.ts` (+ auditAgent, extend Passbook type)
- `apps/web-agents/src/pages/PassbookPage.tsx` (+ audit row + Rerun button)
- `apps/web-agents/src/pages/AgentsListPage.tsx` (+ revoke button)
- `docs/verification-matrix.md` (S3.R1-R3 + S3.R4 status updates)
- `.super-speckit/verification/feature-map.md` (F13 → live)
- `HANDOFF.md` (slice-3 close-out note + slice-4 pre-flight)