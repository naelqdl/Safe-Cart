# server/integrations (T11, owner hz)
Typed sponsor clients per vault doc `K-integrations`. No agent logic: typed I/O, retries (2x on 429/5xx), `latencyMs` on every result.

| module | functions | env |
|---|---|---|
| `senso.ts` | `ingestText`, `updateText`, `findDoc`, `searchContext`, `factCheck`, `whoAmI`, `creditBalance` | `SENSO_API_KEY` |
| `stripe.ts` | `mintSpt`, `pay` (test mode only; live keys refused; idempotency key per payment) | `STRIPE_SECRET_KEY` |
| `sie.ts` | `extract`, `rerank`, `guard`, `classify`, `warm` | `SIE_API_KEY` |
| `spd.ts` | `activeSpd`, `setActiveSpd`, `readCarryover` (pinned SPD; see seed/README.md) | `SENSO_API_KEY` |

Functions that return lists wrap them: `searchContext → {passages}`, `rerank → {results}`, `extract → {entities}`, so `latencyMs` and `model` fit alongside.

```bash
cd server/integrations && npm install
cp ../../.env.example ../../.env   # fill in keys
npm run smoke                      # one OK/FAIL/SKIP line per function
```
Import from the agent loop: `import { factCheck } from './integrations/senso.ts'` (run with tsx).
