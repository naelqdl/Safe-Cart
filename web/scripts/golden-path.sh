#!/usr/bin/env bash
# Golden path: runs the 3-minute SafeCart demo through the web app's HTTP API and asserts every beat.
# Usage: bash scripts/golden-path.sh [base_url] [rounds=2]  (server must already be running; mock or AGENT_BACKEND_URL)
set -uo pipefail

BASE="${1:-http://localhost:3000}"
ROUNDS="${2:-2}"
CFG_FILE="$(dirname "$0")/../src/config/app.config.ts"
J='content-type: application/json'
post() { local b='{}'; curl -sS -X POST "$BASE$1" -H "$J" -d "${2:-$b}"; }
code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE$1" -H "$J" -d "$2"; }

# demo ids, missions and guardrails come from app.config.ts (object literals, parsed with node)
CFG=$(node -e '
const t=require("fs").readFileSync(process.argv[1],"utf8"), lit=(re)=>new Function("return "+t.match(re)[1])();
console.log(JSON.stringify({demo:lit(/demo: (\{[^}]*\})/),guardrails:lit(/guardrails: (\{[^}]*\})/),
  missions:(t.match(/\{ id: "m-[^}]*\}/g)||[]).map(s=>new Function("return "+s)())}));' "$CFG_FILE") || { echo "FAIL: cannot read $CFG_FILE" >&2; exit 1; }
c() { node -e 'const {demo,guardrails,missions}='"$CFG"';const v=eval(process.argv[1]);console.log(typeof v==="string"?v:JSON.stringify(v))' "$1"; }
# app.config.ts reads these two from NEXT_PUBLIC_DEMO_* at build time; take them from the env or web/.env.local too
envv() { [ -n "${!1:-}" ] && echo "${!1}" || sed -n "s/^$1=//p" "$(dirname "$0")/../.env.local" 2>/dev/null | tail -n1; }
SKU=$(envv NEXT_PUBLIC_DEMO_SALE_SKU); SKU=${SKU:-$(c demo.saleSku)}; PCT=$(c demo.salePct)
RECALL=$(envv NEXT_PUBLIC_DEMO_RECALL_ID); RECALL=${RECALL:-$(c demo.recallId)}
tick() { printf '{"tick":%s,"missions":%s,"guardrails":%s,"spentToday":0}' "$1" "$(c missions)" "$(c guardrails)"; }

# beat NAME OUTPUT 'js'  -- js sees e (all events/lines), ev (recall alerts), rc (receipts), d (first event); prints PASS/FAIL
beat() {
  printf '%s' "$2" | node -e '
const raw=require("fs").readFileSync(0,"utf8");
let e; try{e=[JSON.parse(raw)]}catch{e=raw.split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return {type:"?",raw:l.slice(0,80)}}})}
const ev=e.filter(x=>x.type=="recall").map(x=>x.alert), rc=e.filter(x=>x.type=="receipt").map(x=>x.receipt), d=e[0];
let ok=false; try{ok=!!eval(process.argv[1])}catch{}
if(!ok) for(const x of e) console.error("   "+(x.type||"?")+": "+(x.step?.title||x.alert?.action||x.receipt?.title||x.message||x.error||x.raw||""));
process.exit(ok?0:1)' "$3" && echo "PASS $1" || { echo "FAIL $1" >&2; FAILS=$((FAILS+1)); }
}

FAILS=0
for r in $(seq 1 "$ROUNDS"); do
  echo "-- round $r"
  beat "reset" "$(post /api/demo/reset)" 'd.ok===true'
  beat "profile has wishlist + owned" "$(curl -sS "$BASE/api/profile")" 'd.wishlist.length>0&&d.owned.length>0&&d.policy&&d.policy.recallGuard===true'

  post /api/demo/recall "{\"recallId\":\"$RECALL\"}" >/dev/null
  OUT=$(post /api/agent/tick "$(tick 1)")
  beat "recall: owned item refunded + replaced, receipt safe" "$OUT" \
    'ev.some(a=>a.itemKind=="owned")&&ev.at(-1).action=="replacement_bought"&&rc.some(x=>x.safety?.status=="clear"&&x.safety.sources.length>=1)'
  beat "profile shows owned item recalled" "$(curl -sS "$BASE/api/profile")" 'd.owned.some(o=>o.safety?.status=="recalled")'

  post /api/demo/sale "{\"sku\":\"$SKU\",\"pct\":$PCT}" >/dev/null
  OUT=$(post /api/agent/tick "$(tick 2)")
  beat "sale: recalled stroller skipped, safe alternative bought" "$OUT" \
    'ev.some(a=>a.itemKind=="wishlist"&&a.action=="purchase_skipped")&&rc.length>0&&rc.every(x=>x.safety?.status=="clear"&&x.safety.recallId==null&&!/AeroLite/.test(x.title.split("(")[0]))'

  INJ=$(post /api/demo/inject '{}')
  if ! grep -qF '"ok":true' <<<"$INJ"; then
    echo "SKIP injection beat (backend refused /demo/inject)"
  else
    # /api/demo/inject also puts the planted item on sale when server/ is upstream (the route does it)
    OUT=$(post /api/agent/tick "$(tick 4)")
    beat "injection: hidden listing instruction blocked, run flagged" "$OUT" \
      'e.some(x=>x.type=="run"&&x.run.steps.some(s=>(s.flags||[]).includes("injection_blocked")))&&rc.length>0'
  fi

  if [ "$(code /api/demo/guard '{"on":false}')" = "409" ]; then
    echo "SKIP naive beat (backend refused /demo/guard; flip recall_guard in Statsig)"
  else
    post /api/demo/reset >/dev/null; post /api/demo/guard '{"on":false}' >/dev/null
    post /api/demo/sale "{\"sku\":\"$SKU\",\"pct\":$PCT}" >/dev/null
    OUT=$(post /api/agent/tick "$(tick 3)")
    beat "naive: guard off buys without safety sources" "$OUT" 'rc.length>0&&rc.every(x=>!x.safety||x.safety.sources.length==0)'
    post /api/demo/guard '{"on":true}' >/dev/null
  fi
  beat "final reset" "$(post /api/demo/reset)" 'd.ok===true'
done
[ "$FAILS" -eq 0 ] || { echo "GOLDEN PATH FAILED ($FAILS beat(s))" >&2; exit 1; }
echo "GOLDEN PATH OK ($ROUNDS rounds)"
