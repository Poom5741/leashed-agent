# Verification Feature Map — leashed-agent

> Each row maps a live capability to the public seam that proves it.
> Status is updated slice-by-slice as maker work lands.

| # | Capability / requirement | Entry point | Public seam | Deterministic check | Runtime journey | API / DB assertion | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| F1 | Dashboard serves passbook UI | `GET /` on :4030 | `curl http://127.0.0.1:4030/` | HTTP 200 + contains 4 tab buttons | Browser loads the page, sees PASSBOOK · CONSOLE · FUND · AUDIT | n/a | `M5 be01d0a` + `leashed-agent.pages.dev` | **live** |
| F2 | `/api/state` returns agent + balances + receipts | `GET /api/state` on :4030 | same | 200 + JSON `agent.account` is 0x… | User sees balance, leash, CRE stamp | `agent.account` starts with `0x`, `receipts` is array | `M5c 08cab61` | **live** |
| F3 | Empty auditor verdict file does not crash dashboard | delete `docs/auditor-latest.json`, GET /api/state | same | HTTP 200, `auditor: null` | UI shows "Awaiting audit" | `auditor === null` | `M5c 08cab61` + BUG-001 | **live** |
| F4 | Seller endpoint returns 402 on unpaid probe | `POST /verify-receipt` on :4020 without payment | `curl -X POST :4020/verify-receipt` | HTTP 402 | Paywall blocks unauth'd call | n/a | `M2 446ae09` | **live** |
| F5 | Seller endpoint processes x402 payment and returns 200 | pay with the Cardano client | `curl -X POST` with `x-payment` header | HTTP 200, tx hash in response | Agent pays 0.10 tUSDM, seller gets paid | Blockfrost shows the tx | `M2 446ae09` | **live** |
| F6 | CRE auditor simulate returns PASS | `cre workflow simulate auditor --target staging-settings` | `docs/cre-auditor-evidence.txt` | exit 0 + verdict PASS in evidence | Workflow fetches /api/state, checks receipts, writes Sepolia attestation | `verdict === "PASS"` | `M3b 322e4be` | **live** |
| F7 | CRE verdict file extracted reliably from simulate output | `bash scripts/demo.sh` | `docs/auditor-latest.json` | File non-empty + valid JSON | Demo runs full loop, verdict file populated | JSON.parse succeeds; `verdict` key present | `M5c 08cab61` + extractor test 4/4 OK | **live** |
| F8 | Wallet-cli platform command `agent deploy` | (slice 1) `npx thaifi-wallet-cli agent deploy noodle-shop` | pair log on server | exits 0; new key in store | User pairs a second agent | n/a (TDD) | `M9a 9b343dc` — test "agent deploy on HTTP 200 + approved" | **live** |
| F9 | Wallet-cli `agent ls` lists all agents | (slice 1) `npx thaifi-wallet-cli agent ls` | stdout | output has 2 rows | User sees the deployed agents | TDD fixture | `M9a 9b343dc` — test "agent ls on a store with N agents" + "[revoked]" | **live** |
| F10 | Wallet-cli `agent revoke` removes one key, others work | (slice 1) `npx thaifi-wallet-cli agent revoke 0x…` | store.json + chain | revoked key's `request` fails; others succeed | User revokes agent A, agent B still works | TDD + manual smoke | `M9a 9b343dc` — test "agent revoke exits 0 and marks revokedAt locally on HTTP 200" + "on HTTP 500 does NOT mutate" | **live** |
| F11 | Wallet-cli `marketplace ls` discovers sellers | (slice 1) `npx thaifi-wallet-cli marketplace ls` | stdout | output is a parseable list | Agent finds the verify-receipt seller | TDD | `M9a 9b343dc` — test "marketplace ls prints N rows" + "passes the --q filter" | **live** |
| F12 | Wallet SPA /agents page lists the user's leashed agents, with per-card Revoke button | (slice 2) `https://wallet.thaifi.com/agents` (judge-access) | browser | page renders, 2 agents visible, Revoke button on each non-revoked card | User sees their agents in the wallet itself, can revoke inline | n/a | `9bbb562` SPA + `080cb44` API + M11d in-browser click test (6/6 steps pass) + M12 revoke button on each card | **live** |
| F13 | Public CRE auditor `POST /api/audit` accepts a batch, persists to D1, returns verdict | (slice 3) `curl -X POST /api/audit -d '{...}'` | API | 200 + verdict (PASS/WARN/FAIL); row in `agent_audit_batches` | Anyone with a ThaiFi wallet can audit their agent | `verdict` present; `agent_audit_batches` row count increments by 1 | `M12` — `audit.test.ts` 7/7 green + `slice-3-spa-green.md` step 2 (new batchId each rerun) | **live** |
| F14 | Public marketplace services registry (Hono + SPA) | (slice 4) `POST /v1/services` (CLI) + `GET /v1/services` (SPA `/services` page) | API + browser | POST 201; GET 200 with public-only fields; SPA search input narrows the list | Seller registers via CLI, anyone can browse | shell with curl returning 3 services then narrowing to 1 via `?q=poster` | `M13` — `services.test.ts` 9/9 green + `slice-4-spa-green.md` | **live** |
| F15 | Recording shows forked-wallet demo, not separate dashboard | (slice 5) `docs/recordings/platform-demo.mp4` | file | ≤3 min, plays, shows wallet.thaifi.com/agents | Judges can play the recording | n/a | pending — slice 5 | **pending** |

## Live smoke proof (this turn)

- `bash scripts/start-services.sh` → both :4030 and :4020 serve 200
  (verified: `dashboard: 200`, `seller: 200`)
- `GET /api/state` returns the live JSON (agent, balances, 4 receipts,
  auditor PASS).
- The harness can be torn down and rebuilt: `bash scripts/stop-services.sh`
  kills both ports, re-running `start-services.sh` brings them back.
