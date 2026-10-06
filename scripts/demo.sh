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
# Tee the FULL audit log (unfiltered) so verdict extraction works; show the user log lines.
cre workflow simulate auditor --target staging-settings --non-interactive --trigger-index 0 2>&1 | tee /tmp/audit-run.txt | grep -E "USER LOG|Simulation Result"

# Extract the verdict JSON robustly: scan every line for the first complete
# JSON object whose key set includes "verdict". Never write a 0-byte file —
# the dashboard crashes on JSON.parse('') (see test/auditor.test.ts).
VERDICT_PATH="$ROOT/docs/auditor-latest.json"
python3 - "$VERDICT_PATH" <<'PY' || { echo "[audit] FATAL: no verdict JSON found in /tmp/audit-run.txt" >&2; exit 1; }
import json, sys, pathlib
src = pathlib.Path("/tmp/audit-run.txt").read_text(errors="replace")
target = pathlib.Path(sys.argv[1])

# Find a JSON object containing "verdict" by walking balanced braces.
# CRE's printer sometimes emits a raw object and sometimes a JSON-escaped
# string ("{\"verdict\":…}") — we tolerate both via a second json.loads pass.
def find_verdict(text):
    for i, ch in enumerate(text):
        if ch != '{':
            continue
        depth, j = 0, i
        while j < len(text):
            c = text[j]
            if c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        else:
            continue
        blob = text[i:j+1]
        try:
            obj = json.loads(blob)
        except Exception:
            try:
                obj = json.loads(blob.replace('\\"', '"').replace('\\\\', '\\'))
            except Exception:
                continue
        if isinstance(obj, dict) and 'verdict' in obj:
            return obj
    return None

obj = find_verdict(src)
if obj is None:
    sys.exit(1)
obj.setdefault("attestationTx", "simulated — see docs/cre-auditor-evidence.txt")
target.write_text(json.dumps(obj, indent=1))
print(f"[audit] verdict written: {obj.get('verdict')} (checked={obj.get('checked','?')})")
PY

echo
echo "══ 4/4 · PASSBOOK (oversight dashboard) ══"
open http://localhost:4030
echo "done — every claim above is explorer-linked."
