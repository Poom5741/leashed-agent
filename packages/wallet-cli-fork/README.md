# Leashed Agent Platform CLI (`leashed`) — fork of `thaifi-wallet-cli`

> **Sprint-written fork.** This package is the npm-distributable form of
> `leashed-agent/packages/wallet-cli-fork/`. The npm-published name is
> `@leashed/wallet-cli-platform`; the upstream `thaifi-wallet-cli` npm
> package is treated as public tooling under the eligibility disclosure.

Command-line wallet for AI agents on the **ThaiFi** chain (chain 17) — pairs
with **wallet.thaifi.com** and signs with an on-chain **access key** whose
spending limit is enforced by the chain itself (AccountKeychain precompile,
TIP-1011).

Agent setup guide for AI agents: https://wallet.thaifi.com/SKILL.md

This fork adds the **Leashed Agent Platform** command family:
`agent deploy|ls|run|revoke`, `marketplace register|ls`. See
`https://leashed-agent-platform.pages.dev` for the live SPA + API that
the marketplace commands talk to.

## How it works

```
~/.thaifi/store.json (agent P256 key, chmod 600)
        │  1. thaifi login → POST /api/agent/pair/start {keyId, name}
        ▼
wallet.thaifi.com/pair?id=…&code=…   ← user approves (passkey / PIN)
        │  2. web sends authorizeKey(keyId, P256, expiry, limits) on-chain
        ▼
access key authorized on-chain → the CLI signs transactions directly,
spending up to the limit per token, fees (gas) paid in pathUSD.
```

- Non-custodial: the private key never leaves the machine; the web wallet
  never sees it.
- One wallet per account: revoking an app on the web cuts access immediately.
- Limits are on-chain, per token: `SpendingLimitExceeded` when exceeded; keys expire.
- Supported tokens (TIP-20, 6 decimals): **pathUSD** (gas), **THCFI**, **THCOC**.

## Install / run

```bash
npm install
npx tsx src/index.ts --help        # dev
npm run build && node dist/index.js # compiled
```

Set `THAIFI_WALLET_URL` / `THAIFI_RPC_URL` to target other deployments.

## Commands

| Command | Description |
|---|---|
| `login [--no-browser]` | Pair with the web wallet (approval URL for headless machines) |
| `whoami` | Account, agent key, balances, remaining spend limits |
| `tokens` | List supported TIP-20 tokens (symbol, decimals, address) |
| `balance [--token <symbol\|addr>]` | Balances (default: all supported tokens) |
| `transfer <to> <amount> [--token <symbol\|addr>]` | Send tokens (default: pathUSD; limit enforced on-chain) |
| `fund [--no-browser]` | Show the deposit address and open the web Deposit page |
| `deposit --amount <THB> [--token THCFI\|THCOC] [--ref <id>] [--no-open] [--json]` | **PromptPay QR top-up (1 THB = 1 token)**: order a QR, show it for a human to scan, poll until the tokens are minted |
| `request <url> [-X -H -d --json --dry-run --max-spend]` | HTTP with automatic x402/MPP payment **and ThaiFiAgent identity auth (401/403 answered by signing the challenge)** |
| `services [--search q]` | Discover services from the MPP registry (`THAIFI_MPP_REGISTRY`) |
| `logout` | Remove the local key (revoke on-chain from the web wallet) |

`--token` accepts a symbol (case-insensitive) or a contract address; unknown
addresses are treated as custom TIP-20s (6 decimals).

## Deposit (PromptPay top-up)

`thaifi deposit --amount 50` orders a PromptPay QR for the paired wallet and
waits until the tokens are minted (1 THB = 1 token). There is **no API key**:
the backend verifies on-chain (AccountKeychain precompile, TIP-1011) that the
agent's access key belongs to a wallet and credits THAT wallet — the recipient
never comes from the CLI.

```
$ thaifi deposit --amount 50
PromptPay deposit — 50.00 THB -> THCFI (1 THB = 1 token)
Credited wallet: 0x…
<terminal QR block>
QR_FILE=~/.thaifi/qr-<referenceNo>.png
REFERENCE=<referenceNo>
AMOUNT=50.00 THB -> THCFI
RESUME=thaifi deposit --ref <referenceNo>
STATUS=pending  (scan the QR to pay)
STATUS=delivered
TX=0x…  Explorer: https://exp.thaifi.com/tx/0x…
```

- The QR is saved to `~/.thaifi/qr-<referenceNo>.png` (chmod 600), rendered as
  terminal blocks, and opened in the default viewer (disable with `--no-open`).
- Orders expire after 15 minutes; paying late still delivers. Resume watching
  any order with `--ref <referenceNo>` — the status response includes the QR
  again, so a restarted CLI can re-display it.
- Limits: 6–10,000 THB per order, 50,000 THB per wallet per 24h, 5 pending
  orders per wallet. `--json` prints machine-readable output.
- Requires an approved pairing (`thaifi login`); a revoked/expired key fails
  with 401 on-chain verification.

## Security notes

- The recovery password / passphrase is never involved here — the agent key is
  authorized by the account owner via the web wallet.
- Losing the machine = losing the agent key: re-pair a new key from the web
  wallet and revoke the old one under Authorized Apps.
