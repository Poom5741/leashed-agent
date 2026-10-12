# Slice 5 — Multi-chain seller: Cardano + Solana + Tempo

**Date:** 2026-10-12 · **Purpose (human-confirmed):** make the Leashed Agent platform
support Solana and Tempo chains so it can compete in the Colosseum World's Fair
hackathon (deadline 2026-10-12), with a live Solana end-to-end demo as the success
signal. Non-goals: no Cardano removal, no mainnet custody, no rebrand/landing work,
Tempo is best-effort if its testnet tooling blocks.

## Architecture decision (chosen option, reversible alternatives)

**Chosen:** extend the existing x402 seller (`apps/api-agents/src/receipt-seller.ts`)
with a per-network registry. The x402 protocol v2 already keys everything by CAIP-2
network with pluggable scheme implementations, so multi-chain is additive: one
`x402Facilitator` + one `x402ResourceServer`, registering a scheme per network.

- Cardano preprod — `@x402/cardano` `ExactCardanoScheme` (existing, unchanged).
- Solana devnet (`solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`) — `@x402/svm`
  `ExactSvmScheme`, USDC devnet mint
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, price `100000` base units
  (0.1 USDC), payTo = facilitator keypair from `SOLANA_SELLER_KEYPAIR`
  (base64 of the 64-byte secret key).
- Tempo Moderato testnet (`eip155:42431`) — `@x402/evm` `ExactEvmScheme` via viem;
  `TEMPO_SELLER_KEY` (0x private key), `TEMPO_USDC_ADDRESS` asset
  (default `0x20c000000000000000000000b9537d11c60e8b50`, the well-known Tempo
  x402 USDC TIP-20), price `100000` base units.

**Alternatives rejected:** (a) separate worker per chain — triples deploy surface,
duplicates D1 settlement store; (b) rewrite seller around a homegrown abstraction —
throws away the audited x402 scheme code before a deadline.

## Public surface changes

- `GET /seller/health` → `{ ok, networks: [{ network, label, configured, payTo }] }`
  (503 only when *no* network is configured).
- `GET /api/chains` → same network list, for the SPA/CLI discovery.
- `POST /verify-receipt` 402 `accepts` array now contains one entry per
  configured network; the client picks its rail.

## Verification predicate (falsifiable)

1. `bun test` (node:test) green including new `multichain.test.ts`:
   accepts array lists all three networks with correct asset/payTo when env keys
   present; unconfigured networks are omitted; settlement semantics unchanged.
2. `wrangler dev` runtime: `/api/healthz` 200, `/seller/health` lists 3 networks
   with dev/test keys, `/api/chains` matches.
3. Solana end-to-end: verify-step reachable with a real Solana payment payload
   (settlement requires a funded devnet buyer; failure mode documented honestly).

## Env contract (all optional; network hidden when unset)

```
SOLANA_SELLER_KEYPAIR=   # base64(64-byte secretKey)
TEMPO_SELLER_KEY=        # 0x-hex 32-byte private key
TEMPO_USDC_ADDRESS=      # optional override
TEMPO_RPC_URL=           # optional; default https://rpc.moderato.tempo.xyz
```
