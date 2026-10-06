# Plan — platform-fork slice 1 (wallet-cli platform commands)

> **Slice 1 of 5** in the platform-fork milestone. The other slices' plans
> land as their Stage 6 cycle starts. Slice 1 is the cheapest public seam
> (no SPA, no D1, no auth surface change) — its purpose is to prove the
> multi-agent primitive works on the CLI before we ask the SPA to render
> it.

## Goal

`npx thaifi-wallet-cli@latest agent deploy noodle-shop` returns a new
P256 access key bound to the active wallet, with an on-chain leash
enforced. The new key is callable via `request`, revokable via
`agent revoke <id>`, and visible in `agent ls`. Adds
`thaifi marketplace {register,ls}` for the seller side.

## Investigation already done

- `~/token2049/wallet-cli/src/store.ts` — single-key `Store` shape. Needs
  to be extended to `agents: Record<keyId, AgentRecord>` + lifted wallet
  pairing info. Migration of existing `~/.thaifi/store.json` is the only
  backwards-compatibility concern.
- `~/token2049/wallet-cli/src/commands/login.ts` — pairing flow creates
  ONE key per `login` call. Multi-agent is supported at the SERVER level
  (AccountKeychain precompile, TIP-1011), but the CLI pins to one. The
  plan adds `agent deploy` which re-uses the pairing URL pattern with
  a fresh `pending` entry per deploy.
- `~/token2049/wallet-cli/src/index.ts:25` — commander `program.command(...)`
  chain. New commands slot in additively; no commander API change.
- `apps/agent/src/job.ts` — already wires payments via the active key.
  Slice 1's `agent run` re-wires it to accept the active agent's key +
  budget from the new store.

## Plan (per task, with verification)

### Task 1.1 — extend `Store` to multi-agent

- Change `wallet-cli/src/store.ts`:
  - `Store { wallet: WalletRecord; agents: Record<keyId, AgentRecord> }`
  - `WalletRecord { userAddress, pairedAt, walletUrl, rpcUrl, chainId, limitAmount?, limitPeriod? }`
  - `AgentRecord { keyId, privateKey, name, template, createdAt, lastUsedAt?, leash: { perTokenBase, periodSec, keyExpiry? } }`
- Migration: on `loadStore`, if the file has the old single-key shape,
  migrate it into `wallet: { userAddress, pairedAt, ... } + agents: { <oldKeyId>: <oldRecord> }`.
- Test: existing `login + whoami` flow still works after migration
  (regression test, port from existing CLI tests).

### Task 1.2 — `agent deploy <template>` command

- New file `wallet-cli/src/commands/agent-deploy.ts`.
- Reads active wallet from store. If no wallet paired, exits with
  `Not paired — run 'thaifi login' first`.
- Generates a new P256 private key (viem).
- POSTs to `https://wallet.thaifi.com/api/agent/pair` with the key's
  derived address + requested leash (template defaults: 2 THCFI, 0.1
  tUSDM, 0.05 tADA per 30 days, 1-year key expiry).
- Writes the new agent to `store.agents[<keyId>] = { ... }`.
- Polls the pair status every 3s, opens the approval URL in browser
  (existing `login.ts` pattern).
- On approval, exits 0 with the new key id + leash summary.
- **TDD:** test against a mocked HTTP client (existing test convention
  in `test/adapter.test.ts`); assert that the new agent appears in
  `agent ls` after deploy.

### Task 1.3 — `agent ls` command

- New file `wallet-cli/src/commands/agent-ls.ts`.
- Reads `store.agents`. Prints a table: keyId, name, template,
  createdAt, lastUsedAt, leash.
- Exits 0 if at least one agent, exits 1 with message if none.
- **TDD:** test against a synthetic store fixture.

### Task 1.4 — `agent run --brief ... --budget ...`

- Refactor: `apps/agent/src/job.ts` already exists. Add a thin
  wrapper `wallet-cli/src/commands/agent-run.ts` that:
  - Reads the active agent (default: most recently created)
  - Sets `LEDGER_PATH=<store.agents[active].keyId>.ledger.json` and
    `JOB_MODE=poster-only` (default; full if Qwen3.8 is up)
  - Spawns the existing `apps/agent` via `tsx src/job.ts` with
    `LEDGER_PATH` and the active agent's `privateKey` env (already
    supported by `thaifi-wallet-cli`'s request flow)
- On completion, updates `store.agents[active].lastUsedAt`.
- **TDD:** test the wrapper (not the underlying job) against a
  mocked `tsx` invocation.

### Task 1.5 — `agent revoke <keyId>`

- New file `wallet-cli/src/commands/agent-revoke.ts`.
- POSTs to `https://wallet.thaifi.com/api/agent/revoke` with the
  keyId.
- Marks `store.agents[keyId].revokedAt` locally.
- Exits 0; subsequent `agent run --key <revoked>` exits 1 with
  `Key revoked — re-deploy with 'thaifi agent deploy'`.
- **TDD:** test against a mocked HTTP client + assert local
  state changes.

### Task 1.6 — `marketplace register <url>` and `marketplace ls`

- New file `wallet-cli/src/commands/marketplace.ts` (one file,
  two subcommands).
- `register`: POSTs `{ endpointUrl, rail, priceBase, token,
  sellerAddress, signature }` to the registry URL
  (`MARKETPLACE_URL` env, default for v0 = a public Hono API the
  slice will set up). Signature = EIP-191 over the payload using
  the active wallet's userAddress.
- `ls`: GETs `MARKETPLACE_URL/v1/services?q=...&rail=...&limit=20`,
  prints a table.
- **TDD:** test the signature scheme + the parse-the-listing-output
  helper. The HTTP calls are mocked.

### Task 1.7 — register new commands in CLI entrypoint

- `wallet-cli/src/index.ts`: add `program.command("agent")...` with
  subcommands `deploy / ls / run / revoke` and
  `program.command("marketplace")...` with subcommands `register / ls`.
- Existing commands untouched.
- `npx thaifi-wallet-cli --help` shows both new command families.

## Cut order within slice 1

If the slice slips, cut in this order:
1. **Templates** (`noodle-shop`, `course-booking`) — make `agent deploy`
   accept a free-form label instead. Templates are nice, not load-bearing.
2. **`agent run` wrapper** — `thaifi agent run` is a thin convenience
   over `apps/agent`; ship the deploy/revoke/ls first, the run wrapper
   can land in slice 5.
3. **Marketplace `register`** — `ls` is the consumer side and is the
   showcase. Register is seller-only and less visible.

NEVER cut: `deploy`, `ls`, `revoke`. These are the load-bearing platform
primitives.

## Verification (per matrix rows S1.R1–S1.R7)

| Matrix row | Where verified |
|---|---|
| S1.R1 (deploy exits 0, key appears) | `npx thaifi-wallet-cli agent deploy noodle-shop` on the test wallet |
| S1.R2 (ls lists all agents) | `npx thaifi-wallet-cli agent ls` shows 2 active agents |
| S1.R3 (run pays on-chain, receipt in ledger) | `npx thaifi-wallet-cli agent run --brief "…" --budget 1.5` + inspect tx on exp.thaifi.com |
| S1.R4 (revoke one, others work) | revoke 1 of 2 agents; `request` via revoked key fails; other still works |
| S1.R5 (register posts to registry) | inspect registry file after `marketplace register` |
| S1.R6 (ls discovers) | `marketplace ls --q verify` shows the registered seller |
| S1.R7 (no breaking change) | existing `login/whoami/balance/transfer/request/services/fund/deposit/tokens/logout` smoke tests all pass |

## Time budget

- Task 1.1 (store refactor + migration): ~2h
- Task 1.2 (agent deploy): ~2h
- Task 1.3 (agent ls): ~30m
- Task 1.4 (agent run wrapper): ~1h
- Task 1.5 (agent revoke): ~1h
- Task 1.6 (marketplace register/ls): ~2h
- Task 1.7 (CLI integration): ~30m
- Tests + retest: ~2h
- **Total: ~11h for slice 1.**

## Out of scope for this slice

- SPA work (slice 2)
- CRE auditor endpoint (slice 3)
- Wallet D1 schema (slice 2)
- Demo recording (slice 5)
