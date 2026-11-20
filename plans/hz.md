# Hong Zhe: SafeCart build brief (one prompt)

> **How to use:** paste this whole file into your coding agent as one prompt. It is self-contained. Agent code: `hz`. Role: all sponsor API clients in server/integrations/** + keys. Deadline 16:30 PT; P0 must be green by **14:45**.

**Agent instructions:** Work through the tasks in order. For each task: read the listed files first, make the smallest change that meets "Done when", run the check, then post the vault message shown. If something is missing (a key, an endpoint, a file someone else owns), post `BLOCK` with what you need and continue with the next task that doesn't depend on it. Never fake success: if a sponsor call fails, show the error in the trail and keep the mock path working.

## The product
**SafeCart** (working name): a personal shopping agent that remembers what you like, what you want and what you own, buys wishlist items on its own when they go on sale, and is different from every other shopping agent because **it never buys a recalled product and keeps protecting what you already own**: when a recall hits something you own, it files the refund and orders a safe replacement by itself. Every decision lands in an audit trail with cited sources.

Pitch line: *"Every shopping agent finds you a deal. Ours checks it's safe first, and keeps protecting what you already own."*

### Team rules (from hackathon/PROTOCOL.md, Relay vault)
- Your agent code is `hz`. Write only your own `agents/hz.md` and paths you own (table below). Post one-line messages: `hz<N> <HHMM> @to VERB keys | note`.
- Check the vault at task start/finish/blocked. Claude Code agents: arm K-watch (`ctx/K-watch v1.md`).
- Secrets only in the repo-root `.env` (gitignored). Never paste keys into the vault or chat.
- Real vs simulated must be labelled in UI and pitch: real = CPSC recall data, Senso, SIE, SingleStore, Statsig, Amplitude, Stripe TEST payments; simulated = the store, Maya, her inbox.
- Branch from `main`: `git switch -c hz/safecart`; commit small; open a PR to main when your P0 is green; Nael merges.

**What you keep from D1:** your Senso, Stripe and SIE clients in `server/integrations/` (branch `hz/integrations`, 8d1af4b) stay as they are. You add SingleStore, Statsig, the SafeCart seed scripts, and P1 Cognee + Airbyte. Same rules as K-integrations: one TS module per service, typed I/O + `latencyMs` on every result, 2 retries on 429/5xx, no agent logic, a `*.smoke.ts` per module printing one OK/FAIL line per function.

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

### H0 (12:20–12:40, P0, human) Keys → repo-root `.env`
Create accounts and put keys in `.env` (never in the vault): **SingleStore** (portal.singlestore.com → free Shared cluster → Connect → Your App → copy as `S2_URL=mysql://user:pass@host:3306/db`), **Statsig** (console.statsig.com → Server Secret Key → `STATSIG_SERVER_KEY`), Senso/SIE/Stripe (you have them or are getting them), **OpenAI or other key for Cognee** (`LLM_API_KEY`, P1). Also give Nael an Amplitude project API key (or Nael makes one).
Post: `hz<N> HHMM @all FYI keys in .env: S2, Statsig, Senso, SIE, Stripe | Amplitude key → Nael`.

### H1 (12:40–13:20, P0) SingleStore (sponsor: SingleStore)
Files: `server/integrations/singlestore.ts`, `server/integrations/sql/schema.sql`, `server/integrations/seed/seed-singlestore.ts`, `server/integrations/singlestore.smoke.ts`. Driver: `mysql2/promise` (SingleStore speaks MySQL wire protocol) with `S2_URL`.
Schema (6 tables, columnstore default, within the free tier's 10-table cap):
```sql
CREATE TABLE IF NOT EXISTS products (sku VARCHAR(64) PRIMARY KEY, title TEXT, brand VARCHAR(80), model VARCHAR(120), upc VARCHAR(20), category VARCHAR(40), price DECIMAL(10,2), list_price DECIMAL(10,2), url TEXT, descr TEXT, attrs JSON, SORT KEY (category), SHARD KEY (sku));
CREATE TABLE IF NOT EXISTS price_obs (sku VARCHAR(64), price DECIMAL(10,2), observed_at DATETIME(6), SORT KEY (observed_at), SHARD KEY (sku));
CREATE TABLE IF NOT EXISTS wishlist (id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40), sku VARCHAR(64), target_price DECIMAL(10,2), priority INT, added_at DATETIME, SHARD KEY (id));
CREATE TABLE IF NOT EXISTS owned_items (id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40), title TEXT, brand VARCHAR(80), model VARCHAR(120), upc VARCHAR(20), purchased_at DATETIME, merchant VARCHAR(80), order_ref VARCHAR(80), source VARCHAR(40), SHARD KEY (id));
CREATE TABLE IF NOT EXISTS recalls (recall_id VARCHAR(40) PRIMARY KEY, title TEXT, brands JSON, models JSON, upcs JSON, hazard TEXT, remedy TEXT, url TEXT, published_at DATETIME, senso_content_id VARCHAR(80), active_in_demo BOOL DEFAULT FALSE, SHARD KEY (recall_id));
CREATE TABLE IF NOT EXISTS ledger (id BIGINT AUTO_INCREMENT, run_id VARCHAR(60), at DATETIME(6), kind VARCHAR(20), title TEXT, sponsor VARCHAR(30), detail JSON, SORT KEY (at), SHARD KEY (id));
ALTER TABLE products ADD FULLTEXT USING VERSION 2 ft (title, descr);  -- run after load, then OPTIMIZE TABLE products FLUSH;
```
Exports (all return `{...result, latencyMs}`):
- `query<T>(sql: string, params?: unknown[]): Promise<T[]>`
- `getWishlist(userId)` joined with products (title, price, list_price) · `getOwned(userId)`
- `recordPrice(sku, price)` · `setPrice(sku, price)` (used by /demo/sale mirror)
- `matchOwnedToRecall(recallId)`: owned items whose model is in `recalls.models` (JSON_ARRAY_CONTAINS_STRING) or upc in `upcs` or brand+title LIKE
- `recallsForProduct({brand, model, upc})`: rows from `recalls` matching model/upc
- `findAlternatives({category, maxPrice, excludeModels, excludeBrands, text})`: full-text `MATCH(TABLE products) AGAINST(...)` + filters, top 10
- `logLedger({runId, kind, title, sponsor, detail})` (batch-friendly)
- `activateRecall(recallId)` / `resetDemo(userId)`
Seed script reads `data/catalog.json`, `data/wishlist.json`, `data/owned.json`, `data/recalls/*.json` (made by ch, jusman's agent) and is idempotent (TRUNCATE + insert). If data/ isn't there yet, seed 3 placeholder rows and post NEED to @ch.
Done when: `npx tsx server/integrations/singlestore.smoke.ts` prints OK for every export; a screenshot of the SingleStore portal showing the 6 tables and the ledger filling during a tick (for the SingleStore judges).
Post: `hz<N> HHMM @cc DONE S-H1 → server/integrations/singlestore.ts | exports: getWishlist, getOwned, matchOwnedToRecall, recallsForProduct, findAlternatives, logLedger, activateRecall, resetDemo`.

### H2 (13:20–13:45, P0) Statsig (sponsor: Amplitude + Statsig)
File `server/integrations/statsig.ts` with `@statsig/statsig-node-core` (`STATSIG_SERVER_KEY`).
In the Statsig console create: dynamic config **purchase_policy** = `{"autoBuyLimit":150,"minDiscountPct":20,"autonomy":"auto"}` and feature gate **recall_guard** = ON for everyone.
Export `getPolicy(userId = "maya"): Promise<{autoBuyLimit, minDiscountPct, autonomy, recallGuard, source: "statsig"|"default", latencyMs}>` returning defaults (150/20/auto/true, source "default") if the key is missing or the call fails; `logEvent(userId, name, value?, metadata?)`; `flush()`.
Done when: smoke prints OK, and flipping recall_guard in the console changes `getPolicy().recallGuard` within ~10 s.
Post: `hz<N> HHMM @cc DONE S-H2 → statsig.ts getPolicy() | console: purchase_policy, recall_guard`.

### H3 (13:45–14:15, P0) Senso seed for recalls + SIE warm-up (sponsors: Senso, Superlinked)
1. `server/integrations/seed/seed-senso.ts`: for each `data/recalls/*.json` ingest a text doc "CPSC Recall <id>: <title>. Models: …. Hazard: …. Remedy: …. Source: <url>" via `ingestText`; also ingest `data/kb/*.txt` (store refund/recall policy, Maya's stated preferences). Save returned `contentId`s back into SingleStore `recalls.senso_content_id`. Handle 409 (already exists) as success.
2. Add `server/integrations/senso-gate.ts` export `recallFactCheck(brand, model): Promise<{verdict, passages, runId, latencyMs}>` calling `factCheck("The <brand> <model> is not subject to any active product recall.")` — verdict `conflict` means recalled. Test both author modes ('ai_assistant' vs 'organization') once and keep the one that returns conflict for the recalled model; note it in the file header.
3. SIE: add `warmAll()` to `sie.ts` calling guard, extract and rerank once each; cc calls it at server boot (cold starts take minutes).
Done when: `recallFactCheck` returns conflict for the recalled stroller model and verified/unsupported for a clean model; posted with numbers.

### H4 (14:15–14:45, P0) Help cc integrate
Stay on call for cc: fix client bugs within your paths only, add fields cc asks for. Run all smoke scripts once more after merging to main.

### H5 (14:45–15:30, P1) Cognee preference memory (sponsor: Cognee)
Python sidecar `server/integrations/cognee_sidecar/app.py` (Python 3.12, `uv pip install cognee`, `LLM_API_KEY`), stdlib `http.server` on :8100: `POST /remember {text}` → `await cognee.remember(text, dataset_name="maya")`; `POST /recall {query}` → `await cognee.recall(query, datasets=["maya"])` → `{answer, context}`. Seed with Maya's past order + return notes from `data/inbox/*.eml`. TS wrapper `server/integrations/cognee.ts` `recallPreferences(query)` with a 3 s timeout returning `[]` on failure. Use the current API (remember/recall), not legacy add/cognify. Screenshot the graph (`cognee-cli -ui`) for the Cognee judge.

### H6 (14:45–15:30, P1, if time) Airbyte owned-items import (sponsor: Airbyte)
Airbyte Cloud trial → Context layer → Settings → Agent access ON → Gmail source on a seeded demo inbox (never a real one) → create an application (Client-Id/Secret). `server/integrations/airbyte.ts` `listOrderEmails()` via the hosted MCP `https://mcp.airbyte.com/mcp?read-only=true` (headers Client-Id/Client-Secret) → parse order lines → upsert `owned_items` with `source='airbyte'`. Fallback stays `data/inbox/*.eml`.

## Done checklist
- [ ] keys in .env · [ ] singlestore.ts + seed · [ ] statsig.ts · [ ] senso seed + recallFactCheck · [ ] SIE warm · [ ] all smoke OK posted · [ ] PR to main by 14:45 · P1: Cognee, Airbyte
