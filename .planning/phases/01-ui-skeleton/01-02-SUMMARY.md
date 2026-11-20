# Plan 01-02 Summary: Agent seam

Status: Complete
Agent: engineering-senior-developer
Wave: 2
Requirements: SKEL-04, SKEL-06

## Files
- web/src/lib/agent/reduce.ts, reduce.check.mjs, mock.ts (new)
- web/src/app/api/agent/route.ts, web/src/app/api/action/route.ts (new)
- web/src/hooks/use-agent-run.ts (new)
- web/package.json (+ "check:agent" script)

## Verification
- check:agent OK; all 13 plan greps pass; tsc + lint clean. Coordinator re-ran: check:agent, tsc, lint, build (api routes ƒ dynamic) all pass.
- Agent ran spec curl checks on a dev server: done stream with application/x-ndjson; "please fail" ends in error; empty/"nope" bodies → 400; action ok:true with MOCK- reference; "decline" → ok:false + fail step; AGENT_BACKEND_URL=http://127.0.0.1:1 → 502 on both routes.

## Decisions
- Bare `catch {}` (lint unused-var); behavior unchanged.
- Hook callbacks memoised with stable deps.

## Auto-Remediation
- Auto-remediated: readonly `sources` tuple from `as const` in mock.ts → scoped `as const` to `kind`; tsc passes.

## Issues
- Node MODULE_TYPELESS_PACKAGE_JSON warning on check:agent (harmless; package.json "type" change out of scope).
- `npx next dev -p 3123` failed with "unknown option '-p'" in the agent's environment; `node node_modules/next/dist/bin/next dev` works. Plan 04 QA should start the server via node directly if npm start -- -p fails.
