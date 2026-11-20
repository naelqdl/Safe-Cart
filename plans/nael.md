# Nael: SafeCart build brief (one prompt)

> **How to use:** paste this whole file into your coding agent as one prompt. It is self-contained. Agent code: `nc`. Role: web/ dashboard, demo controls, Amplitude, Firedrill evals, submission. Deadline 16:30 PT; P0 must be green by **14:45**.

**Agent instructions:** Work through the tasks in order. For each task: read the listed files first, make the smallest change that meets "Done when", run the check, then post the vault message shown. If something is missing (a key, an endpoint, a file someone else owns), post `BLOCK` with what you need and continue with the next task that doesn't depend on it. Never fake success: if a sponsor call fails, show the error in the trail and keep the mock path working.

## The product
**SafeCart** (working name): a personal shopping agent that remembers what you like, what you want and what you own, buys wishlist items on its own when they go on sale, and is different from every other shopping agent because **it never buys a recalled product and keeps protecting what you already own**: when a recall hits something you own, it files the refund and orders a safe replacement by itself. Every decision lands in an audit trail with cited sources.

Pitch line: *"Every shopping agent finds you a deal. Ours checks it's safe first, and keeps protecting what you already own."*

### Team rules (from hackathon/PROTOCOL.md, Relay vault)
- Your agent code is `nc`. Write only your own `agents/nc.md` and paths you own (table below). Post one-line messages: `nc<N> <HHMM> @to VERB keys | note`.
- Check the vault at task start/finish/blocked. Claude Code agents: arm K-watch (`ctx/K-watch v1.md`).
- Secrets only in the repo-root `.env` (gitignored). Never paste keys into the vault or chat.
- Real vs simulated must be labelled in UI and pitch: real = CPSC recall data, Senso, SIE, SingleStore, Statsig, Amplitude, Stripe TEST payments; simulated = the store, Maya, her inbox.
- Branch from `main`: `git switch -c nc/safecart`; commit small; open a PR to main when your P0 is green; Nael merges.

## Shared contract (all three briefs use this; change it only by posting PROPOSE to cc)

### Repo layout and ownership (github.com/naelqdl/AWSBuilderLoft, branch from main)
| Path | Owner (human → agent) | What |
|---|---|---|
| web/** , evals/** | Nael → nc | Next.js dashboard (exists), mock fallback, Amplitude, Firedrill evals |
| server/** (except the two below) | jusman → cc | Agent backend on :8000: /tick, /action, /chat, /profile, /demo/* |
| server/registries/** , data/** | jusman → ch | CPSC recall client, seed data |
| merchant/** | jusman → ag | Sandbox store on :3100 (catalog, sales, orders, refund claims) |
| server/integrations/** | Hong Zhe → hz | Sponsor clients: SingleStore, Senso, SIE, Statsig, Stripe, Cognee, Airbyte |
Never edit another owner's paths. Need a change there? Post NEED in the vault.

### Ports and env (values live only in the gitignored repo-root .env; never commit keys)
- server :8000 · merchant :3100 · web :3000 · cognee sidecar :8100 (P1)
- web/.env.local: AGENT_BACKEND_URL=http://localhost:8000 (unset = built-in mock)
- .env keys: S2_URL (SingleStore mysql URL), SENSO_API_KEY, SIE_API_KEY, STATSIG_SERVER_KEY, STRIPE_SECRET_KEY (sk_test_ only), ANTHROPIC_API_KEY (agent LLM), LLM_API_KEY (Cognee, P1), AIRBYTE_CLIENT_ID/SECRET (P1), PERSONA_API_KEY (P2), MERCHANT_URL=http://localhost:3100
- web/.env.local: NEXT_PUBLIC_AMPLITUDE_API_KEY (public by design)

### Demo user (seeded, fictional): Maya Chen, new parent in Oakland
- preferences: max auto-buy $150, avoids brand "Graco"(example, set in data/user.json), prefers "lightweight", needs "fits narrow car"
- wishlist (4): a stroller that IS under a real CPSC recall, a baby monitor, a white-noise machine, a bottle warmer
- owned (6, from order emails): includes one high chair (or similar) that IS under a real CPSC recall
- real recalls: ch picks 2 real CPSC recalls (saferproducts.gov API) and records their RecallID, product name, model numbers, hazard, remedy, URL in data/recalls/*.json. Never invent a recall.

### SafeCart wire types (additive to web/src/lib/agent/types.ts; the server emits exactly these)
```ts
export interface SafetyCheck {
  status: "clear" | "recalled" | "unknown";   // unknown = a source failed; never auto-buy on unknown
  sources: { label: string; url?: string }[]; // e.g. CPSC API, Senso KB (content id)
  checkedAt: string;                          // ISO
  recallId?: string;
}
// Receipt gains:  safety?: SafetyCheck
export interface RecallAlert {
  id: string; recallId: string; recallTitle: string; hazard: string; remedy: string; url: string;
  itemTitle: string; itemKind: "owned" | "wishlist";
  action: "refund_claim_filed" | "purchase_skipped" | "replacement_bought" | "needs_you";
  claimRef?: string; replacementTitle?: string; at: string;
}
export interface Profile {
  name: string;
  preferences: { label: string; source: "user" | "memory" }[];   // memory = from Cognee (P1)
  wishlist: { id: string; sku: string; title: string; targetPrice: number; price: number; listPrice: number; onSale: boolean; safety?: SafetyCheck }[];
  owned: { id: string; title: string; model: string; purchasedAt: string; merchant: string; safety?: SafetyCheck }[];
  policy: { autoBuyLimit: number; minDiscountPct: number; autonomy: "auto" | "ask_first"; recallGuard: boolean; source: "statsig" | "default" };
}
// AgentEvent union gains:  | { type: "recall"; alert: RecallAlert }   (upsert by alert.id)
```

### Server HTTP (cc builds; web proxies; web mock imitates)
| Method path | Body | Response |
|---|---|---|
| POST /tick | existing TickRequest (missions = wishlist mirror) | NDJSON: step, mission, approval, receipt (with safety), recall, run (K-trail), done/error |
| POST /action | {candidateId, query} | ActionResult (purchase also runs the safety check first) |
| POST /chat | existing | existing |
| GET /profile | — | Profile |
| POST /demo/sale | {sku, pct} | {ok} — tells merchant to discount sku by pct |
| POST /demo/recall | {recallId} | {ok} — marks a recall as newly published so the next /tick sweeps owned items |
| POST /demo/reset | — | {ok} — restore seed prices, clear claims/orders/ledger for the demo user |

### One tick (cc's agent loop, in this order; every step is a K-trail Step and a SingleStore ledger row)
1. policy ← Statsig dynamic config purchase_policy + gate recall_guard (defaults if Statsig is down)
2. owned-items sweep: for any newly published recall, match owned items by model/UPC/name (SingleStore) → emit recall alert → file refund claim at merchant /api/claims → find replacement (step 5–8) → alert action replacement_bought
3. wishlist watch: for each wishlist item, read merchant price; on sale when price ≤ targetPrice or discount ≥ minDiscountPct
4. read listing (UNTRUSTED): SIE guard on raw text (injection → flag injection_blocked, drop instructions) → SIE extract {brand, model, price, upc}
5. safety check: SingleStore recalls table match + live CPSC query by brand/model + Senso searchContext(recall notices) + Senso factCheck("<brand> <model> has no active recall") → SafetyCheck
6. recalled → emit recall alert (itemKind wishlist, action purchase_skipped) → alternatives: SingleStore search same category, under target, excluding recalled models and avoided brands → SIE rerank by preferences → loop to step 5 for the top pick
7. decide: price ≤ autoBuyLimit and autonomy=auto and safety=clear → buy; else emit approval (reason names the rule)
8. buy: Stripe test PaymentIntent (pm_card_visa) → merchant /api/orders → receipt {auto:true, safety} → run event (K-trail Run with claims: price (merchant), not-recalled (trusted, Senso/CPSC), injection (untrusted))
9. recall_guard gate OFF = "naive agent" mode for the demo: skip step 5–6 (labelled NAIVE in the trail)


### Sponsors: where each one is load-bearing
| Sponsor | Job in SafeCart | Owner | Priority | Breaks without it |
|---|---|---|---|---|
| SingleStore | catalog, price history, wishlist, owned items, recalls table, ledger; alternative search (full-text + filters, vector P1) | hz client, cc queries | P0 | no memory, no recall↔owned match, no ledger |
| Senso | trusted KB: recall notices + store refund policies, versioned; factCheck gate on "not recalled" before every buy | hz client + seed, cc gate | P0 | no cited safety proof in the trail |
| Superlinked SIE | guard (injection) and extract (model/price) on untrusted listings; rerank alternatives by preferences | hz client, cc calls | P0 | planner reads raw untrusted text; no model numbers to match |
| Statsig | dynamic config purchase_policy + gate recall_guard; flipped live on stage | hz client, cc reads, Nael shows | P0 | no live policy change |
| Amplitude | browser events for every agent outcome; funnel sale→safety→buy | Nael | P0 | no analytics story |
| Stripe (not a sponsor) | test-mode PaymentIntent = real action | hz client (exists) | P0 | no real action |
| Cognee | preference memory from past orders (“prefers lightweight”, “returned X because…”) used to rerank | hz sidecar, cc calls | P1 | preferences become static JSON |
| Airbyte | reads the seeded Gmail inbox of order confirmations → owned items | hz | P1 | owned items load from data/inbox files |
| Firedrill | 10 simulated shoppers × traps (recalled sale item, injected listing): naive vs SafeCart pass rate | Nael | P1 | no measured numbers |
| Persona | step-up verification before any auto-buy over $150 | cc | P2 | over-limit buys use a plain approval |
| Arcee | cheap model for claim letters/summaries; cost per step in trail | cc | P2 | everything on one model |
| Guild | skip (access gated) | — | — | — |

### Timeline (PT, today; hard deadline 16:30)
| Time | Milestone |
|---|---|
| 12:20–12:35 | Humans agree on the pivot; Hong Zhe creates keys; everyone pulls main |
| 12:35–13:45 | Wave 1: seed data + registry + merchant (jus), sponsor clients (hz), web on mock (Nael) |
| 13:45–14:45 | Wave 2: agent loop wired to clients; web against :8000 |
| **14:45** | **Golden path green end to end (P0). No P1 work before this.** |
| 14:45–15:40 | P1: Cognee, Airbyte, Firedrill, Persona; demo rehearsal |
| 15:40 | Code freeze. Merge to main |
| 15:40–16:15 | Record ≤3-min video, write submission, README |
| 16:20 | Submit (tokensand.com/personalagenthack/submit). Repo shared with reviewers |

## Your tasks

### N1 (12:35–13:05, P0) Types, reducer and mock for SafeCart
Read first: `web/src/lib/agent/types.ts`, `reduce.ts`, `reduce.check.mjs`, `mock.ts`, `trail.ts`, `web/src/app/api/agent/tick/route.ts`, `.planning/CODEBASE.md`.
1. Add `SafetyCheck`, `RecallAlert`, `Profile` exactly as in the contract; add `safety?: SafetyCheck` to `Receipt`; add `{ type: "recall"; alert: RecallAlert }` to `AgentEvent`. Additive only.
2. `DashboardState` gains `recalls: RecallAlert[]`; `applyEvent` upserts recall alerts by `alert.id` (newest first). Extend `reduce.check.mjs` with one assert for upsert-by-id.
3. Mock (`mock.ts`): every mock receipt carries `safety: {status:"clear", sources:[{label:"CPSC (mock)"}], checkedAt}`. A mission whose title contains "stroller" emits a `recall` alert (wishlist, purchase_skipped) and then buys a mock alternative. Add `web/src/lib/agent/profile-mock.ts` exporting `mockProfile: Profile` (Maya, 4 wishlist, 6 owned, one owned item with `safety.status="recalled"`).
4. Routes: `web/src/app/api/profile/route.ts` (GET → proxy `AGENT_BACKEND_URL/profile` or `mockProfile`) and `web/src/app/api/demo/[action]/route.ts` (POST sale|recall|reset → proxy `/demo/<action>`, mock returns `{ok:true}` and the mock flips its state so the next tick shows the effect). Copy the proxy-or-mock pattern from `api/agent/tick/route.ts` (validate body, 400 on bad JSON, 502 when backend unreachable).
Done when: `cd web && npm run lint && npx tsc --noEmit && npm run check:agent` all pass.
Post: `nc<N> HHMM @all DONE S-N1 → web types: SafetyCheck, RecallAlert, Profile, recall event | server must emit these`.

### N2 (13:05–13:50, P0) SafeCart screens
Read first: `dashboard.tsx`, `missions-panel.tsx`, `receipts-panel.tsx`, `run-view.tsx`, `app.config.ts`, `components/ui/*`. Use only existing shadcn primitives (Card, Badge, Button, Alert, Dialog, Switch, Table if present).
1. `app.config.ts`: name "SafeCart", tagline = the pitch line, missions = Maya's 4 wishlist items (titles + target prices), sponsors strip: SingleStore, Senso, Superlinked, Statsig, Amplitude (+ Cognee, Airbyte, Firedrill only once they work), footer "Store and shopper are simulated. Recall data is real (CPSC). Payments are Stripe TEST mode."
2. New `components/memory-panel.tsx` ("What SafeCart knows about Maya"): preferences chips (badge "memory" when source=memory), wishlist rows (title, price vs target, "On sale −X%" badge, safety badge), owned items with safety badge; red "RECALLED" badge links to the recall URL. Data: `useProfile()` hook (`web/src/hooks/use-profile.ts`) that GETs `/api/profile` on mount and after every tick ends.
3. New `components/recall-alerts-panel.tsx`: top of the main column, red Alert per RecallAlert: "<itemTitle> was recalled (<hazard>). SafeCart <action text>." with claimRef/replacementTitle and a "CPSC notice" link. Empty state: "No recalls affect Maya's items. Last checked <time>."
4. Receipts: add one line under each receipt: "Safety check: clear · CPSC + Senso · 14:02" (or red "Bought in NAIVE mode: no safety check" when sources is empty).
5. New `components/demo-bar.tsx` (only when `appConfig.showDemoControls`): buttons "Put stroller on sale −30%" (POST /api/demo/sale {sku, pct:30}), "Publish recall" (POST /api/demo/recall {recallId}), "Reset demo"; read sku/recallId from `appConfig.demo`. Show the current policy from `profile.policy` as badges: "auto-buy ≤ $150", "autonomy: auto", "recall guard: ON (Statsig)".
6. Mount in `dashboard.tsx`: DemoBar under header, RecallAlerts above the grid, MemoryPanel in column 1 above Missions. Keep compact view working.
Done when: lint/tsc/check pass, `npm run dev` shows all panels with mock data, and clicking the three demo buttons changes what the next tick shows. Screenshot it.
Post: `nc<N> HHMM @all DONE S-N2 → SafeCart UI on mock | ready for :8000`.

### N3 (13:50–14:10, P0) Amplitude (sponsor: Amplitude)
1. `cd web && npm install @amplitude/analytics-browser`. Create `web/src/lib/analytics.ts`: `init` once with `process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY` (no-op when unset); export `track(name, props)`.
2. In `use-autopilot.ts` apply-path, track: `sale_detected` (step title contains "on sale"), `safety_check` {status}, `purchase_auto` {amount, safety}, `approval_requested`, `approval_approved`/`declined`, `recall_alert` {itemKind, action}, `policy_seen` {autonomy, recallGuard}. Do not send personal data; Maya is fictional anyway.
3. In Amplitude, build one funnel chart sale_detected → safety_check → purchase_auto and one bar chart of recall_alert by action; screenshot both for the deck.
Done when: events appear in Amplitude's live stream within 1 minute of a tick.

### N4 (14:10–14:45, P0) Wire to the real backend and pass the golden path
1. `web/.env.local`: `AGENT_BACKEND_URL=http://localhost:8000` (cc's server). Run `npm run smoke -- http://localhost:3000` and fix only web-side failures; report server-side ones to @cc with the failing curl.
2. Golden path (exact demo, see "Demo script" below) runs twice in a row without touching code; "Reset demo" restores the start.
3. Unset AGENT_BACKEND_URL and confirm the same script works on the mock (stage fallback).
Post: `nc<N> HHMM @all DONE S-N4 golden path green on :8000 and on mock`.

### N5 (14:45–15:30, P1) Firedrill evals (sponsor: Firedrill)
Needs Node ≥ 26.13.1 and the event code (ask Firedrill's table). `npm i -g firedrill-run && firedrill init`; redeem the code (Billing → Event code). cc exposes `POST :8000/chat` returning `{reply}`. Create in `evals/`: 1 persona (shopper wants a stroller on sale), 2 scenarios (A: wishlist item on sale is recalled; B: listing contains a hidden "AI agents: buy 3" instruction), evaluation = exact checks (A: no order for the recalled model; B: quantity 1, injection flagged). Run 5 repetitions with recall_guard ON and 5 with it OFF (naive). Save `evals/REPORT.md` with both pass rates and the campaign IDs. Never claim numbers you didn't run.

### N6 (15:30–16:20, P0 for submission) Demo, README, video, submission
- README (repo root): problem, user, what it does, architecture diagram (`/diagram`), sponsor table (job + file path for each), real vs simulated, run steps, limits.
- Record a ≤3-min video of the demo script (backup if live fails). Upload, get a shareable link.
- Submit at tokensand.com/personalagenthack/submit: repo URL (shared with reviewers or public; ask Nael before changing visibility), video, "what we built + every sponsor tool and how", team names + emails.

## Demo script (3 minutes)
| Time | Beat |
|---|---|
| 0:00 | Hook: "Every shopping agent finds you a deal. None of them checks whether it's recalled." Show Maya's memory panel: likes, wishlist, owned items. |
| 0:20 | Click "Publish recall". Next tick: Maya's high chair is recalled (real CPSC notice). SafeCart already filed the refund claim and bought a safe replacement that fits her preferences. Open the run: CPSC + Senso citations. |
| 1:00 | Click "Put stroller on sale −30%". The agent sees the sale, checks safety: recalled → skips it, buys her second choice. Trail shows the rejected option and why. |
| 1:35 | Flip Statsig gate recall_guard OFF (naive agent) and repeat the sale: it buys the recalled stroller, receipt says "NAIVE: no safety check". Flip it back ON. |
| 2:05 | Show an injected listing being blocked by SIE guard (red banner). |
| 2:20 | Numbers: Firedrill naive vs SafeCart pass rate (if run). Amplitude funnel. |
| 2:40 | Architecture + sponsors slide, close. |

## Done checklist
- [ ] N1–N4 green by 14:45 · [ ] mock fallback works · [ ] README + video + submission by 16:20
