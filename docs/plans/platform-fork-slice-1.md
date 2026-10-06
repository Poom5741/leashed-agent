# Plan — platform-fork slice 1 (wallet-cli platform commands)

> **Slice 1 of 5** in the platform-fork milestone. The other slices' plans
> land as their Stage 6 cycle starts. Slice 1 is the cheapest public seam
> (no SPA, no D1, no auth surface change) — its purpose is to prove the
> multi-agent primitive works on the CLI before we ask the SPA to render
> it.
>
> **Decisions locked 2026-10-06 (user-confirmed):**
> - Mirror upstream wallet-cli into `leashed-agent/packages/wallet-cli-platform/` (decision a)
> - Stub the pair endpoint locally — add `POST /api/agents` to the wallet fork's Hono API (decision a)

## Goal

`npx @leashed/wallet-cli-platform agent deploy noodle-shop` returns a new
P256 access key bound to the active wallet, with an on-chain leash
enforced. The new key is callable via `request`, revokable via
`agent revoke <id>`, and visible in `agent ls`. Adds
`@leashed/wallet-cli-platform marketplace {register,ls}` for the seller
side.

## Architecture decisions (post swarm-evidence, 2026-10-06)

### Decision A: package location

Mirror upstream `thaifi-wallet-cli@0.4.0` into
`leashed-agent/packages/wallet-cli-platform/`. Reuses the existing
`packages/{receipts,payments-thaifi,payments-cardano}` pattern (each
mirrors an external interface into the monorepo). Submission is
self-contained; no cross-repo coordination.

### Decision B: API namespace

Use **`POST /api/agents`** (plural, collection-root) for the new
platform endpoint, NOT `/api/agent/pair`. The existing CLI's pairing
flow already occupies `/api/agent/pair/start` and
`/api/agent/pair/status/:id` (`wallet/apps/api/src/index.ts:391,418`).
Putting the platform endpoint at a sibling path in the same namespace
would be a footgun (path collision risk on partial matches, plus URL
semantics diverge: `/pair` is a single pairing event, `/agents` is the
collection of leashed agents owned by the user). REST-conventional too.

### Decision C: Hono endpoint scope

- `POST /api/agents` — create a new leashed agent (this slice).
- `GET /api/agents` — list the user's leashed agents (slice 2 SPA
  uses this; CLI `agent ls` reads its own local store, not the
  server, so this endpoint is for the SPA + cross-device sync).
- `DELETE /api/agents/:keyId` — revoke (slice 1's `agent revoke`).
- `GET /api/agents/:keyId/passbook` — per-agent passbook (slice 2).
- `POST /api/agents/:keyId/audit` — trigger CRE audit (slice 3).

All under the existing `requireAuth` middleware sweep at
`wallet/apps/api/src/index.ts:478-479`. No new auth scheme.

### Decision D: store shape (multi-agent)

- `Store { wallet: WalletRecord; agents: Record<keyId, AgentRecord>; schemaVersion: 2 }`
- Migration from v1 (single-key) is automatic on first `loadStore`; the
  old `privateKey/keyId/...` flat fields move into
  `agents[<oldKeyId>] = { ... }` and the wallet pairing info lifts
  into `wallet`.

## Investigation already done (swarm evidence, 2026-10-06)

- **Lane A (atlas-scout)** — deep-read of upstream wallet-cli; report
  delivered.
- **Lane B (contract-scout)** — full inventory of `wallet/apps/api`:
  - Every existing route mapped with line numbers.
  - `requireAuth` middleware at `index.ts:48,478-479` already guards
    `/api/agent/*` (and will guard `/api/agents/*` the same way).
  - D1 schema: `users`, `otp_tokens`, `backups` (0001);
    `agent_pairings` (0002). The new `/api/agents` endpoint reuses
    the `agent_pairings` table — no new migration needed.
  - Closest analog: `payso.ts:handleAgentOrder` (`payso.ts:403-417`).
  - Cloudflare bindings (`wrangler.jsonc`), `Env` type
    (`env.ts:1-25`).
- **Lane C (test-designer)** — 5 of 7 test files written
  (`store.test.ts`, `agent-deploy.test.ts`, `agent-ls.test.ts`,
  `agent-revoke.test.ts`, `agent-run.test.ts`); the 2 marketplace
  tests still pending. Test conventions match the existing
  `node:test` + `tsx --test` style.

## Plan (per task, with verification)

### Task 1.1 — extend `Store` to multi-agent

- `packages/wallet-cli-platform/src/store.ts`:
  - `Store { wallet: WalletRecord; agents: Record<string, AgentRecord>; schemaVersion: 2 }`
  - `WalletRecord { userAddress, pairedAt, walletUrl, rpcUrl, chainId, limitAmount?, limitPeriod? }`
  - `AgentRecord { keyId, privateKey, template, name, createdAt, lastUsedAt?, revokedAt?, leash: { perTokenBase: Record<symbol,string>, periodSec, keyExpiry? } }`
  - `loadStore(dir?)`, `saveStore(store, dir?)`, `addAgent`, `listAgents`, `getAgent`, `revokeAgent`
  - Auto-migration from v1 on `loadStore` (detect by absence of `schemaVersion`)
- Default store location: `~/.thaifi/store.json` (matches upstream)
- Test: `store.test.ts` (lane C red) → must go green.

### Task 1.2 — `agent deploy <template>` command

- `packages/wallet-cli-platform/src/agent-deploy.ts`
- Reads active wallet from store. If no wallet paired, exits 1.
- Generates a new P256 private key (viem).
- POSTs to `https://wallet.thaifi.com/api/agents` with
  `{ keyId, name, signatureType, leash: { perTokenBase, periodSec, keyExpiry } }`.
- Polls `GET /api/agent/pair/status/:id` (existing) every 3s, opens
  the approval URL in browser.
- On approval, writes the new agent to `store.agents[<keyId>]` and
  exits 0.
- Leash defaults: THCFI 2_000_000 base, tUSDM 100_000, tADA 50_000,
  periodSec 30d, keyExpiry 1 year.
- Test: `agent-deploy.test.ts` (lane C red) → must go green.

### Task 1.3 — `agent ls` command

- `packages/wallet-cli-platform/src/agent-ls.ts`
- Reads `store.agents`, prints a table: keyId, name, template,
  createdAt, lastUsedAt, leash, status.
- Exits 0 if ≥1 agent, exits 1 with "no agents" if empty.
- Test: `agent-ls.test.ts` (lane C red) → must go green.

### Task 1.4 — `agent run --brief ... --budget ...`

- `packages/wallet-cli-platform/src/agent-run.ts` (thin wrapper)
- Reads the active agent (default: most recently created)
- Sets `LEDGER_PATH=<store.agents[active].keyId>.ledger.json`,
  `JOB_MODE=poster-only` (default; full if Qwen3.8 is up)
- Spawns the existing `apps/agent/src/job.ts` via `tsx` with
  `LEDGER_PATH` + the agent's `privateKey` env (the existing
  `thaifi-wallet-cli` request flow already supports this).
- On completion, updates `store.agents[active].lastUsedAt`.
- Test: `agent-run.test.ts` (lane C red) → must go green.

### Task 1.5 — `agent revoke <keyId>`

- `packages/wallet-cli-platform/src/agent-revoke.ts`
- POSTs to `https://wallet.thaifi.com/api/agents/:keyId` with
  method DELETE.
- Marks `store.agents[keyId].revokedAt` locally.
- Exits 0; subsequent `agent run --key <revoked>` exits 1 with
  `Key revoked — re-deploy with 'thaifi agent deploy'`.
- Test: `agent-revoke.test.ts` (lane C red) → must go green.

### Task 1.6 — `marketplace register` and `marketplace ls`

- `packages/wallet-cli-platform/src/marketplace.ts` (one file,
  two subcommands)
- `register`: POSTs
  `{ endpointUrl, rail, priceBase, token, sellerAddress, signature }`
  to the registry URL (`MARKETPLACE_URL` env, default for v0 = a
  public Hono API the slice will set up). Signature = EIP-191 over
  the payload using the active wallet's userAddress.
- `ls`: GETs `MARKETPLACE_URL/v1/services?q=...&rail=...&limit=20`,
  prints a table.
- Test: `marketplace.test.ts` (lane C pending — needs to be written
  by lane C or by maker).

### Task 1.7 — wallet fork `POST /api/agents` Hono endpoint

- **In `wallet/apps/api/src/index.ts`** (the wallet fork, NOT the
  leashed-agent monorepo — but a diff/PR is opened against
  `Poom5741/wallet` for judge access):
- Insertion point: between `index.ts:479` and `index.ts:483` (inside
  the `requireAuth` sweep).
- Body: `{ keyId, name, signatureType, leash: { perTokenBase, periodSec, keyExpiry } }`
- Validates `keyId` against `ADDRESS_RE` (line 30 of wallet source).
- Optionally checks `backups` ownership like `payso.ts:384-386`.
- Inserts a row into `agent_pairings` (the existing D1 table) with
  `status = 'pending'`, `user_id = c.get('userId')`,
  `code = 6-digit human code`. (The existing `/api/agent/pairs/approve`
  flips it to `approved`.)
- Returns `{ id, code, keyId, name, status, createdAt }`.
- **No new D1 migration needed** — `agent_pairings` already has all
  columns.

### Task 1.8 — register new commands in CLI entrypoint

- `packages/wallet-cli-platform/src/index.ts` — the `program.command(...)`
  chain.
- Add `program.command("agent")` with subcommands `deploy / ls / run / revoke`.
- Add `program.command("marketplace")` with subcommands `register / ls`.
- Existing commands untouched (the package is a fresh CLI, not a fork
  of the upstream binary; the upstream is invoked via
  `npx thaifi-wallet-cli@latest ...` for the v0 commands).

### Task 1.9 — write the 2 missing marketplace test stubs

- `marketplace.test.ts` (signature scheme + parse-listing helper)
- `index.test.ts` (smoke: `--help` shows agent + marketplace families)

## Cut order within slice 1

If the slice slips, cut in this order:
1. **Templates** (`noodle-shop`, `course-booking`) — make `agent deploy`
   accept a free-form label instead.
2. **`agent run` wrapper** — `thaifi agent run` is a thin convenience
   over `apps/agent`; ship deploy/revoke/ls first, run wrapper can
   land in slice 5.
3. **Marketplace `register`** — `ls` is the showcase. Register is
   seller-only and less visible.

NEVER cut: `deploy`, `ls`, `revoke`. These are the load-bearing platform
primitives.

## Verification (per matrix rows S1.R1–S1.R7)

| Matrix row | Where verified |
|---|---|
| S1.R1 (deploy exits 0, key appears) | `npx @leashed/wallet-cli-platform agent deploy noodle-shop` on the test wallet |
| S1.R2 (ls lists all agents) | `npx @leashed/wallet-cli-platform agent ls` shows 2 active agents |
| S1.R3 (run pays on-chain, receipt in ledger) | `… agent run --brief "…" --budget 1.5` + inspect tx on exp.thaifi.com |
| S1.R4 (revoke one, others work) | revoke 1 of 2 agents; `request` via revoked key fails; other still works |
| S1.R5 (register posts to registry) | inspect registry file after `marketplace register` |
| S1.R6 (ls discovers) | `marketplace ls --q verify` shows the registered seller |
| S1.R7 (no breaking change) | existing CLI tests still pass; new `agent` and `marketplace` commands coexist |

## Time budget

- Task 1.1 (store refactor + migration): ~2h
- Task 1.2 (agent deploy): ~2h
- Task 1.3 (agent ls): ~30m
- Task 1.4 (agent run wrapper): ~1h
- Task 1.5 (agent revoke): ~1h
- Task 1.6 (marketplace register/ls): ~2h
- Task 1.7 (wallet fork `/api/agents` Hono endpoint): ~2h (cross-repo PR)
- Task 1.8 (CLI integration): ~30m
- Task 1.9 (missing marketplace tests): ~30m
- Tests + retest + fixups: ~3h
- **Total: ~14.5h for slice 1.** Up from 11h because Task 1.7
  (cross-repo wallet fork) is new scope per the user's
  decision-(a) "stub locally".

## Out of scope for this slice

- SPA work (slice 2 — uses `GET /api/agents` but doesn't render it)
- CRE auditor endpoint (slice 3)
- Wallet D1 schema migration (none needed)
- Demo recording (slice 5)

## Swarm evidence (will be linked into BUG-001-style records when slice 1 commits)

- Lane A report: deep-read of upstream wallet-cli. Output lives in the
  Agent tool's output file
  `~/.zcode/cli/agents/sess_4c0c165d-.../agent_9a18bd88-.../output.txt`.
- Lane B report: Hono API surface map. See the agent output file
  `.../agent_9aa102ef-.../output.txt`.
- Lane C artifacts: 5 test files in
  `packages/wallet-cli-platform/test/`. The 2 marketplace tests are
  pending.