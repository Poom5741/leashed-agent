# Receipt seller on the API Worker

`POST /verify-receipt` is now implemented in `apps/api-agents` using
`@x402/hono`, with an in-process Cardano preprod facilitator. The price is
100,000 atomic tUSDM (0.1 tUSDM). The Worker uses a public receiving address;
it does not need the seller mnemonic or hold wallet signing keys.

The product preserves the local seller's four field checks: `id`, `rail`,
`amountBase`, and `status`. It does not verify the input receipt's chain
transaction, full schema, policy, or cryptographic signature. The response
is a JSON verdict; it is not a signed attestation.

D1 persists transaction settlement claims across requests and Worker replicas.
The new migration must be applied before serving paid calls. Failed receipt
validation does not trigger payment settlement. Provider configuration is
required; otherwise the seller returns 503 and existing API routes remain available.

## Deploy to the existing Cloudflare account

Configure `CLOUDFLARE_API_TOKEN` securely with permission to deploy Workers,
manage Worker secrets, and apply D1 migrations in the existing account.
Allow outbound access to `api.cloudflare.com`,
`leashed-api-agents.poom-a1d.workers.dev`, and
`cardano-preprod.blockfrost.io` from the environment running these commands.
The Worker itself also needs access to Blockfrost.

From `apps/api-agents`:

```sh
# Apply additive migrations to the existing database; inspect pending migrations first.
pnpm exec wrangler d1 migrations list leashed-agents-test-db --remote
pnpm exec wrangler d1 migrations apply leashed-agents-test-db --remote
# Upload the configured Blockfrost key without printing it.
node -e 'process.stdout.write(process.env.BLOCKFROST_API_KEY_PREPROD)' | pnpm exec wrangler secret put BLOCKFROST_API_KEY_PREPROD
pnpm exec wrangler deploy
curl https://leashed-api-agents.poom-a1d.workers.dev/seller/health
```

`CARDANO_SELLER_ADDRESS` optionally overrides the public address in the route.
The production smoke script intentionally checks the expected address from the
existing payment evidence before spending.

## Record a real production payment

From the repository root, set `RECEIPT_FILE` to a real paid receipt JSON (or
a receipt ledger array). Configure `CARDANO_CLIENT_MNEMONIC` and
`BLOCKFROST_API_KEY_PREPROD` securely. This command spends 0.1 tUSDM plus the
Cardano network fee once:

```sh
pnpm exec tsx apps/api-agents/scripts/verify-production.ts
```

The script asserts HTTP 402 for the unpaid probe and HTTP 200 plus successful
settlement for the paid call. It saves the public verifier URL, fresh transaction
hash, verdict, and explorer URL to `/tmp/leashed-worker-x402-evidence.json`
(or `EVIDENCE_FILE`). Check the fresh transaction's inclusion and seller output
on Cardanoscan/Blockfrost before claiming on-chain confirmation.

## Validation and deployment status

The API typecheck, 32 tests (including mocked payment failure/success and shared
D1 settlement ownership), Worker dry-run bundle, and local workerd startup pass.
The unpaid route also runs under workerd without chain access.

Deployment has **not** completed in this environment: Wrangler requires a
Cloudflare API token, and the environment's proxy rejects Cloudflare API access.
The production payment script has **not** run. The previous local seller payment
`0cfd9ca663b7d2d4d9487dc4e2643266581078e68b02e5a17c42a6766a634542`
is historical evidence, not proof of a payment to the Worker route.
