# server/integrations (T11, owner hz)
Typed sponsor clients per vault doc `K-integrations`. No agent logic: typed I/O, retries (2x on 429/5xx), `latencyMs` on every result.

| module | functions | env |
|---|---|---|
| `senso.ts` | `ingestText`, `updateText`, `findDoc`, `searchContext`, `factCheck`, `whoAmI`, `creditBalance` | `SENSO_API_KEY` |
| `stripe.ts` | `mintSpt`, `pay` (test mode only; live keys refused; idempotency key per payment) | `STRIPE_SECRET_KEY` |
| `sie.ts` | `extract`, `rerank`, `guard`, `classify`, `warm`/`warmAll` (call at boot) | `SIE_API_KEY` |
| `senso-gate.ts` | SafeCart: `recallFactCheck(brand, model)` (conflict = recalled; see seed/README.md) | `SENSO_API_KEY` |
| `seed/seed-senso.ts` | SafeCart: real CPSC recalls + `data/kb` → Senso (`npm run seed:senso`) | `SENSO_API_KEY` |
| `singlestore.ts` | SafeCart S-H1: `query`, `ping`, `getWishlist`, `getOwned`, `getProduct`, `getRecalls`, `matchOwnedToRecall`, `recallsForProduct`, `findAlternatives` (full-text v2 + filters), `recordPrice`, `setPrice`, `logLedger`, `getLedger`, `activateRecall`, `resetDemo`. Schema `sql/schema.sql`; seed `npm run seed:s2` | `S2_URL` |
| `spd.ts` | D1 (superseded): `activeSpd`, `setActiveSpd`, `readCarryover` | `SENSO_API_KEY` |
| `statsig.ts` | `getPolicy` (dynamic config `purchase_policy` + gate `recall_guard`; defaults on any failure; a missing gate keeps the guard ON), `logEvent`, `flush`, `shutdown` | `STATSIG_SERVER_KEY` |

Functions that return lists wrap them: `searchContext → {passages}`, `rerank → {results}`, `extract → {entities}`, so `latencyMs` and `model` fit alongside.

```bash
cd server/integrations && npm install
cp ../../.env.example ../../.env   # fill in keys
npm run smoke                      # one OK/FAIL/SKIP line per function
```
Import from the agent loop: `import { factCheck } from './integrations/senso.ts'` (run with tsx).
