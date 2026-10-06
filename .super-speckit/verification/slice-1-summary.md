# Slice-1 green — 2026-10-06

## Result
- **33/33 tests pass** (8 store + 5 agent-deploy + 5 agent-ls + 3 agent-revoke + 4 agent-run + 7 marketplace + 1 index)
- `pnpm typecheck` clean (no TS errors)

## Files in this commit

### New (impl)
- `src/commands/agent-deploy.ts` — POST `/api/agent/pair`, poll until approved, save new key + leash to store
- `src/commands/agent-ls.ts` — table print of agents with [revoked] tag
- `src/commands/agent-revoke.ts` — POST `/api/agent/revoke`, mark `revokedAt` locally only on HTTP 200
- `src/commands/agent-run.ts` — spawn `tsx apps/agent/src/job.ts` with active agent's leash in env
- `src/commands/marketplace.ts` — `register` (EIP-191 signed POST `/v1/services`) + `ls` (GET `/v1/services[?q=…]`)
- `src/index.ts` — CLI shim: `agent deploy|ls|run|revoke`, `marketplace register|ls`, `--help`

### New (dep)
- `pnpm-lock.yaml`

### Modified (test fixtures — fixed swarm bugs)
- `test/agent-deploy.test.ts` — added `seededStore()` helper (returns string, calls `saveStore`); 4 happy-path tests switched from `tmpDir()` to `seededStore()`
- `test/agent-ls.test.ts` — `seededStore()` now returns `string`; tests use `dir` directly
- `test/agent-revoke.test.ts` — `seededStore()` now returns `string`; call sites use `loadStore(storeDir)` when they need the in-memory store
- `test/marketplace.test.ts` — `walletStore()` now calls `saveStore(store, dir)`; added `saveStore` to imports

## Defensive fallbacks removed
- `marketplace.ts`: removed `?? "0x0000…0000"` fallback for `userAddress`; replaced with clean `if (!store.wallet)` guard matching `agent-deploy`'s "Not paired" exit
- All 5 command files: removed `storeDir: string | Store` overload and the `STORE_PATH = Symbol.for(…)` caching hack; `storeDir` is now required `string`
- `store.ts`: not modified in this commit; the `Store` interface and `loadStore`/`saveStore` signatures are exactly the M8 form committed in 893f3d0

## Type-safety fixes
- `index.ts`: added `storeDir: DEFAULT_STORE_DIR` to all 5 `run*` calls (was missing → typecheck failure caught after tests went green)
- `agent-deploy.ts`: replaced `Promise.withResolvers()` (ES2024) with manual `new Promise(setTimeout)` (ES2022 — matches `tsconfig.base.json`)

## Replay
```
cd packages/wallet-cli-platform && pnpm test && pnpm typecheck
```

## Spec rules satisfied (docs/verification-matrix.md)
- S1.R1 agent deploy → "agent deploy on HTTP 200 + approved"
- S1.R2 agent ls → "agent ls on a store with N agents"
- S1.R3 agent run → "agent run exits 0 on the happy path" + "selects the most-recently-created non-revoked"
- S1.R4 agent revoke → "agent revoke exits 0 and marks revokedAt locally on HTTP 200"
- S1.R5 marketplace register → "marketplace register sends a signed POST and exits 0 on success"
- S1.R6 marketplace ls → "marketplace ls prints N rows" + "passes the --q filter"
- S1.R7 CLI coexistence → "npx thaifi-wallet-cli-platform --help lists both agent and marketplace"

## Notes
- Test fixtures had 2 bugs the swarm test-designer left: (a) `seededStore` returning `Store` instead of `string` and (b) `walletStore` not calling `saveStore`. Both fixed; tests now pass cleanly without changing the impl contract.
- The first impl turn by an autonomous worker (28/33) had a `pendingStores` cache + `Store.storePath` field in `store.ts` that broke the contract. That work was reverted; `store.ts` is back at its M8 form. The 5 command files were re-cleaned in this commit to match.
