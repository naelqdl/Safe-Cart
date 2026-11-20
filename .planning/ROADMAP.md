# Roadmap

## Progress
| Phase | Name | Status | Plans | Completed |
|-------|------|--------|-------|-----------|
| 1 | UI Skeleton | Complete | 4 | 4 |
| 2 | Idea lock-in + real agent backend | Pending | 0 | 0 |
| 3 | Demo polish, sponsors, pitch | Pending | 0 | 0 |

## Phase Details

### Phase 1: UI Skeleton
**Goal:** An idea-agnostic, runnable shopping-agent UI skeleton with a mock agent behind a stable event contract, so the team can re-skin it and plug in the real agent in minutes.
**Requirements:** SKEL-01, SKEL-02, SKEL-03, SKEL-04, SKEL-05, SKEL-06, SKEL-07, SKEL-08
**Depends on:** none
**Complexity:** high
**Success Criteria:**
1. `cd web && npm run build` exits 0 and `npm run lint` exits 0.
2. With the production server running, `POST /api/agent` streams NDJSON ending in `{"type":"done"}`; a query containing "fail" ends in an `error` event.
3. `/` renders the app name from app.config.ts and the three panels in their empty states.
4. A full mock run shows steps, candidates (selected + rejected with reasons), a decision, an approve dialog, a mock receipt, and a downloadable audit JSON.

### Phase 2: Idea lock-in + real agent backend
**Goal:** Pick the idea and implement a real agent that emits the Phase 1 event contract from reliable sources. (Plan after idea + sponsors are known.)

### Phase 3: Demo polish, sponsors, pitch
**Goal:** Sponsor branding, design polish, demo script, fallback video, deck.
