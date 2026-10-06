# Verification matrix — platform-fork

> Each row maps a testable requirement to the public seam that proves it.
> Filled slice-by-slice in Stage 6, grown as maker work progresses.

## Slice 1 — `wallet-cli` platform commands (cheapest public seam)

| # | Requirement | Public seam | Verification | Status |
|---|---|---|---|---|
| S1.R1 | `thaifi agent deploy <template>` creates a new P256 access key on-chain bound to the active wallet, with a per-token spending leash (defaults: 2 THCFI / 0.1 tUSDM / 0.05 tADA, 30-day window). | `npx thaifi-wallet-cli agent deploy noodle-shop` exits 0, prints new key + leash, persists to `~/.thaifi/store.json` under the same wallet. | CLI exits 0; `whoami` shows the new key; the key is callable via `request` and reverts with `SpendingLimitExceeded` past cap. | pending |
| S1.R2 | `thaifi agent ls` lists all access keys (agents) for the active wallet, with their leash + last-used timestamps. | `npx thaifi-wallet-cli agent ls` prints a table. | Output matches `store.json` exactly; no orphans; revoked keys show `[revoked]`. | pending |
| S1.R3 | `thaifi agent run --brief ... --budget ...` re-wires `apps/agent/src/job.ts` to the active agent's key and budget. | `npx thaifi-wallet-cli agent run --brief "test" --budget 1.5` pays 1.5 THCFI on-chain via the active agent key, writes a receipt to the agent's ledger. | On-chain tx hash returned; receipt appears in `agent ls`'s last-used; budget decrements. | pending |
| S1.R4 | `thaifi agent revoke <id>` removes one access key on-chain without affecting others. | `npx thaifi-wallet-cli agent revoke 0x72…1E67` exits 0; subsequent `request` via that key returns `SpendingLimitExceeded` or signature-invalid. | CLI exits 0; revoked key's `request` fails; other agents still work. | pending |
| S1.R5 | `thaifi marketplace register <url> --rail cardano-x402 --price 0.10 --token USDM` POSTs a seller entry to the registry. | After register, `thaifi marketplace ls` shows the entry. | Entry appears in registry; `sellerAddress` matches the registered wallet. | pending |
| S1.R6 | `thaifi marketplace ls [--q ...]` discovers registered sellers (CLI consumer only in v0). | `npx thaifi-wallet-cli marketplace ls --q verify` returns the verify-receipt seller. | Output is a parseable list with `id, endpointUrl, rail, priceBase, token`. | pending |
| S1.R7 | All new commands coexist with the existing `login/whoami/balance/transfer/request/services/fund/deposit/tokens/logout` — no breaking change. | `npx thaifi-wallet-cli --help` shows both old and new commands; existing tests pass. | `pnpm -r --if-present run test` green; all old command smoke tests still pass. | pending |

## Slice 2 — `wallet /agents` SPA page + Hono API + D1

_(rows added when slice 2 starts — gated on D1 schema inspection)_

## Slice 3 — public CRE auditor `POST /api/audit`

_(rows added when slice 3 starts)_

## Slice 4 — seller marketplace (CLI consumer + agent hook)

_(rows added when slice 4 starts)_

## Slice 5 — recording + slides reframe + 4-track submission

_(rows added when slice 5 starts)_