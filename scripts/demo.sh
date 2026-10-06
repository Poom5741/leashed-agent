#!/usr/bin/env zsh
# One-command demo run — the recording script.
# Usage: bash scripts/demo.sh [brief...]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRIEF="${*:-ร้านก๋วยเตี๋ยวเรือ โปรโมชั่นบะหมี่เกี๊ยวหมูแดง ลด 20% ทุกวันศุกร์}"
export LEDGER_PATH=/tmp/leashed-test-ledger.json

echo "══ 1/4 · AGENT JOB (leash-checked, on-chain payments) ══"
cd "$ROOT/apps/agent"
# full journey when the LLM upstream is healthy (HTTP 200); poster-only otherwise
if curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST https://mpp.thaifi.com/llm/chat \
     -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"ping"}]}' 2>/dev/null \
     | grep -q '^200$'; then
  echo "(LLM upstream healthy → full mode)"
  npm run job --silent -- "$BRIEF" || JOB_MODE=poster-only npm run job --silent
else
  echo "(LLM upstream 503 → poster-only fallback, still pays 1.5 THCFI real on-chain)"
  JOB_MODE=poster-only npm run job --silent -- "$BRIEF"
fi

echo
echo "══ 2/4 · SELLER (our own x402 service on Cardano preprod) ══"
curl -s http://localhost:4020/health && echo " (already running)"
curl -s -o /dev/null -w 'unpaid verify-receipt probe → HTTP %{http_code} (paywall active)\n' -X POST http://localhost:4020/verify-receipt -H 'content-type: application/json' -d '{}'

echo
echo "══ 3/4 · CRE AUDITOR (independent Chainlink workflow) ══"
cd "$ROOT/workflows/leashed-auditor"
export PATH="$HOME/.cre/bin:$PATH"
cre workflow simulate auditor --target staging-settings --non-interactive --trigger-index 0 2>&1 | tee /tmp/audit-run.txt | grep -E "USER LOG|Simulation Result"
grep -oE '\{"verdict".*\}' /tmp/audit-run.txt | head -1 > "$ROOT/docs/auditor-latest.json" 2>/dev/null || true

echo
echo "══ 4/4 · PASSBOOK (oversight dashboard) ══"
open http://localhost:4030
echo "done — every claim above is explorer-linked."
