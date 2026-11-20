# Plan 01-04 Summary: Integration, docs and QA

Status: Complete (agent reported Partial for one out-of-scope bug; coordinator fixed it — see below)
Agents: engineering-frontend-developer, testing-qa-verification-specialist
Wave: 3
Requirements: SKEL-01, SKEL-02, SKEL-05, SKEL-08

## Files
- web/src/components/agent-workspace.tsx (new), web/src/app/page.tsx (replaced)
- README.md (new, 93 lines), web/.env.example (new), web/.gitignore (+ !.env.example)
- web/scripts/smoke.sh (new), web/package.json (+ "smoke")
- qa/01-empty.png, 02-done.png, 03-receipt.png, 04-mobile.png, 05-font-fixed.png

## QA results
| Check | Result |
|---|---|
| tsc / lint / check:agent / build | PASS |
| Name only in config (grep) | PASS |
| README greps; .env.example not ignored; bash -n smoke.sh | PASS |
| smoke.sh vs production server :3123 | PASS (agent, and re-run by coordinator after the font fix) |
| Screenshots empty / done / receipt / mobile 390px (no overflow) | PASS |
| Browser console errors | none |
| Extra: "please fail" → Run stopped alert; "decline" → Action failed + Retry | PASS |
| Timeline icon offset and audit scroll height (Plan 03 items) | PASS |

## Bug found and fixed (routed to coordinator; file owned by Plan 01)
- Body rendered in Times New Roman: `web/src/app/globals.css` had a self-referencing `--font-sans: var(--font-sans)` from the shadcn init.
- Fix: `--font-sans: var(--font-geist-sans)`. Verified: computed body font `Geist, "Geist Fallback"` (qa/05-font-fixed.png); build + lint + smoke pass.

## Decisions
- Exact plan layout classes kept; Request/Audit cards stretch to row height on desktop (cosmetic whitespace, Phase 3 polish).
- README adds Troubleshooting for EALLOWSCRIPTS and `npm run smoke -- <url>`.
- gstack browse preamble prompts (upgrade, CLAUDE.md routing) skipped by the worker.

## Not checked
- Contents of a downloaded Export JSON file were not opened.
