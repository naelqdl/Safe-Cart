# Plan 02-03 Summary: Web SafeCart UI + Amplitude

Status: Complete with Warnings
Executed: 2026-11-20 ~12:22–12:32 PT, directly in session (no subagent; deadline)
Branch: nc/safecart-web

## Tasks
- N1 types/reducer/mock/routes: Complete. SafetyCheck, RecallAlert, Profile, recall AgentEvent, Receipt.safety, ActionResult.safety (additive). DashboardState.recalls upsert by id (newest first) + assert in reduce.check.mjs. Mock: safety on every receipt and approval path; stroller recall branch (skip → second choice); owned-items sweep after "Publish recall". GET /api/profile, POST /api/demo/[sale|recall|reset] (proxy to AGENT_BACKEND_URL or flip mock state; 400 bad JSON/body, 404 unknown action, 502 backend unreachable).
- N2 screens: Complete. app.config re-skinned (SafeCart, pitch, Maya's wishlist as missions, sponsors strip, footer, autoBuyLimit 150, demo ids). MemoryPanel, RecallAlertsPanel, DemoBar (with policy badges), receipt safety line / NAIVE warning, mounted in dashboard. Compact view unchanged.
- N3 Amplitude: Code complete; live check BLOCKED on NEXT_PUBLIC_AMPLITUDE_API_KEY (not set). Events: sale_detected, safety_check, purchase_auto, approval_requested/approved/declined, recall_alert, policy_seen. No-op without key. Funnel/bar charts in Amplitude not built (needs the key + a human in the Amplitude UI).

## Verification
- npx tsc --noEmit: no errors · npm run lint: no issues · npm run check:agent: OK · npm run build: OK
- npm run smoke -- http://localhost:3011: SMOKE OK
- API flow on prod build: sale → tick shows "On sale −30%", RECALLED, recall alert purchase_skipped, CityLite bought with safety=clear; recall → refund claim + replacement_bought + receipt; profile flips (stroller onSale, high chair recalled); reset restores.
- Browser (gstack headless, 1600px): start, after sale, after recall; no console errors.

## Decisions
- mockProfile is a function (reflects demo state) instead of a constant.
- Mock recalls are placeholders labelled "(mock placeholder)" with the generic CPSC Recalls URL; real recalls come from the backend (ch seeds data/recalls).
- Demo state lives on globalThis so all route bundles share it. Reset reloads the page (client state lives in the tab).
- Demo bar runs a check right after sale/recall so the effect shows immediately.
- showDemoRuns set to false (the K-trail demo runs are Forfeit Zero themed).

## Issues / follow-ups
- appConfig.demo ids (SKU-STROLLER, MOCK-HIGHCHAIR) must match the backend seed once AGENT_BACKEND_URL is set.
- Mock has no recall_guard OFF (naive) mode; the naive flip only works with the real backend + Statsig.
- Chat greeting/mock replies still use generic examples ("AirPods") — chat files were outside this plan.
- Footer says recall data is real (CPSC); true only with the backend, the mock labels its recalls as placeholders.
