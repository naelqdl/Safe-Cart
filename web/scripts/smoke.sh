#!/usr/bin/env bash
# HTTP smoke checks for the agent seam and home page.
# Usage: bash scripts/smoke.sh [base_url] (default http://localhost:3000; server must already be running)
set -euo pipefail

BASE="${1:-http://localhost:3000}"
fail() { echo "FAIL: $1" >&2; exit 1; }
post() { curl -sS -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }
code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }

post /api/agent '{"query":"a usb-c charger"}' | tail -n1 | grep -qF '"type":"done"' \
  || fail "agent stream did not end with a done event"
post /api/agent '{"query":"please fail"}' | tail -n1 | grep -qF '"type":"error"' \
  || fail "'please fail' stream did not end with an error event"
[ "$(code /api/agent '{"query":""}')" = "400" ] || fail "empty query did not return 400"
[ "$(code /api/agent 'nope')" = "400" ] || fail "malformed JSON body did not return 400"
post /api/action '{"candidateId":"c2","query":"x"}' | grep -qF '"reference"' \
  || fail "action response has no reference"
post /api/action '{"candidateId":"c2","query":"decline test"}' | grep -qF '"ok":false' \
  || fail "'decline' action did not return ok:false"

NAME=$(grep -m1 -oE 'name: "[^"]+"' "$(dirname "$0")/../src/config/app.config.ts" | cut -d'"' -f2)
[ -n "$NAME" ] || fail "could not read appConfig.name"
PAGE=$(curl -sS "$BASE/")
grep -qF "$NAME" <<<"$PAGE" || fail "home page does not contain the app name '$NAME'"
grep -qF "Audit trail" <<<"$PAGE" || fail "home page does not contain 'Audit trail'"

echo "SMOKE OK ($BASE)"
