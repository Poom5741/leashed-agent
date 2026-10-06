# Leashed Agent — TOKEN2049 Origins Hackathon

> **The trust layer for AI agents.**
> One chain-enforced spending cap. A receipts ledger. A CRE auditor that attests the verdict on Sepolia. A fiat on-ramp via PromptPay.
>
> Live: **SPA** https://leashed-agent-platform.pages.dev · **API** https://leashed-api-agents.poom-a1d.workers.dev

A pay-as-you-go Thai SME marketing agent that pays for its own tools per-call
over two chains — **ThaiFi MPP** (chain 17, THCFI) and **Cardano preprod x402**
(tUSDM) — under an on-chain spending leash a human sets and can revoke, with
every payment receipted and independently audited by a **Chainlink CRE
workflow**.

**Tracks:** TOKEN2049 Origins main track · Cardano Agentic Commerce ·
Chainlink Best Workflow with CRE · NOWNodes Multichain Infrastructure.

**Team:** [names] · Built during the TOKEN2049 Origins Hackathon, 6–8 Oct 2026.

## Monorepo layout

| Path | What it is |
|---|---|
| `apps/agent` | The agent (CLI/chat): plans the job, pays per-call, budgets itself |
| `apps/dashboard` | Oversight dashboard: live spend feed, limits, revoke, auditor verdicts |
| `apps/api-agents` | Hono worker — `/api/agents`, `/api/agents/:keyId/passbook`, `/api/audit` (slice 2 + 3) |
| `apps/web-agents` | React 19 SPA — `/agents`, `/agents/:keyId`, `/services` (slice 2 + 3 + 4) |
| `packages/receipts` | Shared receipt schema + policy engine (chain-agnostic) |
| `packages/payments-thaifi` | ThaiFi MPP rail adapter (via public `thaifi-wallet-cli`) |
| `packages/payments-cardano` | Cardano x402 rail adapter (`@x402/cardano`, preprod) |
| `packages/wallet-fork` | Fork of the ThaiFi web wallet (`thaifi-wallet`); Hono API + React SPA. CSS reskinned to **Variant D — Archival Blueprint** (drafting blue, IBM Plex Sans, hairline grids, FIG. 1/2/3 annotations) to match the platform SPA. |
| `packages/wallet-cli-fork` | Fork of `thaifi-wallet-cli` published as `@leashed/wallet-cli-platform` on npm (tarball built at `packages/wallet-cli-fork/leashed-wallet-cli-platform-0.5.0.tgz`). Adds the `agent deploy|ls|run|revoke` + `marketplace register|ls` command families. |
| `workflows/leashed-auditor` | Chainlink CRE auditor workflow (simulate evidence) |
| `probes` | Feasibility probes with pass/fail — must pass before product code |

## Live

- **Platform SPA (Variant D blueprint):** https://leashed-agent-platform.pages.dev
- **API (Hono worker, D1-backed):** https://leashed-api-agents.poom-a1d.workers.dev
- **D1:** `leashed-agents-test-db` (1c5cb0b0-3912-4175-b35d-be28725a7b4b, APAC)
- **Passbook (legacy public snapshot):** https://leashed-agent.pages.dev
- **Evidence:** `docs/m2-cardano-evidence.md` · `docs/cre-auditor-evidence.txt` · explorer links in the ledger
- **One-command demo:** `bash scripts/demo.sh` (agent job → seller probe → CRE audit → passbook)
- **CLI fork tarball ready:** `packages/wallet-cli-fork/leashed-wallet-cli-platform-0.5.0.tgz` (publish after `npm login`)

## Deployment notes (M16+)

- **SPA → Cloudflare Pages**: `apps/web-agents/dist` after `VITE_API_BASE=https://leashed-api-agents.poom-a1d.workers.dev pnpm build`
- **API → Cloudflare Workers**: `wrangler deploy` from `apps/api-agents/`
- **D1 schema**: 5 migrations `0001_init` → `0005_services` applied via `wrangler d1 migrations apply --remote`
- **CORS**: workers allow the deployed Pages origin + workers.dev preview + localhost dev. Override the allow-list via the `ALLOWED_ORIGINS` env var.

## Pre-existing tooling disclosure (eligibility)

Per hackathon rules, all submitted code was written during the 36-hour sprint.
We build **on top of** pre-existing public tooling and hosted services, used as
infrastructure (not submitted as our code):

- [`thaifi-wallet-cli`](https://www.npmjs.com/package/thaifi-wallet-cli) (public
  npm package) — agent wallet CLI; on-chain spending limits, MPP/x402
  auto-payment, PromptPay deposit. Maintained by ThaiFi; [affiliation
  disclosure: team member is a ThaiFi contributor].
- Hosted services: `wallet.thaifi.com` (passkey web wallet), `mpp.thaifi.com`
  (MPP service catalog), ThaiFi chain 17 RPC/explorer, Cardano preprod,
  Blockfrost, NOWNodes, Chainlink CRE.

## Architecture

```
┌──────────────┐  approves cap / revokes   ┌───────────────────────────────┐
│ HUMAN OWNER  │──────────────────────────▶│ AGENT (apps/agent)            │
│ wallet.thaifi│                           │ plans job · pays per call     │
└──────────────┘                           └──────┬──────────────┬─────────┘
        │ leash: AccountKeychain (TIP-1011)       │ MPP 402      │ x402 402
        │ on-chain enforced, instant revoke       ▼              ▼
        │                                  ┌────────────┐  ┌──────────────────┐
        │                                  │ ThaiFi 17  │  │ Cardano preprod  │
        │                                  │ THCFI      │  │ tUSDM · @x402/…  │
        │                                  └──────┬─────┘  └───────┬──────────┘
        ▼                                         │ receipts       │ receipts
┌──────────────┐   fetch /api/state   ┌────────────▼────────────────▼─────────┐
│ REVOKE (1    │◀─────────────────────│ PASSBOOK (apps/dashboard)             │
│ click)       │                      │ ledger · limits · stamps · verdict    │
└──────────────┘                      └───────────────┬───────────────────────┘
                       HTTP                            │
                                              ┌────────▼───────────────┐
                                              │ CRE AUDITOR            │
                                              │ (workflows/leashed-)   │
                                              │ risk checks → attest   │
                                              │ on Sepolia             │
                                              └────────────────────────┘
```

## Docs

- `docs/spec.md` — the spec (acceptance criteria mapped to judging weights)
- `docs/discovery.md` → see `../hackathon/token2049-origins/discovery.md` in the workspace
