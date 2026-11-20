# Codebase Map

**Analyzed:** 2026-11-20
**Generated At:** 2026-11-20T20:10:58Z
**Map Schema Version:** 2.0
**Analyzed Commit:** 722dd20bfc7be8ca764ceef63698683cfe5bccdb (working tree dirty: T05 K-trail run view uncommitted)
**Source File Count:** 47
**Source Fingerprint:** sha1:25ab5c32ac99389b
**Scope:** project-root
**Root:** C:/Users/Nael/Documents/Hackathons/AWS
**Confidence:** HIGH

```yaml
map_schema_version: "2.0"
generated_at: "2026-11-20T20:10:58Z"
analyzed_commit: "722dd20bfc7be8ca764ceef63698683cfe5bccdb"
source_file_count: 47
source_fingerprint: "sha1:25ab5c32ac99389b"
source_fingerprint_kind: hash
scope: "project-root"
```

## Architecture Overview

A single Next.js 16 (App Router) + React 19 + TypeScript app in `web/`, styled with Tailwind v4 and shadcn/ui on Base UI. It is the front end of an autonomous shopping agent built at the Personal Agents Hackathon (AWS Builder Loft, 2026-11-20). There is no real agent yet: three Next route handlers (`/api/agent/tick`, `/api/action`, `/api/chat`) validate input and either proxy to `AGENT_BACKEND_URL` or run a deterministic mock agent in `src/lib/agent/`.

The client "Autopilot" (`use-autopilot.ts`) calls `/api/agent/tick` every `checkIntervalSeconds`, reads the NDJSON `AgentEvent` stream and reduces it into `DashboardState` (`reduce.ts`). Purchases under `guardrails.autoBuyLimit` become receipts; above it they become approvals that the user approves through `/api/action`. A second contract, the team's **K-trail** `Run` (`trail.ts`, owned by agent cc), is rendered by `run-view.tsx` as a timeline + claims + decision + receipt; the mock builds a minimal Run per auto-buy and two demo Runs live in `src/mock/`.

An Electron shell (`electron/main.cjs`) wraps the same app for a desktop/compact view. Persistence is none: state lives in the browser tab (Autopilot on/off in localStorage).

## Language Distribution

| Extension | File Count | % of Codebase |
|-----------|-----------|---------------|
| .tsx | 25 | 53% |
| .ts | 13 | 28% |
| .json | 2 | 4% |
| .css | 1 | 2% |
| .mjs | 1 | 2% |
| .cjs | 1 | 2% |
| .sh | 1 | 2% |
| other (ico) | 1 | 2% |

## Detected Stack

| Layer | Technology | Evidence |
|-------|-----------|----------|
| Runtime | Node.js ≥20.9 (tested 24) | README |
| Framework | Next.js 16.4.6 App Router | web/package.json |
| UI | React 19.3, shadcn/ui on @base-ui/react, lucide-react | package.json, components.json |
| Styling | Tailwind CSS 4.3 | package.json, globals.css |
| Language | TypeScript 5 | tsconfig.json |
| Desktop | Electron 45 | package.json "desktop" script |
| Test | assert-based node check + bash/curl smoke | reduce.check.mjs, scripts/smoke.sh |
| Architecture | Single app, layered: routes → lib/agent → hooks → components | directory structure |

## Conventions Detected

- **File naming**: kebab-case files, PascalCase React components, `use-*.ts` hooks
- **Module structure**: `src/app` (routes), `src/components` (+ `ui/` shadcn primitives), `src/hooks`, `src/lib/agent` (contracts, mock, reducer), `src/config`
- **Config location**: `src/config/app.config.ts` (branding, guardrails, missions, sponsors); `.env.local` for `AGENT_BACKEND_URL`
- **Test approach**: no framework; `npm run check:agent` + `npm run smoke`
- **Import style**: `@/` alias to `src/`
- **Linting/formatting**: ESLint 9 + eslint-config-next
- **Comments**: `shortcut:` comments mark known limits

## Entry Points

| Type | Path | Evidence |
|------|------|----------|
| Web page | web/src/app/page.tsx | Next App Router |
| API | web/src/app/api/*/route.ts | Next route handlers |
| Desktop | web/electron/main.cjs | package.json main + "desktop" |

## Functionality Inventory

| Capability | Primary Files | Summary | Confidence |
|------------|---------------|---------|------------|
| Autopilot loop | hooks/use-autopilot.ts, api/agent/tick/route.ts | Timed checks of watched missions, streamed events | HIGH |
| Guardrails | config/app.config.ts, lib/agent/mock.ts | Auto-buy under limit, approval above, daily budget | HIGH |
| Missions (watch list) | components/missions-panel.tsx | Add/watch items with max price — base for wishlist | HIGH |
| Approvals | components/approvals-panel.tsx, api/action/route.ts | Human approves over-limit buys | HIGH |
| Receipts + audit trail | receipts-panel.tsx, audit-trail.tsx | Step log with JSON export | HIGH |
| K-trail run view | lib/agent/trail.ts, components/run-view.tsx, runs-panel.tsx | Claims/trust/verdict/decision/receipt, injection banner | HIGH |
| Chat | hooks/use-chat.ts, api/chat/route.ts, chat-mock.ts | Natural-language commands → add_mission etc. | HIGH |
| Desktop shell | electron/main.cjs, compact-view.tsx | Electron window + compact layout | MEDIUM |

## Module Ownership

| Area | Paths | Responsibilities | Downstream Consumers |
|------|-------|------------------|----------------------|
| UI + seam (team agent nc) | web/** | Dashboard, routes, mock agent | judges/demo |
| Agent contracts | web/src/lib/agent/types.ts, trail.ts | Event + Run shapes (trail.ts owned by cc) | routes, reducer, run-view, backend |
| Agent backend (cc, T04) | server/** (not yet in repo) | Real /tick, /action | web routes via AGENT_BACKEND_URL |
| Merchant sandbox (ag, T06) | merchant/** (not yet in repo) | Adversarial store | backend |

## Risk Areas

| Area | Risk Level | Why | Recommendation |
|------|-----------|-----|----------------|
| Two event contracts (types.ts vs trail.ts) | MEDIUM | Dashboard events and K-trail Runs can drift | Backend should emit AgentEvents that carry a `run` (K-trail) payload; change types additively |
| use-autopilot.ts | MEDIUM | 219 lines, timers + abort + localStorage; fan-in hub | Touch carefully; keep loop in one place |
| No persistence | MEDIUM | Reload loses missions, receipts | Add a store (SingleStore) server-side |
| Uncommitted T05 work | MEDIUM | run-view/trail files untracked | Commit before parallel branches start |

## Technical Debt Signals

- **TODO/FIXME count**: 0 markers
- **Large files (>500 lines)**: none (largest: run-view.tsx 206, use-autopilot.ts 219)
- **Files without tests**: all components; only reducer and HTTP seam are checked
- **Git hotspots**: web/package.json (4), web/src/app/page.tsx (3), web/src/lib/agent/types.ts (2)
- **Shortcuts**: spentToday counts every receipt as today (use-autopilot.ts)

## Dependency Risk

**Ecosystem**: Node.js (npm)
**Direct dependencies**: 17 | **Outdated**: 7 (41%)

### Outdated Packages
| Package | Current | Latest | Severity |
|---------|---------|--------|----------|
| typescript | 5.9.3 | 7.0.2 | major |
| eslint | 9.39.5 | 10.15.0 | major |
| @types/node | 20.19.43 | 26.6.6 | major (intentional: matches Node 20 floor) |
| tailwindcss | 4.3.3 | 4.3.5 | patch |
| @tailwindcss/turbopack | 4.3.3 | 4.3.5 | patch |
| react | 19.3.0 | 19.3.1 | patch |
| react-dom | 19.3.0 | 19.3.1 | patch |

### Heavy Dependencies
**Transitive count**: not measured (electron + next dominate) -- LOW for a hackathon app

### Potentially Unmaintained
_None detected_ (`cn` 0.5.2 is unused-looking; `src/lib/utils.ts` provides cn)

### Dependency Risk Summary
| Metric | Value | Risk Level |
|--------|-------|-----------|
| Outdated packages | 7/17 (41%) | LOW (all within wanted ranges; no upgrade needed today) |
| Major version behind | 3 packages | LOW |
| Heavy dependencies | electron | LOW |
| Potentially unmaintained | 0 | LOW |

## Agent Guidance

- **Preferred**: add backend logic behind `AGENT_BACKEND_URL` or new route handlers; extend `types.ts`/`trail.ts` additively; reuse shadcn `ui/` primitives; put copy and guardrails in `app.config.ts`; keep the mock working as the demo fallback.
- **Avoid**: renaming K-trail fields (cc owns them); secrets in client code (`NEXT_PUBLIC_*` only for public keys); new UI libraries; filenames differing only by case (team rule P8).
- **Touch with care**: `use-autopilot.ts`, `reduce.ts` (run `npm run check:agent`), `api/agent/tick/route.ts` (smoke test depends on it).

## Dependency Graph

- page.tsx → dashboard.tsx → {use-autopilot, use-chat, use-compact, all panels}
- use-autopilot.ts → {reduce.ts, ndjson.ts, trail-demo.ts, app.config.ts, types.ts}
- api/agent/tick/route.ts → mock.ts → {types.ts, trail.ts}
- run-view.tsx → trail.ts, format.ts, ui/*
- **High fan-in**: types.ts (~15 importers), ui/card.tsx, ui/badge.tsx, app.config.ts, format.ts

## Test Coverage Map

**Test convention**: assert-based script + HTTP smoke
**Coverage**: ~10% — LOW
**Source**: Estimated from test file matching

### Files Without Tests
| Source File | Lines | Risk Note |
|-------------|-------|-----------|
| hooks/use-autopilot.ts | 219 | Hub of the loop |
| components/run-view.tsx | 206 | Demo-critical render |
| lib/agent/mock.ts | 153 | Covered indirectly by smoke |

### Critical Untested Files
| File | Lines | Fan-in | Risk Score | Risk Level | Recommendation |
|------|-------|--------|-----------|-----------|----------------|
| hooks/use-autopilot.ts | 219 | 3 | 6 | MEDIUM | Manual demo-path QA |
| components/run-view.tsx | 206 | 2 | 5 | MEDIUM | Render both demo Runs before demo |

## API Surface

| Method | Path | Body | Response | Handler |
|--------|------|------|----------|---------|
| POST | /api/agent/tick | TickRequest {tick, missions[], guardrails, spentToday} | NDJSON AgentEvent stream ending in done/error | web/src/app/api/agent/tick/route.ts |
| POST | /api/action | {candidateId, query} | ActionResult | web/src/app/api/action/route.ts |
| POST | /api/chat | {message, context} | {reply, actions[]} | web/src/app/api/chat/route.ts |

Upstream (when `AGENT_BACKEND_URL` is set): `POST {url}/tick`, `{url}/action`, `{url}/chat`.

## Config & Environment

| Name | Where | Purpose |
|------|-------|---------|
| AGENT_BACKEND_URL | web/.env.local (example in web/.env.example) | Proxy target; empty = mock |
| DESKTOP_PORT, DESKTOP_URL, DESKTOP_TEST_COMPACT | electron/main.cjs | Desktop shell |
| appConfig | web/src/config/app.config.ts | name, tagline, currency, checkIntervalSeconds, guardrails, missions, sponsors, showDemoRuns |

No secrets in the repo. `.env*` is git-ignored except `.env.example`.

## Setup / Runbook

| Task | Command or File | Notes |
|------|-----------------|-------|
| Install dependencies | `cd web && npm install` | npm 11.19 rejects `allow-scripts=` in ~/.npmrc |
| Run app | `npm run dev` → http://localhost:3000 | |
| Desktop | `npm run desktop` | Electron |
| Lint / types | `npm run lint`, `npx tsc --noEmit` | |
| Tests | `npm run check:agent`, `npm run smoke` (server running) | |
| Build | `npm run build` | |

## Pattern Library

1. **Proxy-or-mock route**: validate body → if `AGENT_BACKEND_URL` proxy → else mock. Canonical: `api/agent/tick/route.ts`.
2. **NDJSON event stream + pure reducer**: server yields `AgentEvent`s; client `readNdjson` → `applyEvent`. Canonical: `ndjson.ts`, `reduce.ts`.
3. **Upsert by id**: step/candidate events are re-sent with the same id to change status.
4. **Config-driven copy**: all user-facing strings and guardrails in `app.config.ts`.
5. **Panel components**: one Card per concern, props-only, state in `useAutopilot`.

## Directory Mappings

| Category | Primary Location | Priority | Pattern |
|----------|-----------------|----------|---------|
| routes | web/src/app/api | explicit | **/route.ts |
| components | web/src/components | explicit | *.tsx |
| ui primitives | web/src/components/ui | explicit | *.tsx (shadcn) |
| hooks | web/src/hooks | explicit | use-*.ts |
| agent logic / contracts | web/src/lib/agent | explicit | *.ts |
| config | web/src/config | explicit | *.config.ts |
| mock data | web/src/mock | inferred | *.json |
| tests | web/src/lib/agent, web/scripts | inferred | *.check.mjs, smoke.sh |

### Path Enforcement Rules
- **Strictness**: warn
- New files should follow these mappings where applicable
- Exceptions require explicit override

## Retrieval Artifacts

- **Index**: `.planning/codebase/index.jsonl`
- **Symbols**: `.planning/codebase/symbols.json`
- **Search protocol**: `.planning/codebase/search.md`
