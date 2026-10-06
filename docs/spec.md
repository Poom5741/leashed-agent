# Spec — Leashed Agent

Source: `hackathon/token2049-origins/discovery.md` (discovery brief, 2026-10-06).
Status: draft v1 for build kickoff. Deadline 23:59 SGT 7 Oct 2026.

## Problem

AI agents that pay for tools lack human controls: no enforced budgets, no
receipts, no independent audit. Existing x402/MPP demos are pay-per-call
wrappers; the trust layer is missing.

## Solution

One agent, two payment rails (ThaiFi MPP + Cardano x402), on-chain enforced
spend limits set/revoked by the owner, a shared receipt + policy engine, an
oversight dashboard, and a Chainlink CRE workflow that independently audits
every receipt.

## Demo journey (acceptance = runs end-to-end twice in a row)

1. Owner pairs agent (`thaifi login`), sets cap (e.g. 50 THCFI).
2. Owner asks: "ทำโปสเตอร์โปรโมชั่นร้านก๋วยเตี๋ยว" → agent pays Qwen3.8 LLM
   (0.2 THCFI, ThaiFi MPP) for copy → pays iApp (1.5 THCFI, MPP) or own Cardano
   x402 endpoint (tUSDM, preprod) for the poster → delivers PNG.
3. Dashboard shows each payment (tx link), remaining cap, CRE auditor verdict.
4. Budget low → agent surfaces PromptPay QR → human scans (6 THB min) →
   1 THB = 1 THCFI minted → job completes.
5. Owner revokes key mid-session → next payment fails on-chain (shown live).

## Acceptance criteria mapped to judging

- **Functionality 30%:** journey E2E ×2; every payment explorer-linked; top-up unblocks.
- **Technical 25%:** limits enforced on-chain (show SpendingLimitExceeded); MPP 402→pay→retry visible; x402 Cardano payment on preprod; dashboard reads chain/indexer truth.
- **Innovation 20%:** trust layer (leash + receipts + independent audit + fiat funding), positioned vs x402 wrappers.
- **Usefulness 15%:** named persona (Thai SME owner); real services.
- **Demo 10%:** ≤3-min recording embedded in slides (.ppt/.keynote, Drive link).

## Track qualification map

| Track | Requirement | Where satisfied |
|---|---|---|
| Main | repo + live URL + slides | this repo + dashboard deploy + Drive |
| Cardano | working prototype on Cardano network, repo, ≤3-min video, write-up | payments-cardano (preprod x402 incl. own seller endpoint) + docs/ |
| Chainlink CRE | CRE workflow as orchestration, simulate evidence | workflows/cre-auditor + `cre workflow simulate` log |
| NOWNodes | ≥1 NOWNodes endpoint, architecture explanation | cre-auditor RPC data plane + docs/ |

## Constraints

- Solo builder, ~24h. Cut order when slipping: NOWNodes → CRE → dashboard
  (fallback: CLI output as oversight surface). NEVER cut: two-rail payments,
  receipts, demo recording.
- Eligibility: submission repo contains only sprint-written code; pre-existing
  platform (public npm `thaifi-wallet-cli`, hosted ThaiFi services) used as
  tooling and disclosed in README.
- Open human steps: Blockfrost key, tADA/tUSDM faucets, CRE account, NOWNodes
  account, funded Sepolia key (CRE writes), ThaiFi pairing + real THB for demo.

## Milestones (clock: T-24h → 23:59 SGT 7 Oct)

- **M0 (T-24 → T-21h):** probes green (§8 of discovery brief) → architecture locked.
- **M1 (→ T-16h):** receipts + payments-thaifi working; agent runs job on ThaiFi rail.
- **M2 (→ T-11h):** payments-cardano green incl. own seller endpoint; receipts cross-rail.
- **M3 (→ T-7h):** dashboard live feed + revoke + PromptPay; CRE auditor simulates.
- **M4 (→ T-4h):** recording (twice), slides, README/deploy, submit ALL tracks by T-1h buffer.
