#!/usr/bin/env bash
# Staging-gated deploy for drop-reset-club.
#   ./scripts/deploy.sh staging   deploy to staging + run smoke against it
#   ./scripts/deploy.sh prod      allowed only after this commit passed staging
#
# The smoke test needs `pip3 install websocket-client`. If it's installed to a
# non-default location, export PYTHONPATH before invoking this script.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:?usage: deploy.sh staging|prod}"
SHA=$(git rev-parse HEAD)
PASS_FILE=".staging-passed"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "REFUSED: working tree has uncommitted tracked changes — commit first so the pass marker matches what deploys." >&2
  exit 1
fi

# Right after a deploy the edge can cache the OLD app.js under the NEW ?v= URL
# (bit us twice: smoke false-fails, stale hero). Poll until the served file
# matches the local one before smoking.
wait_for_asset() {
  local base="$1"
  local v; v=$(grep -o 'app.js?v=[0-9]*' v5/index.html | head -1 | cut -d= -f2)
  local want; want=$(md5 -q v5/app.js)
  for _ in 1 2 3 4 5 6 7 8 9; do
    if [ "$(curl -s "$base/v5/app.js?v=$v" | md5 -q)" = "$want" ]; then return 0; fi
    sleep 10
  done
  echo "WARNING: $base/v5/app.js?v=$v still stale after 90s — smoke may false-fail" >&2
}

if [ "$MODE" = "staging" ]; then
  env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=staging
  wait_for_asset https://staging.reset.club
  python3 scripts/site-smoke.py https://staging.reset.club
  echo "$SHA" > "$PASS_FILE"
  echo "staging PASS recorded for $SHA"
elif [ "$MODE" = "prod" ]; then
  if [ ! -f "$PASS_FILE" ] || [ "$(cat "$PASS_FILE")" != "$SHA" ]; then
    echo "REFUSED: HEAD ($SHA) has not passed staging smoke. Run ./scripts/deploy.sh staging first." >&2
    exit 1
  fi
  env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=main
  wait_for_asset https://reset.club
  python3 scripts/site-smoke.py https://reset.club
  echo "prod deployed + smoked: $SHA"
else
  echo "unknown mode: $MODE" >&2; exit 1
fi
