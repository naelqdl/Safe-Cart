# Requirements

| ID | Requirement | Phase |
|----|-------------|-------|
| SKEL-01 | Runnable Next.js + TypeScript + Tailwind + shadcn/ui app in `web/`; `npm run build` and `npm run lint` pass. | 1 |
| SKEL-02 | One config file (`web/src/config/app.config.ts`) controls app name, tagline, request copy, example prompts, action label, currency, sponsors and footer note; editing it re-skins the app with no component edits. | 1 |
| SKEL-03 | One typed agent contract (`web/src/lib/agent/types.ts`) shared by the API routes, mock, hook and components. | 1 |
| SKEL-04 | `POST /api/agent` streams NDJSON AgentEvents (mock by default; proxies to `AGENT_BACKEND_URL` when set). `POST /api/action` returns an ActionResult (mock by default; proxied when set). Invalid input returns 400 JSON. | 1 |
| SKEL-05 | Single-screen workspace: header with sponsor strip, request panel, candidates panel with verdicts and reasons, decision card with approve-to-act flow, live audit-trail timeline. Responsive: 3 columns at lg, stacked below. | 1 |
| SKEL-06 | Every panel has explicit empty, running, error and done states; the action has confirm, pending, success-receipt and failure-with-retry states. | 1 |
| SKEL-07 | Audit trail can be exported as a JSON file containing the query, timestamps, every event and the action result. | 1 |
| SKEL-08 | Root README explains how to run the app and a "Customize in 5 minutes" table mapping each change to the one file to edit, plus the backend event contract. | 1 |
