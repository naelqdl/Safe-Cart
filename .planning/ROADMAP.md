# Roadmap

## Progress
| Phase | Name | Status | Plans | Completed |
|-------|------|--------|-------|-----------|
| 1 | UI Skeleton | Complete | 4 | 4 |
| 2 | SafeCart build (idea + real agent backend) | Planned | 5 | 0 |
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

### Phase 2: SafeCart build (idea + real agent backend)
**Goal:** SafeCart: a shopping agent with preference/wishlist/owned-item memory that buys on sale autonomously and never buys a recalled product, filing refunds and buying safe replacements for recalled owned items. Golden path by 14:45 PT.
**Requirements:** SC-01 … SC-09
**Plans:** 5 across 3 waves (.planning/phases/02-safecart-build/); per-human briefs in plans/{nael,hz,jus}.md
**Success Criteria:**
1. A recalled wishlist item on sale is skipped and a safe alternative bought (Stripe TEST), with CPSC + Senso citations in the trail.
2. A newly published recall on an owned item files a refund claim and buys a replacement without clicks.
3. Flipping Statsig recall_guard changes behaviour live; Amplitude shows the funnel.
4. Submission (repo, video ≤3 min, sponsor write-up) by 16:30.

### Phase 3: Demo polish, sponsors, pitch
**Goal:** Sponsor branding, design polish, demo script, fallback video, deck.
