# Phase 1: UI Skeleton -- Context

## Phase Goal
An idea-agnostic, runnable shopping-agent UI skeleton with a mock agent behind a stable event contract, so the team can re-skin it and plug in the real agent in minutes. 5-hour hackathon; idea and sponsors TBD.

## Requirements Covered
| ID | Plan(s) |
|----|---------|
| SKEL-01 | 01, 04 |
| SKEL-02 | 01, 03, 04 |
| SKEL-03 | 01 |
| SKEL-04 | 02 |
| SKEL-05 | 03, 04 |
| SKEL-06 | 02, 03 |
| SKEL-07 | 03 |
| SKEL-08 | 04 |

## What Already Exists (from prior phases)
Nothing. Greenfield repo (one initial commit). Tooling verified 2026-11-20: Node v24.22.0, npm 11.19.1; npm latest: create-next-app 16.4.6, shadcn 4.23.0, next 16.4.6, tailwindcss 4.3.5.

## Key Design Decisions
- Architecture proposals: skipped by user.
- Spec pipeline: run by user choice → .planning/specs/01-ui-skeleton-spec.md is the source of truth for contracts, file placement, flows, failure modes and acceptance checks.
- App lives in `web/` (create-next-app rejects non-empty dirs; leaves room for a backend folder).
- UI ↔ agent: POST + NDJSON stream of AgentEvent; backend swap via `AGENT_BACKEND_URL`; mock is default and fallback.
- shadcn base-nova preset (Base UI primitives: `render` prop, not `asChild`).
- Mock triggers: query containing "fail" → agent error event; query containing "decline" → action ok:false.
- Self-check: `npm run check:agent` (Node type stripping, no test framework). Smoke: `npm run smoke` against a running server.

## Plan Structure
| Plan | Wave | Name | Agents | Depends on |
|------|------|------|--------|-----------|
| 01-01 | 1 | Scaffold, config and contract | engineering-rapid-prototyper | — |
| 01-02 | 2 | Agent seam (mock, reducer, routes, hook) | engineering-senior-developer | 01-01 |
| 01-03 | 2 | Panels (presentational UI) | engineering-frontend-developer, design-ui-designer | 01-01 |
| 01-04 | 3 | Integration, docs and QA | engineering-frontend-developer, testing-qa-verification-specialist | 01-02, 01-03 |
