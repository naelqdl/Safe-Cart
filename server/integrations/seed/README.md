# server/integrations/seed (T14, owner hz)
Seeds Senso's KB from `data/kb/**` (T13, owner ch) and runs the gate test.
Design per D1#Red-team #4 + cc25: **every doc version is its own Senso doc** (SPD v1 and v2 both pre-ingested).
The agent pins one SPD by contentId; switching on stage is instant, no live upload or re-ingest.

## Layout contract for `data/kb/**` (ch)
One `.md` or `.txt` file per document version, with optional frontmatter:
```markdown
---
doc: spd            # stable id; versions of one doc share it (default: filename minus -vN)
version: 2          # integer (default: -vN filename suffix, else 1)
title: Health Care FSA Summary Plan Description   # same title for every version (Senso gets "… (version N)")
source: https://…   # 1-line source note; shown in Senso + the trail
---
<body text>   # SPD must state the carryover as one dollar amount in a sentence with "carry over"
```
Example: `data/kb/spd-v1.md`, `data/kb/spd-v2.md`, `data/kb/irs-pub-502.md`, `data/kb/cares-act-otc.md`.
Until `data/kb` exists, the seeder uses the **placeholder** files in `fixtures/kb/`.

## Run (needs `SENSO_API_KEY` with KB scope in the repo-root `.env`)
```bash
cd server/integrations
npm run seed   # ingest every doc and every version (idempotent); active SPD defaults to v1
npm run gate   # carryover: SPD v1 = $680, v2 = $500 (pinned search) · evals: multivitamin=conflict, ibuprofen=verified, toothpaste=conflict
```
Flags: `--fixtures`, `--dir <path>`, `--dry-run` (seed) · `--author organization|ai_assistant`, `--claims <file>` (gate).

## For cc (agent loop): `server/integrations/spd.ts`
- `activeSpd()` → `{version, title, contentId, nodeId, sensoVersionId, source}` of the pinned SPD.
- `setActiveSpd(v)` → the `POST /demo/plan {version}` handler. Instant; throws if v is not seeded.
- `readCarryover()` → `{usd, spdVersion, contentId, versionId, quote, passage, latencyMs}`: Senso search scoped to the active SPD's contentId + deterministic regex parse. Throws unless exactly one amount is found (never guesses).
- **Never fact-check the carryover claim with evals**: evals can't be scoped and see every SPD version. Evals are for item eligibility (IRS/CARES), which is the same in every version.
- Evals use `author: 'organization'`: in `ai_assistant` mode, general eligibility claims come back `not_verifiable`.
- `seed/.senso-manifest.json` (gitignored) holds the ids for this Senso org and the active version per doc.
