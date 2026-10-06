# Deploy runbook — Leashed Agent Platform

Everything that runs is built from this repo. Production deploys:

## 1. Platform SPA + /wallet + /faucet — Cloudflare Pages

One Pages project (`leashed-agent-platform`) serves both apps: the platform
SPA at the root and the wallet fork mounted under `/wallet/` (vite
`base: '/wallet/'`).

```bash
# build platform SPA (sets the deployed API origin)
cd apps/web-agents
VITE_API_BASE=https://leashed-api-agents.poom-a1d.workers.dev npm run build

# build wallet SPA
cd ../../packages/wallet-fork/apps/web
npm install   # wallet-fork is an npm-workspaces island inside the pnpm monorepo
npm run build

# assemble: wallet dist into the platform dist under /wallet/
cd /Users/…/leashed-agent
rsync -a --delete --exclude wrangler.json --exclude .assetsignore \
  packages/wallet-fork/apps/web/dist/ apps/web-agents/dist/wallet/
# deep-link shells — Pages 308s trailing slashes, and each path needs a real
# index.html or the platform SPA fallback swallows the route:
for p in pair deposit privacy terms; do
  mkdir -p apps/web-agents/dist/wallet/$p
  cp apps/web-agents/dist/wallet/index.html apps/web-agents/dist/wallet/$p/index.html
done

cd apps/web-agents
npx wrangler pages deploy dist --project-name=leashed-agent-platform --branch main
```

## 2. API Worker — Cloudflare Workers

```bash
cd apps/api-agents
npx wrangler d1 migrations apply leashed-agents-test-db --remote   # on schema change
npx wrangler deploy
```

Secrets (one-time): `BLOCKFROST_PROJECT_ID` (faucet provenance checks),
`GH_*` none. The faucet does NOT hold keys — it proxies Moneta's public
CIP-99 testnet claim service and rate-limits in D1 (`faucet_claims`).

## 3. Local D1 / dev

```bash
cd apps/api-agents
wrangler d1 migrations apply leashed-agents-test-db --local
pnpm dev   # API :8787, platform SPA vite :5173, wallet vite :5174
```

## Gotchas (learned the hard way)

- `pkill -f wrangler` does NOT kill the child `workerd` — also `pkill -9 -f workerd`.
- Platform `VITE_API_BASE` must be set at build time, or `/api` calls hit the
  Pages origin and parse HTML as JSON (Rakazo finding F13).
- workerd cannot run lucid-cardano's WASM glue (runtime codegen disallowed) —
  Cardano tx signing runs in Node (proven: tx d0534724…58b6f2, block 5261421),
  while the live faucet proxies Moneta's claim API.
- Wallet cloud-backup endpoints (`/api/backups*`) only exist on the upstream
  wallet worker (different CF account); the fork's SPA degrades gracefully.
