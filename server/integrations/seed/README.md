# server/integrations/seed (owner hz)

## SafeCart (D2, S-H3): recall notices into Senso
```bash
cd server/integrations
npx tsx seed/seed-senso.ts            # data/recalls/*.json (REAL CPSC only) + data/kb/*.txt → Senso; idempotent
npx tsx senso-gate.smoke.ts           # recallFactCheck on a recalled + a clean model, both author modes
```
- Recall JSON (ch, S-J1): camelCase (`recallId, title, brands[], models[], upcs[], hazard, remedy, url, publishedAt`) or CPSC API PascalCase (`RecallID, Title, Products[].Model, Manufacturers, Hazards, Remedies, URL`); both parse. `recallId`, `title`, `url` are required.
- Stored text: `CPSC Recall <id>: <title>. Brands … Models … Hazard … Remedy … Source: <url>`.
- Content ids → `seed/.senso-manifest.json`; `recallContentId(recallId)` reads one. Also written to SingleStore `recalls.senso_content_id` once ch's `singlestore.ts` is merged and `S2_URL` is set (best effort, never fails the seed).
- For cc: `recallFactCheck(brand, model)` in `../senso-gate.ts` → `{verdict, recalled, passages, quote, runId, author, claim, latencyMs}`. `conflict` = recalled. `unsupported`/`not_verifiable` = no notice in Senso, which is not proof of safety alone: combine with CPSC + SingleStore for `SafetyCheck.status`. Default author `organization` (`ai_assistant` returns not_verifiable for third-party brands); override with `SENSO_GATE_AUTHOR`.

---
# D1 (superseded): T14 SPD seeding
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
