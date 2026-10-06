# M2 evidence — Cardano x402 rail live

Date: 2026-10-06 (UTC). All on Cardano **preprod** (networkId 0).

## What ran

1. `apps/seller` — our own x402 service on :4020. `POST /verify-receipt` sells
   receipt verification for **0.10 tUSDM** (`e675b46e…0014df10745553444d`,
   the official preprod USDM from `@x402/cardano` DEFAULT_ASSETS).
   Payment enforcement: `@x402/express` paymentMiddleware + `x402ResourceServer`
   + an **in-process facilitator** (`x402Facilitator` + `ExactCardanoScheme`
   facilitator, provider-only via Blockfrost — holds no funds).
2. `packages/payments-cardano` payer — `x402Client` + `ExactCardanoScheme`
   client + `toClientCardanoSigner` (agent mnemonic) + `wrapFetchWithPayment`.

## Flow observed

- Unpaid probe → **HTTP 402** (paywall active, PaymentRequirements returned)
- Paid call → client signed a Cardano tx (client-signed / facilitator-broadcast
  model) → facilitator verified → settle broadcast → resource released →
  **HTTP 200** `{"valid":true,"checkedFields":[…],"verifier":"leashed-seller@cardano-preprod"}`

## On-chain proof

- Payment tx: `5e796a4cce249e021ad694283bec298eae0add25cbb31a106b6cca1379efbdc0`
- Explorer: https://preprod.cardanoscan.io/transaction/5e796a4cce249e021ad694283bec298eae0add25cbb31a106b6cca1379efbdc0
- Seller output (Blockfrost tx/utxos): `e675b46e4d2242c991a8932a99db3044e80515ae14b4c4ccf6b3f4c90014df10745553444d × 100000`
  = exactly **0.10 tUSDM** to `addr_test1qq4vw7u0zalt8g6v8efykt4ue9f6l0pq3mh76888u7tuk0dx7nwy7wlh8hlnwe6k72n9c32hxnd9fvxhcq03e9c8rgps9drz06`
- Payer: `addr_test1qr7yx9hyhumrlh2thm5ttdckdhgqjj43xpjrvxczctgkn3vtsa735q8tjczwf9jk7h3zjas70damh6vgtetd0s33xyyqm274nc`

## Cross-rail story completed

The receipt being verified was created on the **ThaiFi rail** (poster payment
tx `0xf6e953e1…` on chain 17); it was verified through the **Cardano rail**
for 0.10 tUSDM. One agent, two chains, real product on both.

## Known gaps (fix in M3 polish)

- `x-payment-response` settlement header not surfaced by `wrapFetchWithPayment`
  response — receipt txHash currently recovered from Blockfrost address history.
- Facilitator `getSupported()` type cast (`as never`) — cosmetic TS shape mismatch.
