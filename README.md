# Leashed Agent — TOKEN2049 Origins Hackathon

> An AI agent you can fund with a QR code, audit on-chain, and fire with a button.

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
| `packages/receipts` | Shared receipt schema + policy engine (chain-agnostic) |
| `packages/payments-thaifi` | ThaiFi MPP rail adapter (via public `thaifi-wallet-cli`) |
| `packages/payments-cardano` | Cardano x402 rail adapter (`@x402/cardano`, preprod) |
| `workflows/cre-auditor` | Chainlink CRE auditor workflow (simulate evidence) |
| `probes` | Feasibility probes with pass/fail — must pass before product code |

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

## Docs

- `docs/spec.md` — the spec (acceptance criteria mapped to judging weights)
- `docs/discovery.md` → see `../hackathon/token2049-origins/discovery.md` in the workspace
