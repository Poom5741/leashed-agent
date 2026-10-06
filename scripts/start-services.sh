#!/usr/bin/env zsh
# Start the leashed-agent services in the background and return immediately.
# Gates: app_start, app_url, readiness_checks in super-speckit.yml depend on this.
#
# Usage:  bash scripts/start-services.sh
# Status: scripts/healthcheck.sh  (returns 0 if both :4030 and :4020 serve 200)
# Stop:   scripts/stop-services.sh
#
# Services started:
#   - apps/dashboard on :4030  (read-only oversight passbook; reads ledger + on-chain truth)
#   - apps/seller   on :4020   (x402 verify-receipt seller endpoint, 0.10 tUSDM)
#
# Pre-conditions: .env exists in repo root with CARDANO_*_MNEMONIC and
# PAYSO_API_KEY; ~/.thaifi/store.json exists with the paired key (or the
# dashboard falls back to "not paired" state).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER_PATH="/tmp/leashed-test-ledger.json"

# kill any pre-existing holders of these ports
for p in 4030 4020; do
  if lsof -ti :$p >/dev/null 2>&1; then
    lsof -ti :$p | xargs kill -9 2>/dev/null || true
  fi
done
sleep 1

# load .env into the shell (mnemonics are quoted; source with set -a)
if [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

mkdir -p /tmp

# dashboard
( cd "$ROOT/apps/dashboard" && \
  LEDGER_PATH="$LEDGER_PATH" nohup npx tsx src/server.ts > /tmp/dashboard.log 2>&1 & disown )

# seller
( cd "$ROOT/apps/seller" && \
  nohup npx tsx src/server.ts > /tmp/seller.log 2>&1 & disown )

# wait for both to be ready (max 15s each)
for service in "dashboard:4030:/api/state" "seller:4020:/health"; do
  name="${service%%:*}"; rest="${service#*:}"; port="${rest%%:*}"; path="${rest#*:}"
  for i in {1..30}; do
    if curl -sf --max-time 1 "http://127.0.0.1:$port$path" >/dev/null 2>&1; then
      echo "  ✓ $name on :$port ready ($path)"
      break
    fi
    if [[ $i -eq 30 ]]; then
      echo "  ✗ $name on :$port NOT ready after 15s — see /tmp/$name.log" >&2
      tail -20 "/tmp/$name.log" >&2 || true
      exit 1
    fi
    sleep 0.5
  done
done

echo "leashed-agent services running on :4030 (dashboard) and :4020 (seller)"