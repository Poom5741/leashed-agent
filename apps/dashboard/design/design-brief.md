# Design brief — Leashed Agent Oversight Dashboard

Stage: design-first (remediation 2026-10-06 — UI v0 shipped without this gate; this brief governs v1).
Artifact contract: design-brief.md + prototype.html + decision.json (human decision required before v1 implementation).

## Purpose map (visual)

```
WHO      Thai SME owner / hackathon judge — non-crypto-native, 30-second attention
WHAT     "Is my AI agent under control?" — one glance: leash state, spend, receipts, audit
WHY      Trust: the product IS the human-control layer; the UI must radiate verifiability
SUCCESS  Judge watches 3-min recording and says "I could hand money to this"
```

## The one job of every pixel

**"Control" must be visible.** The dashboard is not analytics — it is a leash.
Every element answers either "what did the agent do?" (receipt feed) or
"can I stop it?" (leash card, revoke path). Anything else is noise.

## Committed direction (single) — "Trust console"

Evidence basis: fintech-oversight conventions (Ledger Live, Stripe, banking
dashboards): dark calm surface, tabular numerals, status-first hierarchy,
one accent per rail, one semantic color per state. NOT a marketing page; no
gradients-on-everything, no decorative animation.

Tokens:
- Surface `#0b0e14` / card `#131826` / line `#232b3d` / text `#e8ecf4` / dim `#8a94a8`
- Semantic only: green = leashed/healthy, amber = auditor pending/warn, red = refused/revoked
- Rail accents: ThaiFi `#ff8a3d`, Cardano `#3468d1` — used ONLY as rail pills, never as decoration
- Type: system UI + **Noto Sans Thai** (Thai-first audience); numerals `font-variant-numeric: tabular-nums`
- Motion: one 1.6s live pulse on the "live" dot; nothing else moves
- Density: medium-high — a console, not a landing page
- A11y: contrast ≥ 4.5:1 for text, status never color-only (✔/⚠ glyphs), 44px touch targets, `<table>` semantics for the ledger (screen-reader-true)
- Bilingual: EN primary, Thai labels inline where they aid the persona (e.g. "สายจูง (leash)")

Layout (single screen, no nav):
1. Header: product name + live dot + one-line promise
2. Four status cards: **Leash (first, biggest visual weight)** · THCFI balance · Cardano balances · CRE auditor verdict
3. Receipt ledger table (full width) — every agent payment, rail pill, tx link
4. Footer: data sources + updated-at (verifiability = the footer is part of the design)

Out of scope v1: settings, charts, historical graphs, multi-agent tabs.
Explicitly rejected: light theme (breaks console metaphor), sparklines (no
time-series data yet), marketing hero (judges are not buyers).

## v0 (shipped) vs v1 deltas (pending human decision)

- v0 lacks Thai labels, ✔/⚠ glyphs beside color status, revoke affordance link, and the semantic leash-state coloring (green when limit healthy / amber <20% / red refused).
- v1 adds exactly those; nothing else changes without a new decision.
