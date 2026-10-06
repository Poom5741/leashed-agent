# Project Verification Harness — leashed-agent

> Live smoke completed 2026-10-06: `bash scripts/start-services.sh` brings
> both :4030 and :4020 to 200. See "Live smoke proof" at the bottom.
> Feature map at `.super-speckit/verification/feature-map.md` (15 rows:
> 7 live, 8 pending platform-fork slices 1–5).

## Launch and readiness

- App start command: `bash scripts/start-services.sh` (kills port holders,
  starts dashboard + seller, polls readiness for up to 15s each).
- App URL: `http://127.0.0.1:4030` (dashboard) and `http://127.0.0.1:4020`
  (seller).
- Health/readiness checks (defined in `super-speckit.yml`):
  - `curl -sf http://127.0.0.1:4030/api/state > /dev/null`
  - `curl -sf http://127.0.0.1:4020/health > /dev/null`
  - `test -s docs/auditor-latest.json`

## Test-data isolation

- Reset command: `rm -f docs/auditor-latest.json /tmp/leashed-test-ledger.json`
  (configured in `super-speckit.yml:qa.fixture_reset_command`).
- Namespacing: per-run isolated via `LEDGER_PATH` env var (e.g.
  `/tmp/leashed-test-ledger.json` for normal runs, `/tmp/leashed-<runid>.json`
  for QA runs). The wallet-cli store at `~/.thaifi/store.json` is
  per-user and is the exception — QA must use a separate test wallet.
- Production identities are **never** used in tests. The .env in the repo
  uses the test wallet (`CARDANO_CLIENT_MNEMONIC`); production identities
  (if any) live in 1Password and are not in this repo.

## Real behavior proof

- Map each capability in `feature-map.md` to a real public seam.
- API/DB assertions: the `api_assertions` and `db_assertions` gates in
  `super-speckit.yml` are the canonical API/DB checks (require
  `agent.account` shape, `auditor.verdict` value).
- The CRE auditor itself is the platform's independent QA — it fetches
  `/api/state`, calls each tx hash on-chain, and attests on Sepolia. A
  CRE PASS is the highest-confidence runtime evidence available.
- For UI changes (slice 2 wallet SPA fork), the harness is configured
  with `journey_ux.required_for_ui_changes: true` and
  `manual_journey_agent.provider: rakazo` — the human-led browser
  reviewer is the UI gate. Static review alone does not satisfy matrix
  rows.

## Evidence and cleanup

- All commands, logs, traces land under `.super-speckit/qa/<run-id>/`
  (gitignored). The `proof-pack.json` manifest in each run captures
  environment + candidate SHA + matrix digest.
- Evidence retention: 14 days on pass, 90 days on failure
  (`super-speckit.yml:evidence`).
- Stop services: `bash scripts/stop-services.sh`. Confirmed idempotent
  in this turn.
- A missing live run is `not-verified`, never pass. The harness's
  `require_live_smoke: true` config enforces this at QA start.

## Live smoke proof (this turn, 2026-10-06)

| Gate | Command | Result |
|---|---|---|
| `app_start` | `bash scripts/start-services.sh` | exit 0; "dashboard on :4030 ready"; "seller on :4020 ready" |
| `app_url` | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4030/api/state` | `200` |
| `app_url` | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4020/health` | `200` |
| `api_assertions` | `curl -sf :4030/api/state \| python3 -c '...'` | passes; agent.account starts with `0x` |
| `db_assertions` | `test -s docs/auditor-latest.json && python3 -c '...'` | passes; `verdict: PASS` |
| cleanup | `bash scripts/stop-services.sh` | exit 0; both ports freed |

**Harness is usable. Live smoke passed. Stage 7 complete.**

Next stage: Stage 9 (maker work) on slice 1 (wallet-cli platform commands).
Plan at `docs/plans/platform-fork-slice-1.md`. Matrix at
`docs/verification-matrix.md`. State still validates.