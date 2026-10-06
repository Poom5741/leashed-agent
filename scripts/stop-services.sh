#!/usr/bin/env zsh
# Stop the leashed-agent services started by scripts/start-services.sh.
# Idempotent — safe to run when nothing is on the ports.
set -e
for p in 4030 4020; do
  if lsof -ti :$p >/dev/null 2>&1; then
    lsof -ti :$p | xargs kill -9 2>/dev/null || true
    echo "  ✓ :$p stopped"
  else
    echo "  · :$p already free"
  fi
done