# Spec — Leashed Agent Platform

> **v2 (2026-10-06, this commit):** confirmed purpose = "Leashed Agent
> Platform" (Concept D from discovery §5, C-scope real fork). The v1
> prototype (A+D-hybrid leashed agent) is the **prototype** the platform
> is built on. See `.super-speckit/purpose/platform-fork/decision.json`
> for the human confirmation and `.super-speckit/spec-grills/platform-fork.md`
> for the evidence-labeled spec grill. Status: v2 draft; native specify
> stage (this document) + plan/tasks stage (Stage 6) next.

Source: `hackathon/token2049-origins/discovery.md` (discovery brief, 2026-10-06).
Status: v2 for platform pivot. Deadline 23:59 SGT 7 Oct 2026.

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
- **M5 (T-4h → T-now):** platform pivot (v2, C-scope real fork). Slice plan below.

## v2 Platform — Leashed Agent Platform (Concept D, C-scope)

### v1 prototype is the foundation, not the submission

Everything in M0–M4 is **green and committed** (see `git log`):
- `apps/agent` — leashed agent over ThaiFi MPP + Cardano x402, on-chain leash enforced
- `apps/seller` — own x402 seller endpoint at :4020, 0.10 tUSDM per verify-receipt
- `apps/dashboard` — oversight passbook (paper-ledger UI) with tabs (PASSBOOK · CONSOLE · FUND · AUDIT)
- `workflows/leashed-auditor` — Chainlink CRE auditor, PASS verdict on real receipts
- `docs/slides/leashed-agent-slides.pptx` — 9-slide submission deck
- `https://leashed-agent.pages.dev` — live static snapshot

These are the **prototype of the platform**, not the platform itself. The
v1 dashboard is the platform's first user surface; the v1 CRE auditor
is the platform's first public auditor; the v1 seller endpoint is the
platform's first marketplace entry. v2 turns each of these into a
multi-tenant surface by forking the wallet and wallet-cli.

### v2 architecture (5 components, 4 sponsor tracks)

```
┌─────────────────────────────────────────────────────────────────────┐
│  WALLET SPA FORK (~/token2049/wallet)                                 │
│  ────────────────────────────────                                     │
│  New /agents route in React 19 + Vite:                                │
│    - List the user's leashed agents (one P256 key each on-chain)      │
│    - Per-agent passbook (real on-chain spend + CRE audit stamp)        │
│    - "New agent" flow (generate key → request approval → register     │
│      leash via existing wallet pairing surface)                        │
│    - Existing AuthorizedApps.tsx page becomes the platform's          │
│      /agents page (replacement, not addition)                         │
│                                                                       │
│  Auth: existing requireAuth middleware (no auth change)                │
│  Storage: D1 — new `agents` table + `agent_audit_batches` table        │
│  Hosting: Cloudflare Pages via existing wrangler.jsonc                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  WALLET-CLI FORK (~/token2049/wallet-cli, public on npm)              │
│  ──────────────────────────────────────────────                      │
│  New command family (additive, no breaking change):                    │
│    thaifi agent deploy <template>      # create agent + register leash │
│    thaifi agent run --brief ...        # existing job.ts re-wired      │
│    thaifi agent ls                     # list account's agents         │
│    thaifi agent revoke <id>            # revoke one key                │
│    thaifi marketplace register <url>   # register x402 seller          │
│    thaifi marketplace ls [--q ...]     # discover sellers              │
│                                                                       │
│  Backed by: existing ThaiFi AccountKeychain (TIP-1011) — many access  │
│  keys per account, each with independent per-token spending limits,    │
│  instant revocable.                                                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PUBLIC CRE AUDITOR (workflows/leashed-auditor + Hono wrapper)        │
│  ──────────────────────────────────────────────────────                │
│  New POST /api/audit route (Hono, on the wallet's Cloudflare Worker): │
│    - Accepts { agentId } or { receipts: [...] }                       │
│    - Triggers CRE simulate, parses verdict via extractor              │
│    - Writes docs/auditor-latest.json + per-batch                      │
│      docs/audit-log.jsonl entry                                        │
│    - Returns { verdict, checked, attestationTx, at }                    │
│                                                                       │
│  Auth: same requireAuth as wallet routes. Anyone with a ThaiFi wallet  │
│  can point the auditor at their own agent.                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SELLER MARKETPLACE (registry + discovery)                             │
│  ────────────────────────────────────────                              │
│  v0 backend: file-backed JSON registry served from a tiny Hono API      │
│  (marketplace.thaifi.com or pinned to wallet.thaifi.com).              │
│  Append-only entries with 30-day TTL:                                  │
│    { id, endpointUrl, rail, priceBase, token, sellerAddress,           │
│      registeredAt, expiresAt, signature }                              │
│  Discovery: GET /v1/services?q=...&rail=...  (CLI consumer)             │
│  x402 payment: existing @x402/cardano or thaifi request adapters.       │
│  On-chain leash: the existing `SpendingLimitExceeded` reverts.         │
└─────────────────────────────────────────────────────────────────────┘
```

### Track qualification (v2)

| Track | Where the platform v2 satisfies it |
|---|---|
| **Main** ($100K AWS) | Live platform at wallet.thaifi.com/agents; leashed-agent CLI; CRE auditor; seller marketplace. Functionality 30% (full loop × 2), Technical 25% (on-chain leash, x402, CRE), Innovation 20% (trust layer, multi-tenant), Usefulness 15% (named persona + real services), Demo 10% (3-min recording). |
| **Cardano** ($27.5K) | x402 seller marketplace, both buyer-side (agent) and seller-side (`apps/seller` is the v0 entry). 30% tech, 20% innovation, 20% UX, 20% impact, 10% pitch. |
| **Chainlink CRE** ($10K) | Public auditor endpoint, batch attestation, multi-capability (HTTP + LLM + EVM). 40% blockchain value, 40% effective CRE, 20% wow. |
| **NOWNodes** (€6.5K) | Multichain RPC backbone for the CRE auditor (ThaiFi + Cardano + Sepolia). 25% implementation, 25% NOWNodes use, 20% impact, 15% creativity, 15% scalability. |

### v2 Vertical slices (milestone route → reassess after each)

1. **Slice 1 — `wallet-cli` platform commands (cheapest public seam)**
   `thaifi agent {deploy,run,ls,revoke}` + `thaifi marketplace {register,ls}`.
   Additive to existing CLI. No new auth. No SPA work.
   Public seam: `npx thaifi-wallet-cli@latest agent deploy noodle-shop` →
   returns a new access key with on-chain leash.
   Acceptance: the test wallet has 2 active agents, both visible in `agent ls`.

2. **Slice 2 — `wallet` `/agents` SPA page + Hono API + D1**
   New Hono routes: `GET/POST /api/agents`, `GET /api/agents/:id/passbook`,
   `POST /api/agents/:id/audit`. New D1 table `agents` + `agent_audit_batches`.
   New SPA route `/agents` that lists the user's agents and shows the
   per-agent passbook (reuses the v1 passbook design from
   `apps/dashboard/public/index.html`).
   Gated blocker: D1 schema inspection (`wallet/apps/api/migrations/`)
   before this slice starts.
   Public seam: open `wallet.thaifi.com/agents` (judge-access build) →
   see the user's 2 agents, their passbooks, revoke buttons.

3. **Slice 3 — public CRE auditor `POST /api/audit`**
   New Hono route wrapping the existing CRE workflow. Anyone with a
   ThaiFi wallet can POST a receipts batch or agentId, get a verdict +
   Sepolia attestation back. Reuses the structural auditor-empty-tolerance
   from M5c.
   Public seam: `curl -X POST .../api/audit -d '{"agentId":"…"}'`
   returns `{verdict:"PASS", checked:4, attestationTx:"…"}`.

4. **Slice 4 — seller marketplace**
   `thaifi marketplace register <url> --rail cardano-x402 --price 0.10
   --token USDM` POSTs to a small Hono registry. `thaifi marketplace ls`
   lists entries. Existing `apps/seller` is the v0 entry. Agent discovery
   is CLI-only; UI is the first cut if time allows.
   Public seam: `npx thaifi-wallet-cli@latest marketplace ls --q verify`
   shows the registered seller.

5. **Slice 5 — recording + slides reframe + 4-track submission**
   Re-record the demo on the **forked wallet** (not the separate
   dashboard). The recording shows: sign in to wallet.thaifi.com →
   /agents shows the user's 2 agents → click into one → per-agent
   passbook → run a new job via the existing job.ts (paid in real THCFI)
   → fund via PromptPay QR → CRE audit rerun → revoke one key → payment
   fails on-chain. Slides reframe from "Leashed Agent" to "Leashed Agent
   Platform." Submit to all 4 tracks.

### Cut order (user-confirmed 2026-10-06)

If the budget slips, cut in this order:
1. **Seller marketplace UI** (the marketplace remains CLI-only)
2. **Public auditor frontend** (the route ships, no SPA surface for it)
3. **Multi-agent personas** (templates stay; the slice ships with one
   template only — `noodle-shop`)

NEVER cut: the wallet fork (slice 2), the CLI fork (slice 1), the CRE
auditor endpoint (slice 3), the demo recording, the eligibility disclosure.

### Eligibility (carried from v1, unchanged)

Submission repos contain only sprint-written code:
- `leashed-agent` (this repo) — prototype + platform code
- `Poom5741/wallet` (judge-access mirror) — wallet SPA + Hono fork (the
  /agents page, the new Hono routes, the D1 migration). The base wallet
  predates the event; only the platform additions count as sprint output.
- `Poom5741/wallet-cli` (judge-access mirror) — CLI fork (the new
  `agent` and `marketplace` subcommands). The base CLI is public on
  npm as `thaifi-wallet-cli@0.4.0`; only the platform additions count.

Pre-existing platform (`thaifi-wallet-cli` npm package, hosted
`wallet.thaifi.com`, hosted `mpp.thaifi.com`, ThaiFi chain 17 RPC, MPP
catalog) used as public tooling. Affiliation disclosed in README.

### Open human steps (carried from v1, re-listed for v2)

- Slice 2 needs a judge-access deploy of the wallet fork to
  Cloudflare Pages (existing wrangler auth).
- Slice 3 needs the CRE auditor's simulate key (already working via
  the M5c fix).
- Slice 4's marketplace registry needs a public URL — share with the
  wallet fork or use a free Hono+Workers deploy.
- The recording (slice 5) needs ~2h of user time on camera for the
  walkthrough.
