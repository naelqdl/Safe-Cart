#!/usr/bin/env bash
# HTTP smoke checks for the agent seam and home page.
# Usage: bash scripts/smoke.sh [base_url] (default http://localhost:3000; server must already be running)
# SMOKE_MODE=backend skips the checks that only the built-in mock satisfies (scripted outcomes); contract checks always run.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
fail() { echo "FAIL: $1" >&2; exit 1; }
post() { curl -sS -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }
code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }

TICK='"missions":[{"id":"m1","title":"%s","maxPrice":%s,"currency":"USD"}],"guardrails":{"autoBuyLimit":50,"dailyBudget":150},"spentToday":0'
tick() { printf "{\"tick\":%s,$TICK}" "$1" "$2" "$3"; }

MODE="${SMOKE_MODE:-mock}"
OUT=$(post /api/agent/tick "$(tick 1 Charger 40)")
tail -n1 <<<"$OUT" | grep -qF '"type":"done"' || fail "tick 1 stream did not end with a done event"
if [ "$MODE" = mock ]; then
grep -qF '"type":"receipt"' <<<"$OUT" || fail "tick 1 (charger, \$40) did not auto-buy (no receipt event)"
post /api/agent/tick "$(tick 2 Charger 250)" | grep -qF '"type":"approval"' \
  || fail "tick 2 (\$250 max) did not ask for approval"
post /api/agent/tick "$(tick 1 'please fail' 40)" | tail -n1 | grep -qF '"type":"error"' \
  || fail "'please fail' tick did not end with an error event"
[ "$(code /api/agent/tick '{"tick":1}')" = "400" ] || fail "tick with missing fields did not return 400"
[ "$(code /api/agent/tick 'nope')" = "400" ] || fail "malformed JSON body did not return 400"
post /api/action '{"candidateId":"c2","query":"x"}' | grep -qF '"reference"' \
  || fail "action response has no reference"
post /api/action '{"candidateId":"c2","query":"decline test"}' | grep -qF '"ok":false' \
  || fail "'decline' action did not return ok:false"
fi

CHAT='"context":{"autopilot":true,"guardrails":{"autoBuyLimit":50,"dailyBudget":150},"currency":"USD","missions":[],"approvals":[],"receipts":[],"recentSteps":[]}'
if [ "$MODE" = mock ]; then
  post /api/chat "{\"message\":\"watch airpods under \$150\",$CHAT}" | grep -qF '"add_mission"' \
    || fail "chat 'watch airpods under \$150' did not return an add_mission action"
else
  post /api/chat "{\"message\":\"is my high chair safe?\",$CHAT}" | grep -qF '"reply"' || fail "chat did not return a reply"
fi
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/profile")" = "200" ] || fail "GET /api/profile did not return 200"
[ "$(code /api/chat "{\"message\":\"\",$CHAT}")" = "400" ] || fail "chat with empty message did not return 400"

NAME=$(grep -m1 -oE 'name: "[^"]+"' "$(dirname "$0")/../src/config/app.config.ts" | cut -d'"' -f2)
[ -n "$NAME" ] || fail "could not read appConfig.name"
PAGE=$(curl -sS "$BASE/")
grep -qF "$NAME" <<<"$PAGE" || fail "home page does not contain the app name '$NAME'"
grep -qF "Autopilot" <<<"$PAGE" || fail "home page does not contain 'Autopilot'"

echo "SMOKE OK ($BASE)"
