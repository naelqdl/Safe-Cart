# server/integrations/seed (T14, owner hz)
Seeds Senso's KB from `data/kb/**` (T13, owner ch) and runs the evals gate.

## Layout contract for `data/kb/**` (ch)
One `.md` or `.txt` file per document version, with optional frontmatter:
```markdown
---
doc: spd            # stable id; versions of one doc share it (default: filename minus -vN)
version: 2          # integer (default: -vN filename suffix, else 1)
title: Health Care FSA Summary Plan Description   # same title for every version of a doc
source: https://…   # 1-line source note; shown in Senso + the trail
---
<body text>
```
Example: `data/kb/spd-v1.md`, `data/kb/spd-v2.md`, `data/kb/irs-pub-502.md`, `data/kb/cares-act-otc.md`.
Until `data/kb` exists, the seeder uses the **placeholder** files in `fixtures/kb/`.

## Run (needs `SENSO_API_KEY` with KB scope in the repo-root `.env`)
```bash
npx tsx server/integrations/seed/seed.ts                 # all docs at their lowest version (demo start: SPD v1)
npx tsx server/integrations/seed/gate.ts                 # 3 claims; expects carryover=verified, multivitamin=conflict, ibuprofen=verified
npx tsx server/integrations/seed/seed.ts --version spd=2 # live twist: SPD v2 saved as a NEW SENSO VERSION of the same doc
npx tsx server/integrations/seed/gate.ts                 # now expects carryover=conflict
```
Flags: `--fixtures`, `--dir <path>`, `--dry-run` (seed) · `--author organization|ai_assistant`, `--claims <file>` (gate).

## For cc (agent loop)
- `setDocVersion('spd', 2)` → the `POST /demo/plan {version}` handler. Same node/content id, new Senso version.
- `liveContentIds()` → `{spd: contentId, …}` to scope `searchContext({contentIds})`; `readManifest()` → live version per doc.
- Gate uses `author: 'organization'`: Senso's `ai_assistant` mode only checks claims tied to our org, so general eligibility claims come back `not_verifiable`.
- `.senso-manifest.json` (gitignored) records what is live in this Senso org.
