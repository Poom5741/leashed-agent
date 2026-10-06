# PM Brief — Leashed Agent Platform (presentation + user-journey video)

> Everything needed to build the deck and record the demo video.
> Project: Leashed Agent — "The trust layer for AI agents."
> Event: TOKEN2049 Origins Hackathon (6–8 Oct 2026). Submission due 23:59 SGT 7 Oct 2026.
> Builder: Poom (Jirayu Charoenyost, solo).
> Prepared: 2026-10-07.

---

## 1. One-liner & pitch

**One-liner:** A pay-as-you-go Thai SME marketing agent that pays for its own tools per-call over two chains — ThaiFi MPP (chain 17, THCFI) and Cardano preprod x402 (tUSDM) — under an on-chain spending leash a human sets and can revoke, with every payment receipted and independently audited by a Chainlink CRE workflow.

**The story (30 seconds):**
Small business owners are told to "hire an AI agent," but nobody will give an AI a wallet with real money in it. Leashed Agent is the trust layer that makes that safe: the human owner puts the agent **on a leash** — an on-chain spending cap (ThaiFi AccountKeychain, TIP-1011) — the agent pays sellers per call (402 flows) on two chains, every payment lands in a **passbook** (receipts ledger), and an independent **Chainlink CRE auditor** workflow checks the receipts and attests the verdict on-chain. The owner can revoke the agent with one click, instantly.

**Tagline options for slides:**
- "The trust layer for AI agents."
- "Your agent does the work. You hold the leash."
- "Leashed: agents that pay their own way — on your terms."

## 2. Live links (use these on-screen in the video)

| What | URL |
|---|---|
| Platform SPA (light paper/sheet-parity theme) | https://leashed-agent-platform.pages.dev |
| Wallet fork (passkey-only, English-only) | https://leashed-agent-platform.pages.dev/wallet/ |
| API (Hono worker, D1-backed) | https://leashed-api-agents.poom-a1d.workers.dev |
| Faucet endpoint | /v1/faucet on the API (currently paused / 503 pending chain decision) |
| Legacy public passbook snapshot | https://leashed-agent.pages.dev |
| npm package | `leashed-wallet-cli-platform@0.5.1` |
| GitHub | github.com/Poom5741/leashed-agent |
| D1 database | `leashed-agents-test-db` (APAC) |

## 3. Tracks (the deck should speak to all four)

1. **TOKEN2049 Origins main track** — complete product, real payments, multi-tenant platform.
2. **Cardano Agentic Commerce** — x402 per-call payments with tUSDM on Cardano preprod (`@x402/cardano`), seller service paywall.
3. **Chainlink Best Workflow with CRE** — independent auditor workflow: risk checks over the receipts ledger, verdict attested on Sepolia. (Simulate-mode evidence; deliberate design, disclosed.)
4. **NOWNodes Multichain Infrastructure** — two-chain operation (ThaiFi chain 17 + Cardano preprod) via the multichain rail.

## 4. User journeys (this is the backbone of the video)

### Persona A — the SME owner (the human holding the leash)
1. **Creates a wallet** at /wallet/ — passkey-only sign-in, English UI, light "paper sheet" theme.
2. **Funds the agent account** (PromptPay deposit via ThaiFi MPP).
3. **Deploys an agent** with a spending cap (the "leash") — e.g. 2,000,000 units per 30-day period. Cap is enforced **on-chain**, not in app code.
4. **Watches the passbook** — every per-call payment the agent makes appears as a receipt: seller, amount, chain, timestamp, audit stamp.
5. **Sees the auditor verdict** — the CRE workflow's independent check ("PASS"/risk verdict) with attestation.
6. **Revokes** the agent with one click — instant, effective on-chain.

### Persona B — the agent (the AI doing the work)
1. Receives a job brief (e.g. Thai brief: "ร้านก๋วยเตี๋ยวเรือ โปรโมชั่นบะหมี่เกี๊ยวหมูแดง ลด 20% ทุกวันศุกร์" — boat-noodle shop, 20% off pork noodle promo every Friday).
2. Plans the job, then **pays each tool/seller per call**: MPP 402 flow on ThaiFi chain 17 (THCFI) and x402 flow on Cardano preprod (tUSDM).
3. Stays inside the leash — the spending cap blocks over-spend; the payments just work.
4. Produces the deliverable (e.g. a promo poster).

### Persona C — the seller (the merchant selling services to agents)
1. Registers a service on the marketplace (`marketplace register`).
2. Exposes a paywalled endpoint (HTTP 402) — e.g. `POST /verify-receipt` on our Cardano x402 service.
3. Gets paid per call automatically, with receipts recorded.

### Video beat sheet (suggested 90–120 s)
1. Hook (0–15 s): "Would you give an AI your credit card?" → show the leash concept.
2. Owner journey (15–45 s): passkey login → deploy agent with cap → agent card appears.
3. Agent working (45–70 s): run `bash scripts/demo.sh` or the SPA — agent pays seller per call; show a real payment/receipt hitting the passbook.
4. Trust layer (70–90 s): passbook receipts + CRE auditor verdict; two chains visible (ThaiFi 17 + Cardano preprod tx links).
5. Revoke (90–100 s): one-click revoke; agent stops.
6. Close (100–120 s): tagline + the four tracks + live URLs.

## 5. What's built (feature map — for a "what we shipped" slide)

- **Wallet fork SPA** (React) at /wallet — passkey auth, English-only, light paper theme, faucet integration (paused pending chain decision).
- **Platform SPA** — `/agents` list, `/agents/:keyId` passbook, `/services` marketplace search.
- **API** (Hono on Cloudflare Workers + D1): `POST/GET /api/agents`, `GET /api/agents/:keyId/passbook`, `DELETE /api/agents/:keyId`, `GET /api/audit`, faucet.
- **Agent** (`apps/agent`) — plans jobs, pays per-call, self-budgets; poster-only fallback mode when the LLM upstream is down.
- **Sellers**: ThaiFi MPP catalog (chain 17) + our own Cardano x402 verify-receipt service with an active paywall.
- **Chainlink CRE auditor workflow** — risk checks → verdict JSON → attestation on Sepolia.
- **CLI**: `agent deploy|ls|run|revoke` + `marketplace register|ls` on npm (`leashed-wallet-cli-platform@0.5.1`).
- **QA**: Rakazo QA campaign `rakazo-wallet-retest-20261006-02` **CLOSED AS PASSED** — 5 rounds, 13 defects found and fixed (F3–F13). All journeys pass except one sanctioned/not-run journey (J2). Say this on a quality slide: "independent bot QA, 13 bugs caught and fixed pre-deadline."

## 6. Assets that already exist (reuse these)

| Asset | Where |
|---|---|
| **Slide deck (9 slides, PPTX + PDF + per-slide PNGs)** | `leashed-agent/docs/slides/leashed-agent-slides.pptx` / `.pdf` / `slide-1..9.png` |
| Slide build script (regenerate deck) | `leashed-agent/docs/slides/build.mjs` |
| Architecture diagram (ASCII, for a designed version) | `leashed-agent/README.md` § Architecture |
| Demo recording script — the journey in one command | `bash scripts/demo.sh` (agent job → seller paywall → CRE audit → passbook) |
| Design system reference (final visual direction: "Variant D — Archival Blueprint" + light paper sheet-parity theme) | `leashed-agent/docs/design-sketches/D-archival-blueprint.html`, plus A/B/C variants and landing variants L1–L3 |
| Evidence | `docs/m2-cardano-evidence.md`, `docs/cre-auditor-evidence.txt`, `docs/auditor-latest.json`, `docs/cre-simulate-evidence.txt` |
| Spec mapped to judging weights | `docs/spec.md`, `docs/verification-matrix.md` |
| Hero screenshots to capture | /agents list, /agents/:keyId passbook, /services, /wallet create-wallet flow |

## 7. Demo environment cheat sheet (for whoever records)

- Local dev: API on :8787 (`apps/api-agents`, `pnpm dev`), SPA on :5173 (`apps/web-agents`, proxies /api). Live URLs above are the safer choice for recording.
- One-command full journey: `bash scripts/demo.sh "[brief]"` (defaults to the Thai noodle-shop brief). If the LLM upstream (`mpp.thaifi.com`) is 503, it falls back to poster-only mode — **still pays real on-chain 1.5 THCFI**, which is itself a good demo beat ("even our fallback pays on-chain").
- CRE audit step needs `~/.cre/bin` on PATH (demo.sh handles it) and uses `cre workflow simulate` — frame as "CRE workflow simulation run" (disclosed, don't claim mainnet-run).
- Chain explorer links for receipts live in the ledger/passbook — show one Cardano preprod tx on screen for credibility.
- Don't show: pay.thaifi.com keys, D1 IDs, admin surfaces. Nothing secret is in the README/SPA.

## 8. Honest framing (keep the deck truthful — judges reward disclosure)

- ThaiFi chain 17 is the builder's own/affiliated chain; hackathon sponsor-chain features (Cardano x402, CRE, NOWNodes) are real and separate — say "built on top of" pre-existing public ThaiFi tooling (disclosed in README per eligibility rules).
- CRE auditor runs in **simulate** mode with on-chain attestation target Sepolia — say "simulated workflow run," not "live production audit."
- Faucet exists but is paused at 503 pending a sponsor-chain decision (recommended: tUSDM on Cardano preprod via Blockfrost). Either fix before recording or omit the faucet beat.
- One QA journey (J2, sanctions-related) is not-run by design — don't claim 100% journey coverage; claim "campaign PASSED, 13 defects fixed."

## 9. Suggested deck outline (10 slides)

1. Title — Leashed Agent Platform, tagline, team, tracks.
2. Problem — nobody trusts an AI with a wallet; SMEs need delegated, bounded spending.
3. Solution — the leash: on-chain cap + receipts + independent audit + instant revoke.
4. How it works — architecture diagram (redraw the ASCII from README §Architecture).
5. User journey — owner → agent → seller → auditor (4-step visual).
6. Live demo stills — passbook, agent card, x402 paywall, auditor verdict.
7. Multichain — ThaiFi MPP (chain 17) + Cardano preprod x402 (NOWNodes/Cardano tracks).
8. Trust — CRE auditor + receipts ledger + QA result (Rakazo PASSED, 13 defects fixed).
9. What's shipped & live — URLs, npm package, GitHub, one-command demo.
10. Roadmap + ask — faucet on sponsor chain, more templates, real CRE mainnet run.

## 10. Key numbers for slides

- 2 chains integrated (ThaiFi 17 · Cardano preprod), 1 sponsor-chain attestation (Sepolia via CRE).
- 13 QA defects found and fixed across 5 rounds; final campaign PASSED.
- 4 hackathon tracks targeted with one product.
- 36-hour sprint, solo builder (if you want the underdog angle).
- Real on-chain payments: even the fallback demo pays 1.5 THCFI on-chain.
