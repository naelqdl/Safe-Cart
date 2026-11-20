# Spec: Phase 1 — UI Skeleton

## Overview
Build an idea-agnostic shopping-agent web UI that a 5-hour hackathon team can re-skin and connect to a real
agent quickly. It shows the four things the prompt asks for: a shopping request, decisions backed by cited
sources, a meaningful action the user approves first, and a live, exportable audit trail. A mock agent serves
the same streaming event contract the real backend will use, so the UI works end to end before the idea is chosen
and keeps working if the backend is down during the demo.

## Requirements
| ID | Description | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| SKEL-01 | Runnable Next.js/TS/Tailwind/shadcn app in `web/` | Must | `cd web && npm run build` exit 0; `npm run lint` exit 0 |
| SKEL-02 | One config file re-skins the app | Must | `grep -q "export const appConfig" web/src/config/app.config.ts`; no component hardcodes the app name (`! grep -rn "ShopAgent" web/src/components`) |
| SKEL-03 | One shared typed agent contract | Must | `web/src/lib/agent/types.ts` exports AgentEvent, AuditStep, Candidate, Decision, AgentRequest, ActionRequest, ActionResult, RunState, ActionState; `npx tsc --noEmit` exit 0 |
| SKEL-04 | Agent + action API routes, mock by default, proxy via env | Must | curl POST /api/agent → NDJSON with last line `{"type":"done"}`; query containing "fail" → last line type "error"; empty query → HTTP 400; POST /api/action → JSON with `ok` and `reference` |
| SKEL-05 | Single-screen 3-panel workspace + header with sponsor strip | Must | GET / HTML contains appConfig.name and the panel headings "Request", "Candidates", "Audit trail" |
| SKEL-06 | Explicit empty/running/error/done + action confirm/pending/success/error states | Must | Each component source contains a branch for each state (see Acceptance Checks); manual run in QA |
| SKEL-07 | Audit JSON export | Should | audit-trail.tsx contains `application/json` Blob download with filename `audit-` prefix |
| SKEL-08 | Root README with run steps, customize table, backend contract | Must | `grep -q "Customize in 5 minutes" README.md` and `grep -q "AGENT_BACKEND_URL" README.md` |

## Architecture
```
web/src/config/app.config.ts      ← team edits copy/branding/sponsors here
web/src/lib/agent/types.ts        ← THE contract (UI ↔ backend)
web/src/lib/agent/mock.ts         ← mock agent (async generator of AgentEvent)
web/src/lib/agent/reduce.ts       ← pure applyEvent(state, event) → state
web/src/app/api/agent/route.ts    ← POST: validate → proxy to AGENT_BACKEND_URL/agent or stream mock, NDJSON
web/src/app/api/action/route.ts   ← POST: validate → proxy to AGENT_BACKEND_URL/action or mock receipt
web/src/hooks/use-agent-run.ts    ← client: fetch + NDJSON stream reader + reduce + action state
web/src/components/agent-workspace.tsx  ← 'use client' composition: hook → presentational panels
web/src/components/{app-header,request-panel,candidates-panel,decision-card,audit-trail}.tsx ← props-only UI
web/src/app/page.tsx              ← server component rendering <AgentWorkspace/>
```
Presentational components take props only and import types from `@/lib/agent/types`. They never fetch, so the
team can restyle or swap panels without touching data flow, and the panel plan can run in parallel with the
agent-seam plan.

### Key Decisions
| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| App location | `web/` subfolder | create-next-app refuses a non-empty dir (repo already has .git and .planning); leaves room for a teammate's `agent/` backend in any language | Repo root (blocked by non-empty dir); temp-dir-then-move (fragile on Windows) |
| UI ↔ agent transport | HTTP POST returning NDJSON stream | Streams steps live (the audit trail is the demo); any backend language can emit newline-delimited JSON; easy to curl | SSE (needs GET or custom parsing, no advantage); WebSocket (overkill); Vercel AI SDK UI stream (ties backend to JS SDK before the idea/sponsor is known) |
| Backend swap | `AGENT_BACKEND_URL` env → routes proxy `/agent` and `/action` | Zero UI changes to go live; mock remains the fallback if the backend fails mid-demo (unset the env var) | Hardcoded client URL (CORS + secrets exposure); feature flag lib (unneeded dependency) |
| State management | Pure `applyEvent` reducer + one hook, no state library | Testable without React; ~60 lines; no dependency | Zustand/Redux (dependency for one screen) |
| Event upsert | step and candidate events upsert by `id` | Lets the agent show a step as `running` then update it to `ok`/`fail`, and flip a candidate's verdict after comparison | Append-only (duplicates in UI) |
| Action is audited | ActionResult carries an AuditStep appended to the trail | The meaningful action itself appears in the audit trail and the export | Separate receipt only (loses audit continuity) |
| Human approval | Confirm dialog before the action | The prompt asks for a meaningful action; judges reward visible user control | One-click act (riskier story) |
| UI kit | shadcn/ui via `shadcn@4.23.0 init --defaults` (base-nova preset, Base UI primitives) | Hackathon playbook mandates shadcn; defaults are non-interactive | Radix base (non-default flag; no benefit now) |
| Versions | Pin `create-next-app@16.4.6`, `shadcn@4.23.0` (npm latest on 2026-11-20) | Reproducible scaffold for every teammate | `@latest` (may drift mid-hackathon) |
| Theming | shadcn CSS variables in `globals.css`; rebrand by editing `--primary` (light + dark) | One place, no custom CSS | Per-component colors (scattered) |
| Self-check | `reduce.check.mjs` run with Node 24 type stripping via `npm run check:agent` | The reducer is the only non-trivial logic; no test framework needed | Vitest/Jest (dependency + config for one file) |

## API and Type Contracts
`web/src/lib/agent/types.ts` (exact):
```ts
export type StepKind = "plan" | "search" | "fetch" | "compare" | "decide" | "act";
export type StepStatus = "running" | "ok" | "warn" | "fail";
export interface SourceRef { label: string; url?: string }
export interface AuditStep {
  id: string; at: string /* ISO 8601 */; kind: StepKind; title: string;
  detail?: string; sources?: SourceRef[]; status: StepStatus;
}
export type Verdict = "considering" | "selected" | "rejected";
export interface Candidate {
  id: string; title: string; vendor: string; price: number; currency: string;
  url?: string; imageUrl?: string; attributes: Record<string, string>;
  verdict: Verdict; reason?: string;
}
export interface Decision { candidateId: string; summary: string; actionLabel?: string }
export interface AgentRequest { query: string }
export type AgentEvent =
  | { type: "step"; step: AuditStep }            // upsert by step.id
  | { type: "candidate"; candidate: Candidate }  // upsert by candidate.id
  | { type: "decision"; decision: Decision }
  | { type: "error"; message: string }
  | { type: "done" };
export interface ActionRequest { candidateId: string; query: string }
export interface ActionResult { ok: boolean; reference?: string; message: string; step: AuditStep }
export type RunStatus = "idle" | "running" | "done" | "error";
export interface RunState {
  status: RunStatus; query: string; startedAt?: string;
  events: AgentEvent[]; steps: AuditStep[]; candidates: Candidate[];
  decision?: Decision; error?: string;
}
export type ActionState =
  | { status: "idle" } | { status: "pending" }
  | { status: "success"; result: ActionResult } | { status: "error"; message: string };
export const initialRunState: RunState = { status: "idle", query: "", events: [], steps: [], candidates: [] };
```

HTTP:
- `POST /api/agent` body `AgentRequest`. `query` must be a non-empty trimmed string ≤ 2000 chars, else
  `400 {"error": string}`. Success: `200`, `content-type: application/x-ndjson`, one AgentEvent JSON per line.
  The stream ends with exactly one terminal event, `done` or `error`.
- `POST /api/action` body `ActionRequest`. Both fields must be non-empty strings, else 400. Success: `200` ActionResult JSON.
- When `process.env.AGENT_BACKEND_URL` is set (no trailing slash), the routes forward the validated body with
  `fetch(AGENT_BACKEND_URL + "/agent")` / `"/action"` (POST, JSON) and return the upstream body and status. If the upstream request throws, the
  agent route returns `502 {"error":"Agent backend unreachable"}` and the action route returns the same 502 JSON.
- Mock contract: `runMockAgent(req: AgentRequest): AsyncGenerator<AgentEvent>` and
  `runMockAction(req: ActionRequest): ActionResult` in `web/src/lib/agent/mock.ts`.
- Reducer: `applyEvent(state: RunState, event: AgentEvent): RunState` in `web/src/lib/agent/reduce.ts`;
  it only uses `import type` from "./types" so Node can run it with type stripping.
- Hook: `useAgentRun(): { state: RunState; action: ActionState; run(query: string): void; reset(): void; approve(): void }`
  in `web/src/hooks/use-agent-run.ts`.
- Config: `export const appConfig = { name, tagline, requestLabel, requestPlaceholder, examplePrompts: string[],
  actionLabel, currency, sponsors: Sponsor[], footerNote }` with `export interface Sponsor { name: string; url?: string; logo?: string /* path under /public */ }`.

## File Placement
| Artifact | Path | Placement Rationale | Existing Pattern |
|----------|------|---------------------|------------------|
| Next app | `web/` | See Key Decisions | create-next-app `--src-dir` layout |
| Config | `web/src/config/app.config.ts` | One obvious place for non-devs on the team | — |
| Contract/mock/reducer | `web/src/lib/agent/` | Shared by server routes and client | shadcn `src/lib/utils.ts` |
| Self-check | `web/src/lib/agent/reduce.check.mjs` | Next to the code it checks; `.mjs` so the Next type-check ignores it | — |
| API routes | `web/src/app/api/{agent,action}/route.ts` | App Router route handlers | Next App Router |
| Hook | `web/src/hooks/use-agent-run.ts` | shadcn alias `@/hooks` | components.json aliases |
| Panels | `web/src/components/*.tsx` | Next to `components/ui` | shadcn |
| Sponsor logos | `web/public/sponsors/` | Served statically | Next public dir |
| Env example | `web/.env.example` | Next loads env from the app dir | Next |
| README | `README.md` (repo root) | First thing teammates and judges open | — |

## Data and Control Flow
1. User types or clicks an example prompt in RequestPanel → `run(query)`.
2. Hook aborts any in-flight run (AbortController), sets state to `{...initialRunState, status:"running", query, startedAt}`, POSTs `/api/agent`.
3. Route validates → proxies upstream or wraps `runMockAgent` in a `ReadableStream` that encodes each event as `JSON.stringify(e)+"\n"`.
4. Hook reads the body with `getReader()` + `TextDecoder`, buffers partial lines, `JSON.parse`s each complete line, and dispatches `applyEvent`.
5. applyEvent: always append to `events`; step/candidate upsert by id; decision sets `decision`; error sets status "error" + error; done sets status "done".
6. Panels re-render from `state`. DecisionCard appears when `state.decision` exists and status is "done".
7. User clicks the action button → confirm Dialog → `approve()` → action "pending" → POST `/api/action` {candidateId, query} → success: action = success, and `result.step` is applied as a step event (so it shows in the trail and the export); failure → action error with a Retry button.
8. AuditTrail "Export JSON" builds `{ query, startedAt, exportedAt, events, action }` and downloads `audit-<ISO timestamp with : replaced by ->.json`.

## Compatibility Constraints
- Node ≥ 20.9 (Next 16); team machines run Node 24 (verified v24.22.0 locally). The `check:agent` script relies on Node ≥ 22.18 type stripping.
- Windows + macOS teammates: npm only, no shell-specific scripts.
- The NDJSON contract is the public interface for the backend team. Additive fields are allowed; renaming or removing fields is a breaking change.
- Base UI primitives (base-nova preset) use a `render` prop rather than Radix `asChild`. Executors must read the generated `web/src/components/ui/*.tsx` before composing Dialog triggers and Button links.
- Next's default `.gitignore` ignores `.env*`, so `web/.gitignore` must add `!.env.example`.

## Failure Modes
| Failure Mode | Expected Behavior | Verification |
|--------------|-------------------|--------------|
| Empty/oversized query | 400 JSON; UI Run button disabled for empty input | curl with `{"query":""}` → 400 |
| Malformed JSON body | 400 JSON | curl with body `nope` → 400 |
| Backend unreachable (env set) | 502 JSON; UI shows error state with Retry | code review of try/catch in both routes |
| Mid-stream agent error | `error` event → status error, partial steps stay visible | query "please fail" → last line type error |
| Malformed NDJSON line | Hook sets error "Malformed event from agent" and aborts | reduce.check covers the reducer; hook code review |
| Stream ends without terminal event | Hook sets error "Agent stream ended unexpectedly" | hook code review |
| New run while one is running | Previous fetch aborted, state reset | hook code review (AbortController) |
| Action fails | Action error state with Retry, run state untouched | mock: query containing "decline" → ok:false |
| No sponsors configured | Sponsor strip not rendered | `sponsors: []` default renders nothing |
| Candidate without image/url | Card renders without image/link | props optional |

## Acceptance Checks
| Check | Command or Evidence | Required |
|-------|---------------------|----------|
| Build | `cd web && npm run build` | true |
| Lint | `cd web && npm run lint` | true |
| Types | `cd web && npx tsc --noEmit` | true |
| Reducer self-check | `cd web && npm run check:agent` | true |
| Mock stream | with `npm run start` on :3000: `curl -s -X POST localhost:3000/api/agent -H 'content-type: application/json' -d '{"query":"a usb-c charger"}' \| tail -n1 \| grep -q '"type":"done"'` | true |
| Error stream | same with query "please fail" → `tail -n1 \| grep -q '"type":"error"'` | true |
| Validation | `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/agent -H 'content-type: application/json' -d '{"query":""}'` prints 400 | true |
| Action | `curl -s -X POST localhost:3000/api/action -H 'content-type: application/json' -d '{"candidateId":"c2","query":"x"}' \| grep -q '"reference"'` | true |
| Page | `curl -s localhost:3000/ \| grep -q "<appConfig.name value>"` | true |
| Config-driven name | `! grep -rn "ShopAgent" web/src/components web/src/app` (name lives only in config) | true |
| Visual | /browse or screenshot of a completed mock run | true |

## Deliverables

### Scaffold
- **Path:** `web/` (package.json, tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs, components.json, src/app/{layout.tsx,page.tsx,globals.css}, src/lib/utils.ts, src/components/ui/*, public/*, .gitignore, AGENTS.md, README.md)
- **Purpose:** Runnable base. **Key Content:** shadcn components: button card badge textarea dialog scroll-area separator skeleton alert.
- **Dependencies:** none. **Estimated Size:** generated.

### Config — `web/src/config/app.config.ts` (~40 lines)
Placeholder name "ShopAgent", tagline, request copy, 3 generic example prompts, actionLabel "Place order", currency "USD", `sponsors: []`, footerNote "Demo build: mock agent data until a backend is connected." Each field gets a one-line comment.

### Contract — `web/src/lib/agent/types.ts` (~60 lines)
Exactly as in API and Type Contracts.

### Mock agent — `web/src/lib/agent/mock.ts` (~120 lines)
Generic scenario parameterised by the query: plan → search (source "Mock catalog") → 3 candidates (considering) → fetch specs (step running→ok) → compare (one rejected for price over budget, one rejected for a spec mismatch with warn status, one selected) → decide → decision with summary. 350–700 ms delay between events. If the query includes "fail" (case-insensitive), emit an error event after the search step. Every source label contains "Mock". `runMockAction` returns ok:true with reference `MOCK-` + base36 timestamp and an "act" step, or ok:false (status "fail" step) when the query contains "decline" (case-insensitive), so the action error state is reachable from the UI.

### Reducer + self-check — `web/src/lib/agent/reduce.ts` (~50 lines), `reduce.check.mjs` (~40 lines), package.json script `"check:agent": "node src/lib/agent/reduce.check.mjs"`
The check asserts: step upsert replaces by id; candidate upsert; decision set; error → status error; done → status done; events appended in order.

### API routes — `web/src/app/api/agent/route.ts` (~50 lines), `web/src/app/api/action/route.ts` (~35 lines)
Per the HTTP contract. No `dynamic` export (Next 16 scaffold enables `cacheComponents`, which rejects it; POST handlers are uncached). Node runtime (default; no edge).

### Hook — `web/src/hooks/use-agent-run.ts` (~110 lines)
`"use client"`, per Data and Control Flow steps 2, 4, 5 and 7.

### Panels — `web/src/components/`
- `app-header.tsx`: name + tagline from appConfig; "Powered by" sponsor strip (logo img or name, link if url) only when sponsors.length > 0.
- `request-panel.tsx` props `{ status: RunStatus; query: string; onRun(q: string): void; onReset(): void }`: heading "Request", label, Textarea, example prompt Buttons (fill + run), Run button (disabled when empty or running, shows "Running…"), "New request" button when status is done or error.
- `candidates-panel.tsx` props `{ status: RunStatus; candidates: Candidate[]; decision?: Decision; action: ActionState; onApprove(): void }`: heading "Candidates"; empty state copy; Skeleton cards while running with no candidates; grid of cards with Badge per verdict (selected = default, rejected = destructive/outline, considering = secondary), price via `Intl.NumberFormat`, attributes list, reason line; renders `<DecisionCard/>` above the grid when decision exists.
- `decision-card.tsx` props `{ decision: Decision; candidate?: Candidate; action: ActionState; onApprove(): void }`: summary, the action button (label `decision.actionLabel ?? appConfig.actionLabel`) opens a Dialog that confirms what will happen; Confirm calls onApprove; pending → disabled "Working…"; success → receipt (reference + message); error → Alert + Retry.
- `audit-trail.tsx` props `{ state: RunState; action: ActionState }`: heading "Audit trail"; empty state; ScrollArea timeline of steps (lucide icon per kind, status badge, timestamp `toLocaleTimeString`, detail, source links); auto-scroll to newest; error Alert when status error; "Export JSON" button (disabled when no events).
- `agent-workspace.tsx` (`"use client"`): calls useAgentRun, renders header and 3-column grid `lg:grid-cols-[320px_minmax(0,1fr)_380px]`, stacked below lg, plus a footer with appConfig.footerNote.

### Page — `web/src/app/page.tsx` renders `<AgentWorkspace />`; `layout.tsx` metadata title/description from appConfig.

### Docs — `README.md` (root), `web/.env.example`, `web/.gitignore` (`!.env.example`)
README sections: Problem (TBD placeholder), Run locally, Customize in 5 minutes (table), Agent backend contract (event types + curl example + AGENT_BACKEND_URL), Known limitations (mock data, no real purchase).

## Open Questions
| # | Question | Impact | Default Chosen by Spec | Planning Effect |
|---|----------|--------|------------------------|-----------------|
| 1 | Which shopping idea? | Non-blocking | Generic product-purchase mock scenario; all copy in app.config.ts and mock.ts | Use default |
| 2 | Who are the sponsors and do they require a specific AI/cloud SDK? | Non-blocking | `sponsors: []`; backend reached only via AGENT_BACKEND_URL, so any SDK fits behind it | Use default |
| 3 | Backend language/host (AWS Lambda, Python, etc.)? | Non-blocking | NDJSON-over-HTTP contract, language-agnostic | Use default |
| 4 | Brand colors/fonts? | Non-blocking | shadcn base-nova defaults; rebrand via `--primary` | Use default; design pass in Phase 3 |
| 5 | Deploy target? | Non-blocking | Out of scope for Phase 1 (local run only) | No deploy task |

## Complexity Assessment

**Rating:** Complex

| Metric | Value |
|--------|-------|
| Requirements | 8 |
| Deliverables | 16 files (new: 15 + scaffold, modify: package.json, .gitignore, layout.tsx, page.tsx) |
| Estimated waves | 3 |
| Estimated plans | 4 |
| Competing proposals | Recommended by rating; skipped by user (one obvious approach under a 5-hour limit) |

**Rationale:** Many files and three dependency layers (scaffold+contract → seam and panels in parallel → integration+QA), but every design decision is fixed above, so execution risk is low.

**Recommended next step:** /legion:plan 1 without proposals (in progress).

## Revision History
| # | Section | Change | Reason |
|---|---------|--------|--------|
| 1 | Key Decisions | App moved from repo root to `web/` | create-next-app rejects non-empty dirs (.planning exists) |
| 2 | Compatibility | Added `!.env.example` gitignore exception | Next default `.env*` ignore would hide the example file |
| 3 | Compatibility | Base UI `render` vs `asChild` warning | base-nova preset is default in shadcn 4.x; executors would otherwise guess the Radix API |
| 4 | Contracts | RunState, ActionState and initialRunState moved into types.ts | Lets the panels plan and the seam plan run in parallel against one contract |
| 5 | Contracts | ActionResult.step added | Critique: the meaningful action was missing from the audit trail/export |
| 6 | Mock | "fail" trigger in the query and candidateId | Critique: the error states were not reachable in a demo or QA without a broken backend |
| 7 | Hook | Partial-line buffering and missing-terminal-event handling | Critique: chunk boundaries can split NDJSON lines |
| 8 | Acceptance | Config-driven name grep check added | SKEL-02 originally had no machine check |
| 9 | Mock | Action failure trigger changed from candidateId "fail" to query containing "decline" | candidateId is never "fail" in a UI run, so the failure path was unreachable |
| 11 | Deliverables › API routes | Removed `export const dynamic` | Plan 01 found the Next 16.4.6 scaffold sets `cacheComponents: true` |
| 10 | Acceptance | Repeatable \`web/scripts/smoke.sh\` + \`npm run smoke\` | Same checks re-run after the real backend is plugged in |

### Assumptions accepted
| Assumption | Impact | Evidence | Action |
|-----------|--------|----------|--------|
| `shadcn init --defaults --yes` runs non-interactively inside an existing Next app | Med | `--help` shows -y default true, -d sets template/preset | Stop gate in Plan 01 if it prompts |
| Node 24 type stripping runs reduce.ts imported from .mjs | Low | Node ≥22.18 strips types by default; reduce.ts uses only `import type` | Stop gate in Plan 02 |
| Next 16 lint script is `eslint` and passes on the scaffold | Low | create-next-app `--eslint` | Verify in Plan 01 |
