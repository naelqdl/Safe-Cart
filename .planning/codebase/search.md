# Codebase Map Search Protocol

Artifacts: `.planning/CODEBASE.md`, `.planning/codebase/index.jsonl`, `.planning/codebase/symbols.json`, `.planning/config/directory-mappings.yaml`.

## Query planning
Split the query into: terms (features, tech), path hints, symbol hints (functions, components, routes), domain hints (autopilot, approvals, k-trail, chat, desktop).

## Retrieval order
1. Path hints in index.jsonl and symbols.json.
2. Symbol hints in symbols.json (`symbols`, `routes`, `modules`).
3. Terms/aliases in index.jsonl `keywords`/`aliases`/`summary`.
4. CODEBASE.md headings for architecture context.
5. **Read the original source files** for the top matches before planning, reviewing or editing. Summaries are not source of truth.

Rank: exact path/symbol > keyword overlap > same domain > risk/fan-in. Return ≤5 chunks and ≤5 read-next paths.

## Example: `/legion:map --query "autopilot tick loop"`

| Rank | Chunk | Path | Lines | Kind | Why it matched |
|------|-------|------|-------|------|----------------|
| 1 | map:web-src-hooks-use-autopilot-ts:001 | web/src/hooks/use-autopilot.ts | 1-219 | module | keywords autopilot, loop |
| 2 | map:web-src-app-api-agent-tick-route-ts:001 | web/src/app/api/agent/tick/route.ts | 1-87 | route | keyword tick |
| 3 | map:web-src-lib-agent-mock-ts:001 | web/src/lib/agent/mock.ts | 1-153 | module | related file of tick route |

### Read Next
- `web/src/hooks/use-autopilot.ts` lines 1-219
- `web/src/app/api/agent/tick/route.ts` lines 1-87

## Safety
- Check freshness (`/legion:map --check`) before citing; current source wins over the map.
- Don't load the whole index into a prompt; query it.
