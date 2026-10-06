# ThaiFi Wallet CLI — Skill for AI Agents

## Overview

ThaiFi Wallet CLI (`thaifi`) is a command-line wallet for the **ThaiFi** blockchain that lets an AI agent hold, manage, and spend funds non-custodially. The agent pairs its own key with the web wallet (**https://wallet.thaifi.com**) — the user approves once, and the key becomes an **on-chain access key** with a spending limit enforced by the chain itself.

- Network: ThaiFi, chain ID `17` (Tempo-compatible). Gas is **always** paid in **pathUSD** `0x20c0000000000000000000000000000000000000` (6 decimals).
- Tokens (all TIP-20, 6 decimals) — supported by `balance`/`transfer` via `--token <symbol|address>`:

| Symbol | Address | Notes |
|--------|---------|-------|
| pathUSD | `0x20c0000000000000000000000000000000000000` | fee/gas token (default) |
| THCFI | `0x20c000000000000000000000c82102FFe7064362` | ThaiCoin ThaiFi (also usable as fee token via `setUserToken`) |
| THCOC | `0x20C0000000000000000000007c24a0c628e8A940` | ThaiCoin OpenCraft (also usable as fee token via `setUserToken`) |

- RPC: `https://rpc.thaifi.com` · Explorer: `https://exp.thaifi.com`
- Custody: the agent's P256 key lives only in `~/.thaifi/store.json` (chmod 600). The server never sees it. Spending is capped on-chain per key, **per token** (defaults at approval: 100 pathUSD / 5,000 THCFI / 5,000 THCOC per 30 days, adjustable; revocable any time from the web wallet under "Authorized Apps").

## Setup

1. Install: `npm install -g thaifi-wallet-cli` (0.3.6+; or run one-off with `npx thaifi-wallet-cli@latest <command>`)
2. Login (pairs with the web wallet) — pick ONE pattern for your environment:

```bash
# Desktop with a browser — the browser opens the approval page itself:
thaifi login

# Headless machine (SSH/server) — foreground; copy the PAIR_URL line it prints:
thaifi login --no-browser 2>&1 | tee /tmp/pair.log

# Background launcher (bot/supervisor captures stdout) — write to a log file:
nohup thaifi login --no-browser > /tmp/pair.log 2>&1 &
grep PAIR_URL /tmp/pair.log   # post this link to the user immediately
```

**URL reliability (CLI 0.3.6+):** the approval link is ALWAYS also written to
`~/.thaifi/pair.log` (chmod 600). If stdout was lost, recover it with
`cat ~/.thaifi/pair.log`. Re-running `thaifi login` while a pairing is still
waiting is safe — it reuses the SAME pairing/URL (never creates a duplicate)
until it is approved or expires server-side.

3. Verify pairing:

```bash
thaifi whoami
```

The user approves the pairing at `https://wallet.thaifi.com/pair?id=…&code=…` (passkey or PIN confirmation). Default spend limits at approval: **100 pathUSD**, **5,000 THCFI**, **5,000 THCOC** per 30 days — the user can adjust each one.

## Commands

```bash
thaifi login [--no-browser]          # pair with the web wallet (one-time)
thaifi whoami                        # account, agent key, balances, remaining limits
thaifi tokens                        # list supported TIP-20 tokens (symbol / decimals / address)
thaifi balance [--token <symbol|address>]   # balances (default: all supported tokens)
thaifi transfer <to> <amount> [--token <symbol|address>]   # TIP-20 transfer (default: pathUSD), limit enforced on-chain
thaifi deposit --amount <THB> [--token THCFI|THCOC] [--ref <id>]   # PromptPay QR top-up (1 THB = 1 token) and wait until delivered
thaifi request <url> [options]       # HTTP request with automatic x402/MPP payment
thaifi services [--search <query>]   # discover services from the MPP registry
thaifi logout                        # remove the local key (revoke on-chain via the web wallet)
```

## Rules for agents

- ALWAYS run `whoami` after login to confirm pairing, balance, and the remaining limit.
- **Login discipline:** run `thaifi login` ONCE per pairing. Never re-run it in a loop while waiting for approval — if it's already waiting, a re-run simply returns the same link (no duplicate), so the right move is: post `PAIR_URL` (from stdout or `~/.thaifi/pair.log`) to the user, then poll `thaifi whoami` until it succeeds.
- Check the remaining limit before large transfers; transfers beyond the limit fail on-chain with `SpendingLimitExceeded` (report this clearly and stop).
- Use `request --dry-run` before expensive paid calls; respect `--max-spend`.
- NEVER print or log the private key or the contents of `~/.thaifi/store.json`.
- If a call returns 401/403, the pairing may have been revoked by the user — ask them to re-run `thaifi login`.
- Expiry: keys expire (default 90 days). Re-run `thaifi login` to re-pair.

## Funding — PromptPay QR top-up (`thaifi deposit`, CLI 0.4.0+)

The agent requests a **PromptPay QR** for its own wallet and a human scans it
with any banking app. No API key: the backend verifies on-chain (AccountKeychain
precompile) that the agent's access key belongs to a wallet and credits THAT
wallet — the CLI never sends a recipient. 1 THB = 1 token, minted automatically
after payment:

```bash
thaifi deposit --amount 50                  # 6–10,000 THB → THCFI (default)
thaifi deposit --amount 50 --token THCOC    # different payout token
thaifi deposit --ref <referenceNo>          # resume watching an existing order
```

The QR is saved to `~/.thaifi/qr-<referenceNo>.png` (chmod 600, also rendered
in the terminal and opened on desktop) and machine-parsable lines are printed:

```
REFERENCE=<id>
QR_FILE=~/.thaifi/qr-<id>.png
AMOUNT=50.00 THB -> THCFI
STATUS=delivered
TX=0x…          (mint tx — verify on https://exp.thaifi.com)
```

Show the QR (terminal or file) to the user; the CLI polls until delivered.
Orders expire after 15 minutes — paying late still delivers. Limits: 6–10,000
THB per order, 50,000 THB per wallet per 24h, max 5 pending orders.

Alternative funding: transfer pathUSD/THCFI/THCOC directly to the account
address (`thaifi whoami` / `thaifi fund`, or the web wallet's Deposit tab at
https://wallet.thaifi.com/deposit). Transferring THCFI/THCOC still needs
**pathUSD for gas** — keep a small pathUSD balance (a transfer costs well
under 0.01 pathUSD).

## Agent auth — free APIs (ThaiFiAgent)

Free data APIs can require agent **identity** instead of payment (humans log
in with OTP; agents prove their on-chain access key). `thaifi request`
handles it automatically: on `401/403` with
`WWW-Authenticate: ThaiFiAgent realm="…", challenge="…"` it signs the
challenge with your access key and retries — no flags, no payment. The
server verifies the signature against the AccountKeychain precompile, so
revocation/expiry in the web wallet applies immediately, and the API learns
your pseudonymous `{account, keyId}`.

Try it (reference endpoint):

```bash
thaifi request https://mpp.thaifi.com/whoami
```

Server developers: the reference implementation (challenge issuance +
on-chain verification via the Signature Verifier precompile) is in the
ThaiFi mpp repo, `src/agentAuth.ts` — copy that pattern into your own API.

## x402/MPP payments

`thaifi request` behaves like curl with automatic machine payments (MPP / x402):

```bash
thaifi request --dry-run -X POST -H 'content-type: application/json' -d '{"prompt":"..."}' <SERVICE_URL>
thaifi request -X POST -H 'content-type: application/json' -d '{"prompt":"..."}' <SERVICE_URL>
thaifi request --max-spend 1 <URL>   # cap automatic payment at $1
```

On `402 Payment Required` the CLI parses the MPP challenge
(`WWW-Authenticate: Payment …`), pays the quoted pathUSD amount on-chain from
the spend limit (memo-bound to the challenge), and retries once with the
payment credential.

## Services

First-party paid services live on the ThaiFi MPP server (`mpp.thaifi.com`).
**Read the live catalog from the server itself — do not rely on a list copied
here** (prices and services change):

```bash
thaifi services                                          # list services from the registry
curl https://mpp.thaifi.com/services                     # JSON catalog (canonical)
curl https://mpp.thaifi.com/llms.txt                     # agent-readable docs with schemas
curl https://mpp.thaifi.com/openapi.json                 # OpenAPI + x-payment-info offers
```

Payment is automatic: on `402 Payment Required` the CLI pays the quoted THCFI
amount from the agent's access key (on-chain, memo-bound to the challenge) and
retries once. Live usage/sales stats: `GET https://mpp.thaifi.com/stats`.

### Example: Generate an image (iapp — Thai text rendering)

When a user asks you to create an image (e.g., "สร้างรูปแมวส้มสวมหมวกเชฟ"), run:

```bash
thaifi request https://mpp.thaifi.com/iapp/generate \
  -X POST -H 'content-type: application/json' \
  -d '{"prompt": "แมวส้มสวมหมวกเชฟ กำลังปรุงอาหารในครัวญี่ปุ่น", "text": "เชฟแมว", "size": "1024x1024"}'
```

**What happens:** the CLI calls the endpoint → `402` with the price → automatic
on-chain payment → retry with proof → the service responds (images take ~25-60s).
The response's `image_base64` is decoded and saved as a PNG file in the current
directory automatically; the CLI prints file name, dimensions, mime type and
generation time.

**Rule of thumb:** Thai text inside the image → `iapp` (exact Thai rendering,
fonts via `thaifi request https://mpp.thaifi.com/iapp/fonts`); everything else
→ `qwen` (photorealistic, fast). For each service's exact body schema see
`https://mpp.thaifi.com/llms.txt`.

## Troubleshooting

- `Not paired` → run `thaifi login`.
- `Cannot see the approval URL` (background/lost stdout) → `cat ~/.thaifi/pair.log` — the `PAIR_URL` line is always written there (CLI 0.3.6+).
- `SpendingLimitExceeded` → the user must raise the limit from the web wallet (Authorized Apps) or fund more frequently.
- `KeyExpired` / revoked → re-run `thaifi login`.
- RPC errors → check `https://rpc.thaifi.com` is reachable; override with `THAIFI_RPC_URL`.
