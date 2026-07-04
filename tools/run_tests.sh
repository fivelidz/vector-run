#!/usr/bin/env bash
# run_tests.sh — start static server (if needed), run all headless tests.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8099}"

# start server if not already up
if ! curl -s -o /dev/null "http://localhost:$PORT/index.html"; then
  echo "starting server on :$PORT"
  (cd "$DIR" && python3 -m http.server "$PORT" >/tmp/vrserver.log 2>&1 &)
  sleep 1.5
fi

cd "$DIR/tools"
FILT='GPU stall|ReadPixels|CONTEXT_LOST|Context (Lost|Restored)'
echo "=== SMOKE  ==="; node smoke_test.js   | grep -vE "$FILT" || true
echo "=== FLOW   ==="; node flow_test.js    | grep -vE "$FILT" || true
echo "=== JUMP   ==="; node jump_test.js      | grep -vE "$FILT" || true
echo "=== MECHANICS ==="; node mechanics_test.js | grep -vE "$FILT" || true
echo "=== TERRAIN==="; node terrain_test.js | grep -vE "$FILT" || true
echo "=== STRESS ==="; node stress_test.js  | grep -vE "$FILT" || true
echo "=== TRANSITION ==="; node transition_test.js | grep -vE "$FILT" || true
echo "=== DONE ==="
