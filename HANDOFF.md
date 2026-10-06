# HANDOFF — Leashed Agent Platform, slice 2 SPA verification pending

> Status as of 2026-10-06 evening (Singapore time). Deadline: **~23:59 SGT 8 Oct 2026** (user-confirmed: 22h remaining as of Oct 7 morning) (~36h remaining).
> Builder: Poom (Jirayu Charoenyost, solo). Submission branch: `main` of `leashed-agent/`.

## TL;DR for the next agent

1. **Slice 1** is **shipped and committed**. 33/33 tests green. Feature map rows F8–F11 are **live**.
2. **Slice 2 backend (Hono + D1)** is **shipped and committed**. 8/8 tests green. Matrix rows S2.R1, R2, R3, R4, R7 are **live**.
3. **Slice 2 SPA (`apps/web-agents`)** is **shipped and committed** at `9bbb562` (M11b). It builds + dev-serves. S2.R5 + S2.R6 need a **manual browser click-test** that only the human can do.
4. **Slice 3** (public CRE auditor `POST /api/audit`) and onwards are **next**.

Do NOT start slice 3 until the user confirms the SPA click-test results below.

## Repo

- Monorepo: `~/token2049/leashed-agent` (git, all committed through `a7c2c00`)
- Reference clones (NOT the submission): `~/token2049/wallet`, `~/token2049/wallet-cli`
- Discovery brief + cheat sheet: `~/token2049/hackathon/token2049-origins/discovery.md` (§13 has every RPC/address/price)
- Kit installed at `leashed-agent/.super-speckit/` (kit config in `leashed-agent/super-speckit.yml`)
- Slice-2 scout swarm YAML at `leashed-agent/.super-speckit/swarms/slice-2-scout.yaml` (not run yet — was deferred per user's "continue with our own workflow" call)
- OMP swarm-extension installed via pnpm at the long `@oh-my-pi+swarm-extension@13.17.0_…` virtual-store path; user opted not to use it for slice 2 (`never mind let continue with our own workflow`)

## Git state (last 5 commits)

```
a7c2c00 M11c: gitignore *.tsbuildinfo; untrack web-agents build artifact
9bbb562 M11b: slice-2 SPA — apps/web-agents (React 19 + Vite + react-router)
080cb44 M11a: slice-2 /agents Hono API — 4 routes, D1 queries, 8/8 tests green
6c0b5a2 M10b: slice-2 D1 pre-flight — ALTER TABLE verified, test DB created
3aacbe5 M10a: slice-2 spec — landing site is leashed-agent monorepo, no separate wallet-fork
```

## Slice 1 — DONE (`a1ad06f`)

`packages/wallet-cli-platform/` — wallet-cli platform commands:
- `agent deploy|ls|run|revoke` + `marketplace register|ls`
- 33/33 tests pass (`pnpm test`)
- 5 spec rules satisfied: S1.R1–S1.R7

Spec: `docs/spec.md` rows S1.R1–S1.R7; matrix: `docs/verification-matrix.md`.
Evidence: `leashed-agent/.super-speckit/verification/slice-1-{green.txt,summary.md,red-baseline.md,blocked.md}`.

## Slice 2 — BACKEND DONE (`080cb44`), SPA DONE (`9bbb562`), CLICK-TEST PENDING

### What works (verified by automated tests)

| API route | File | Test |
|---|---|---|
| `POST /api/agents` | `apps/api-agents/src/index.ts:25` | "S2.R1: POST /api/agents creates a new agent with template='noodle-shop'" |
| `GET /api/agents` | `apps/api-agents/src/index.ts:47` | "S2.R2: GET /api/agents returns the user's agents only (no cross-user leak)" |
| `GET /api/agents/:keyId/passbook` | `apps/api-agents/src/index.ts:62` | "S2.R3: GET /api/agents/:keyId/passbook returns leaseState + receipts" + 404 test |
| `DELETE /api/agents/:keyId` | `apps/api-agents/src/index.ts:80` | "S2.R4: DELETE /api/agents/:keyId marks status='revoked'" + idempotent test |
| `GET /api/healthz` | `apps/api-agents/src/index.ts:91` | (no test, smoke-only) |

Auth: stubbed `X-Stub-User` header middleware (`apps/api-agents/src/index.ts:31`). **Production wire-in lands in a separate commit** when the upstream wallet fork's `requireAuth` is vendored in.

D1: `apps/api-agents/wrangler.jsonc` binds `leashed-agents-test-db` (ID `1c5cb0b0-3912-4175-b35d-be28725a7b4b`, APAC). All 3 migrations applied: `apps/api-agents/migrations/{0001_init,0002_agent_pairings,0003_agents_template}.sql`.

Tests: `apps/api-agents/test/agents.test.ts` (8 tests, in-memory SQLite-backed fake D1).

### What the user is verifying

The SPA half (`apps/web-agents/`) — React 19 + Vite, 2 pages:
- `/agents` — list (S2.R5)
- `/agents/:keyId` — passbook (S2.R6)

**Run these two commands in two terminals:**

```
# terminal 1
cd /Users/poom-work/token2049/leashed-agent/apps/api-agents
pnpm dev          # → wrangler dev on http://127.0.0.1:8787

# terminal 2
cd /Users/poom-work/token2049/leashed-agent/apps/web-agents
pnpm dev          # → vite dev on http://127.0.0.1:5173, proxies /api → :8787
```

**Then open http://127.0.0.1:5173/agents and click through:**

1. Empty state renders ("No agents yet")
2. Seed an agent in the test D1:
   ```
   wrangler d1 execute leashed-agents-test-db --command "
     INSERT INTO agent_pairings
       (id, user_id, code, key_id, key_type, name, status, expiry, limit_amount, limit_period, template, created_at)
     VALUES ('test01', 'user_alice', '0', '0xaa', 'p256', '', 'approved', 1893456000, '2000000', 2592000, 'noodle-shop', 1700000000000)
   " --remote
   ```
3. Reload `/agents` → card with template `noodle-shop`, keyId `0xaa…`
4. Click the card → navigates to `/agents/0xaa` → passbook renders
5. Try `/agents/0xghost` → passbook page shows "404 Not Found"
6. Browser dev tools → all `/api/*` calls return 200 (except the 404 case)

**Reply with one of:**
- `all pass` → close out slice 2 (commit M11d: feature map F12 → live)
- `issue: <description>` → fix + re-verify

## Slice 3 — NEXT (public CRE auditor `POST /api/audit`)

Per the spec (M11d row M11e will add rows S3.R1–S3.R3 to `docs/verification-matrix.md`):
- New Hono route `POST /api/audit` wrapping the existing CRE workflow
- Anyone with a ThaiFi wallet can POST a receipts batch or agentId, get `{verdict, checked, attestationTx}`
- Reuses the structural auditor-empty-tolerance from M5c
- New D1 migration: `agent_audit_batches` table

Pre-flight: read `workflows/leashed-auditor/workflow.yaml` + `docs/cre-auditor-evidence.txt` to confirm the existing auditor workflow is runnable. Use the same stub-auth pattern as slice 2 (X-Stub-User).

## Slice 4 — seller marketplace (after slice 3):
- `marketplace register` + `marketplace ls` CLI writes (slice 1)
- Backend: file-backed JSON registry served from a tiny Hono API
- Discovery: GET `/v1/services?q=...&rail=...`
- x402 payment via existing `@x402/cardano` or `thaifi request` adapters

## Slice 5 — recording + slides reframe + 4-track submission:
- Re-record the demo on the **forked wallet** (the SPA at `apps/web-agents`) not the separate dashboard
- Slides reframe from "Leashed Agent" to "Leashed Agent Platform"
- Submit to all 4 tracks (Main, Cardano, Chainlink CRE, NOWNodes)

## Environment notes (carried from prior HANDOFF)

- Node 22 + pnpm 9 + bun 1.4 installed. Wrangler authed (poom@charoenyost.com, account `a1d68d92ed0cda5cea113ff208eba3a1`).
- Dashboard port 4030, seller 4020 — kill via `lsof -ti :PORT | xargs kill -9`.
- New ports from slice 2: API 8787 (wrangler dev), SPA 5173 (vite dev).
- `.env` quoting: mnemonics are quoted with `"…"` — source with `set -a; source .env; set +a`.
- Qwen3.8 LLM upstream at mpp.thaifi.com returns 503 (bg retry loop logs `/tmp/m3c-watch.log`) — `JOB_MODE=poster-only` is the workaround.
- ThaiFi chain 17 is NOT a CRE target (named-chains-only) — auditor reaches it via HTTP; that design is intentional and documented.

## Open things from slice 1 that slice 2/3 inherit

- The kit installed `~/.omp/config.json` pointing at a pnpm virtual-store path that includes a content hash. If `pnpm install` regenerates the hash, that path breaks. Pin with a symlink if you reinstall.
- Better-sqlite3 was added at the workspace root as a devDep — needed by `apps/api-agents/test/agents.test.ts` for the in-memory SQLite-backed fake D1. Same dep was added at root.
- The `payments-cardano` package typecheck was already failing on `main` before slice 2 — pre-existing, NOT introduced by slice 2. Don't bother fixing unless slice 4 needs to use it.

## Eligibility disclosure (unchanged, load-bearing for all slices)

Submission repos contain only sprint-written code:
- `leashed-agent` (this repo) — prototype + platform code
- (Poom5741/wallet mirror, when added at submission) — wallet SPA + Hono fork
- (Poom5741/wallet-cli mirror) — CLI fork

Pre-existing ThaiFi platform (`thaifi-wallet-cli` npm package, hosted `wallet.thaifi.com`, chain 17 RPC, MPP catalog) used as public tooling. Affiliation disclosed in README.

## What the next agent should do RIGHT NOW

1. **Wait** for user reply on the SPA click-test (steps above). Do not start slice 3 until they reply.
2. **If `all pass`**: commit M11d (feature-map F12 → live + S2.R5/R6 status update) and proceed to slice 3.
3. **If `issue: …`**: read the issue, patch the impl, re-verify, commit fix, then close out slice 2.

That's it. The slice-1 + slice-2 backend work is solid; the only remaining slice-2 piece is the user's click test.