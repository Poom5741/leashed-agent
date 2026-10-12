# Slice 5 verification evidence — multi-chain seller (Solana + Tempo + Cardano)

Date: 2026-10-12 · Feature: docs/slice5-multichain-spec.md · Builder: autonomous (Super-SpecKit)

## Gates

| Gate | Command | Result |
|---|---|---|
| Unit/integration tests | `npx tsx --test test/*.test.ts` (node 22) | **40/40 pass** (34 prior + 6 new multichain) |
| Typecheck | `npx tsc --noEmit` | **clean** |
| Runtime (local worker) | `wrangler dev --port 8787` | **up**, see transcripts |

## Runtime transcript (wrangler dev, local)

- `GET /api/healthz` → `{"ok":true}`
- `GET /api/chains` → 3 networks; `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (svm, USDC) and `eip155:42431` (evm, USDC) `configured:true` with dev test keys; `cardano:preprod` `configured:false` locally (no Blockfrost key in `.dev.vars`).
- `GET /seller/health` → 200, ok:true, per-network configured flags; Solana `payTo` derived from keypair = `3JD6bdRazEX4acrzwQ37w6BxPkmaeQdJGGEdqKLL17rr`.
- `POST /verify-receipt` (unpaid) → **402** with `payment-required` accepts array containing:
  - Solana devnet: asset `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (USDC), amount `100000`, payTo = keypair address, extra.feePayer set.
  - Tempo Moderato (`eip155:42431`): asset `0x20c000000000000000000000b9537d11c60e8b50`, amount `100000`, payTo = derived `0x2e196565001D7C26EA67042B68154e47b7F11D56`.
- `POST /verify-receipt` with junk `Payment-Signature` → **402**, empty body — facilitator rejected the payment; no verdict released.

## Honest limitations

- On-chain **settlement** on Solana/Tempo was not executed in this run: it requires a funded buyer wallet (devnet USDC faucet unavailable). Verify/settle code paths are the audited `@x402/svm` / `@x402/evm` scheme implementations; the 402 advertise + reject paths are proven live above.
- Tempo default USDC address is the well-known x402 TIP-20 address; override with `TEMPO_USDC_ADDRESS` if Moderato differs.
- `seller/health` `payTo` shows only explicitly-configured addresses; the 402 always carries the derived address.
- Env keys in `apps/api-agents/.dev.vars` are throwaway dev keys, git-ignored.
