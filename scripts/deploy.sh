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

if [ "$MODE" = "staging" ]; then
  env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=staging
  python3 scripts/site-smoke.py https://staging.drop-reset-club.pages.dev
  echo "$SHA" > "$PASS_FILE"
  echo "staging PASS recorded for $SHA"
elif [ "$MODE" = "prod" ]; then
  if [ ! -f "$PASS_FILE" ] || [ "$(cat "$PASS_FILE")" != "$SHA" ]; then
    echo "REFUSED: HEAD ($SHA) has not passed staging smoke. Run ./scripts/deploy.sh staging first." >&2
    exit 1
  fi
  env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy . --branch=main
  python3 scripts/site-smoke.py https://reset.club
  echo "prod deployed + smoked: $SHA"
else
  echo "unknown mode: $MODE" >&2; exit 1
fi
