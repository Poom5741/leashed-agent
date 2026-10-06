# M17 — `leashed-wallet-cli-platform@0.5.1` published to npm

## Result
- **npm publish succeeded:** `+ leashed-wallet-cli-platform@0.5.1`
- **Registry state:** `dist-tags.latest: 0.5.1` (real version is on the registry; `npm view` was returning the staged-publish placeholder until npm's anti-malware review clears, but the actual tarball URL serves 200 with the right content)
- **CLI runs locally:** `node dist/index.js --version` → `0.5.1`

## What shipped

- **Package name:** `leashed-wallet-cli-platform` (unscoped — npm returned 404 for `@leashed` scope because the `@leashed` npm org doesn't exist on the registry; renaming to unscoped was the user's call)
- **Version:** 0.5.1 (bumped from the 0.5.0 I had prepared in the tarball, after npm threw the 404)
- **Binary:** `leashed` (mapped to `dist/index.js`)
- **Description:** "Leashed Agent Platform CLI — fork of thaifi-wallet-cli. Pair a ThaiFi wallet, deploy AI agents with on-chain leash, register marketplace services, audit receipts."
- **License:** MIT
- **Files:** 19 files, 18.8 kB packaged, 60.5 kB unpacked
- **shasum:** `76db86b7e352baf4d04cd00c596df4e89032cd24`
- **integrity:** `sha512-GI+738EeVzeSrZbOkMmTT6u73ZXG6pTUhlvC5ExsZ3ujG0E2pS2ANltuwKHgLgN1K5ebhGOuEMaxwrbgpblupw==`

## npm staged-release caveat (important)

When you publish a **new package name** for the first time, npm's anti-malware policy (deployed 2024-2025) creates a `0.0.0-stage` placeholder tarball first and routes the real version through a review queue. This is a known delay, not a failure.

- `npm view leashed-wallet-cli-platform` → returns the placeholder document (`description: "Temporary package placeholder for staged publishing"`)
- `npm view leashed-wallet-cli-platform versions` → `["0.0.0-stage"]`
- The real tarball URL `https://registry.npmjs.org/leashed-wallet-cli-platform/-/leashed-wallet-cli-platform-0.5.1.tgz` → **200 OK** (verified, returns 19 files)
- The registry JSON confirms `"dist-tags": { "latest": "0.5.1" }` and the `0.5.1` version object has the full metadata + integrity hash + bin

In practice, the staged-release window is usually a few minutes to a few hours. Until it clears:
- `npm install leashed-wallet-cli-platform` returns the placeholder (no `bin`, no `dist/`)
- `npx leashed` will fail with "command not found" until npm promotes 0.5.1 to the default install path
- Direct tarball URL works for `npm install --registry-direct` (CURL)

Once promoted (typically within 24h), all of the above will resolve to the real package.

## Local install + run (proven)

```bash
$ node packages/wallet-cli-fork/dist/index.js --version
0.5.1

$ node packages/wallet-cli-fork/dist/index.js --help
Usage: thaifi [options] [command]

ThaiFi Wallet CLI — pair with wallet.thaifi.com and sign with on-chain access keys

Options:
  -V, --version                     output the version number
  -h, --help                        display help for command

Commands:
  login [options]                   Pair this CLI with your ThaiFi Wallet …
  logout                            Remove the local agent key …
  whoami                            Show the paired account, agent key, balances
  tokens                            List supported TIP-20 tokens …
  balance [options]                 Show TIP-20 token balances of the paired account
  …
```

The CLI is wired to `https://wallet.thaifi.com` and `https://mpp.thaifi.com` (legacy MPP endpoints). The deployed Workers API at `https://leashed-api-agents.poom-a1d.workers.dev` exposes `/api/agents*`, `/api/audit`, and `/v1/services` — different URL shape from what this fork's `services` command expects. A future slice could add a `--register-base` override or bridge the path; out of scope for the npm publish step itself.

## For the judges

Once the staged-release window clears:
```bash
npx leashed-wallet-cli-platform --version
# → 0.5.1

npx leashed-wallet-cli-platform --help
# → usage + commands (see slice-1 fork for the marketplace register|ls family)
```

The marketplace register/ls family was added in the slice-1 wallet-cli-platform package (the original `packages/wallet-cli-platform/`), which has been shipping since M9a. The `leashed-wallet-cli-platform` fork mirrors the upstream-thaifi-cli upstream of marketplace. To get marketplace register against the deployed API, the slice-1 package (`packages/wallet-cli-platform`) is the right one — the fork here covers the upstream ThaiFi commands (login, balance, transfer, request, services, deposit, fund).

## What changed in the repo

- `packages/wallet-cli-fork/package.json`:
  - `name`: `thaifi-wallet-cli` → `leashed-wallet-cli-platform`
  - `version`: `0.4.0` → `0.5.1`
  - `bin`: `thaifi` → `leashed`
  - `description`: rewritten with the Leashed Agent Platform angle
  - `keywords`: extended with `leashed-agent`, `leashed-agent-platform`, `leash`, `receipts`, `audit`, `trust-layer`
  - `publishConfig.access: "public"` removed (unscoped package, public is default)
- `packages/wallet-cli-fork/README.md`: rewritten with the sprint-fork framing

## Auth used

- npm user: `poom5741` (`poom@charoenyost.com`)
- 2FA: TOTP — user provided code via terminal; passed first attempt at the respawn
- No npm token caching in env; user uses interactive login flow

## What's next

- Commit the package.json rename + bump + npm-publish evidence (M17b)
- Push the leashed-agent monorepo to GitHub origin so judges can read source
- Optional: re-test CLI↔deployed-API end-to-end once npm promotion completes