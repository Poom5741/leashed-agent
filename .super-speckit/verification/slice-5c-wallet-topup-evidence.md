# Slice 5c/5d verification evidence — wallet top-up (Solana + Tempo + PYUSD), faucet rework

Date: 2026-10-12

## API (deployed 830a3c3b)
- `/api/chains` now returns `payTo` + `assets` per network; `PYUSD_ADDRESS` / `SOLANA_PYUSD_MINT` env add PYUSD accepts entries (no PayPal-issued testnet PYUSD exists — address stays env-configurable, never invented).
- 42/42 tests (2 new PYUSD tests), typecheck clean.

## Wallet (/wallet/ on leashed-agent-platform.pages.dev)
- New "Top up platform — stablecoin testnets" section on Receive: Solana Devnet + Tempo Moderato rails with live platform deposit addresses (3JD6bd…17rr / 0x2e19…1D56), copy buttons, self-serve faucet links (faucet.solana.com, faucet.circle.com, docs.tempo.xyz), PYUSD note when configured.
- "Check platform receipt" proven live in-browser: Solana read returned "Platform USDC balance: 0.00" via real devnet RPC (seller funded with 0 USDC); Tempo native read via rpc.moderato.tempo.xyz.
- Cardano surfaces hidden per user instruction: Cardano preprod balance checker removed from wallet landing; THCFI faucet box untouched (ThaiFi chain, not Cardano).

## Platform SPA (/faucet)
- Rewritten as FIG. 4 self-serve guide: Solana SOL/USDC faucets, Tempo Moderato docs, PYUSD explanation. Cardano tUSDM claim form removed. Services page copy now points to the guide instead of the Cardano faucet claim.
- Both SPAs deployed together to Pages (wallet dist merged into dist/wallet; wallet wrangler.json excluded — it broke Pages Functions publishing once, fixed).
