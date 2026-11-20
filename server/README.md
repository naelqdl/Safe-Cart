# server/: SafeCart agent backend (S-J4, owner cc)

A recall-safe shopping agent on **:8000**. It watches Maya's wishlist for sales and checks every purchase against
real CPSC recalls first. It also protects what she already owns: a new recall on an owned item makes it file the
refund claim and buy a safe replacement. Every step is a K-trail step, a dashboard event, and a ledger row.

```bash
cd server/integrations && npm install && cd ..   # sponsor clients (hz)
npm install
npm run dev                  # :8000 (tsx watch)
npm run smoke                # runs the whole demo script, exits 1 if a beat is missing
npm run smoke:cpsc           # live CPSC check for both seeded recalls
```
Keys live in the repo-root `.env` (see `.env.example`). Every sponsor is optional at runtime: when a key or a
service is missing, the trail says so (e.g. "Payment SIMULATED (no STRIPE_SECRET_KEY)", "CPSC (CACHED)").
`GET /health` lists the data, keys, store backend and merchant status.

## HTTP (K-dashboard v1 + SafeCart additions)
| Route | What |
|---|---|
| `POST /tick` | NDJSON: `step`, `mission`, `recall`, `approval`, `receipt` (with `safety`), `run` (K-trail), then `done` or `error` |
| `POST /action {candidateId}` | approved purchase; re-runs the safety check first |
| `POST /chat {message}` | "is my high chair safe?" → cited recall answer; "check now"; "autopilot on/off" |
| `GET /profile` | Profile: wishlist (+price/onSale/safety), owned, preferences, policy |
| `POST /demo/sale {sku, pct}` | discount a SKU (merchant admin + local mirror) |
| `POST /demo/recall {recallId?}` | publish a recall → next tick sweeps owned items (defaults to the owned-item recall) |
| `POST /demo/inject {sku?, text?}` | plant a prompt injection in a listing (defaults to wishlist item 2) |
| `POST /demo/guard {on}` | local stand-in for the Statsig `recall_guard` flip; `{}` returns control to Statsig |
| `POST /demo/reset` | restore seed prices, clear claims, orders, ledger and injections |
| `GET /ledger`, `GET /health` | last 200 ledger rows; status |

## One tick (plans/jus.md 1–9)
1. **Policy:** Statsig `purchase_policy` + `recall_guard` (defaults from `data/user.json`).
2. **Owned sweep:** a newly published recall is matched to owned items by **model/UPC**, never by brand. Then: refund claim → alternatives → safety → buy.
3. **Wishlist watch:** on sale = price ≤ target or ≥ min discount.
4. **Quarantine:** listing text is untrusted. Pattern rules plus the SIE classifier drop instructions; SIE GLiNER2 extracts fields.
5. **Safety** (`src/safety.ts`): recall table (SingleStore/local) ∪ **live CPSC** ∪ Senso KB search ∪ Senso fact-check, all in parallel. Recalled if any source names the exact model; **unknown if every source failed, and unknown never auto-buys**.
6. **Recalled:** skip it, then find alternatives in the same category under target (no recalled models, no avoided brands), rerank by preferences (SIE reranker), and safety-check the top pick.
7. **Decide (deterministic code, no model):** price ≤ auto-buy limit, autonomy on, safety clear, within the daily budget → buy; otherwise approval with the rule named.
8. **Buy:** Stripe TEST PaymentIntent → merchant order → receipt with the safety check.
9. **`recall_guard` off = NAIVE mode:** safety skipped and labelled. This is the on-stage contrast.

Files: `src/index.ts` (HTTP) · `src/tick.ts` (loop) · `src/safety.ts` · `src/listing.ts` · `src/trail.ts` (K-trail recorder) ·
`src/adapters/{store,merchant,policy,sponsors}.ts` (SingleStore / ag's store / Statsig / hz's clients, each with a labelled fallback) ·
`registries/cpsc.ts` (S-J2: keyless CPSC client; model numbers are matched in the recall text because CPSC leaves `Products[].Model` empty).
