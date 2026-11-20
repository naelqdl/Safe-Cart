# <Project name TBD>

An autonomous shopping agent with an audit trail, built at the Personal Agents Hackathon (2026-11-20).

The dashboard has an **Autopilot** switch. While it is on, the agent checks its missions every few seconds without being asked. It buys on its own when a deal is within your guardrails (auto-buy limit, daily budget) and sends anything else to an approvals inbox. Every check, decision and purchase goes into the audit trail, which you can export as JSON.

Problem / user / solution: TBD once the idea is chosen.

## Run locally

Requires Node 20.9+ (tested on Node 24).

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

Demo: turn on **Autopilot**. Within about 40 seconds the mock agent auto-buys the charger and the coffee (under the $50 auto-buy limit) and asks you to approve the headphones (over the limit). **Check now** runs a check immediately, even when Autopilot is off.

Demo triggers (mock agent): add a mission whose title contains "fail" to see a failed check, or "decline" to see a declined payment.

### Troubleshooting

- `npm install` fails with `EALLOWSCRIPTS`: your `~/.npmrc` contains an `allow-scripts=` line, which npm 11.19+ rejects. Remove that line, or run npm with an empty user config, for example `NPM_CONFIG_USERCONFIG=/path/to/empty.npmrc npm install`.

## Desktop app

```bash
cd web
npm run build      # optional: the desktop app uses the production build when one exists, otherwise next dev
npm run desktop    # opens the Electron app (its own server on port 3210; DESKTOP_PORT to change)
```

- **Maximized / full screen:** the full dashboard with the chat docked on the right.
- **Restore the window (un-maximize):** it shrinks to a 420×720 always-on-top widget in the bottom-right corner showing only the chat and the Autopilot switch. Maximize it again to get the dashboard back.
- The layout switch is width-based (chat-only below 720 px), so the same happens in a narrow browser window.
- `DESKTOP_URL=http://localhost:3000 npm run desktop` wraps an already running server instead of starting one. `DESKTOP_TEST_COMPACT=1` un-maximizes 5 s after load (handy for demos).
- Not packaged as an installer yet (runs from the repo with `npm run desktop`).

## Chat

Talk to the agent in the chat panel: "watch AirPods under $150", "pause", "resume", "approve", "decline", "check now", "what did you buy?", "why?", "status". The agent also posts on its own when it buys something, needs approval (with inline Approve/Decline) or a check fails.

`POST /api/chat` takes `{"message": string, "context": ChatContext}` and returns `{"reply": string, "actions": ChatAction[]}`; the client executes the actions (`add_mission`, `set_autopilot`, `approve`, `decline`, `check_now`). With `AGENT_BACKEND_URL` set it forwards to `<url>/chat`, so an LLM backend can replace the rule-based mock (`web/src/lib/agent/chat-mock.ts`). Types: `web/src/lib/agent/types.ts`.

## Customize in 5 minutes

| I want to change… | Edit |
|---|---|
| Name, tagline, footer | `web/src/config/app.config.ts` |
| Starting missions, guardrails (auto-buy limit, daily budget), check interval | `missions`, `guardrails`, `checkIntervalSeconds` in `web/src/config/app.config.ts` |
| Sponsors | `appConfig.sponsors` in `web/src/config/app.config.ts`, logos in `web/public/sponsors/` |
| Colors | `--primary` (light and dark) in `web/src/app/globals.css` |
| Mock scenario | `web/src/lib/agent/mock.ts` |
| Dashboard layout | `web/src/components/dashboard.tsx` |
| A single panel | `web/src/components/<panel>.tsx` (`app-header`, `stat-tiles`, `missions-panel`, `approvals-panel`, `receipts-panel`, `audit-trail`) |
| Autopilot timing / approve / decline logic | `web/src/hooks/use-autopilot.ts` |
| Event types | `web/src/lib/agent/types.ts` (additive changes only) |

## Connect a real agent backend

Set `AGENT_BACKEND_URL` in `web/.env.local` (copy `web/.env.example`), no trailing slash, then restart the server:

```bash
AGENT_BACKEND_URL=http://localhost:8000
```

The Next.js routes `/api/agent/tick` and `/api/action` validate the request and forward it to your backend, which implements:

- `POST /tick`: one proactive check. Body `TickRequest`: `{"tick": number, "missions": [{"id","title","maxPrice","currency"}], "guardrails": {"autoBuyLimit","dailyBudget"}, "spentToday": number}` (only missions still being watched are sent). The agent decides what to look at and what to do. Response: NDJSON (`content-type: application/x-ndjson`), one event per line, ending with exactly one `done` or `error` event.
- `POST /action`: executes a purchase the user approved. Body `{"candidateId": string, "query": string}` (query = mission title). Response: `ActionResult` JSON `{"ok": boolean, "reference"?: string, "message": string, "step": AuditStep}`.

The dashboard calls `/tick` every `checkIntervalSeconds` while Autopilot is on. Your backend owns the decision: emit a `receipt` when it bought something within the guardrails, or an `approval` when it needs the user's OK.

Event shapes (types in `web/src/lib/agent/types.ts`):

```json
{"type":"step","step":{"id":"t4-check","at":"2026-11-20T18:00:00.000Z","kind":"search","title":"Checked 3 stores for \"USB-C laptop charger\"","sources":[{"label":"Example store","url":"https://example.com"}],"status":"ok","missionId":"m-charger"}}
{"type":"mission","missionId":"m-charger","status":"done","note":"Bought for $34.99"}
{"type":"receipt","receipt":{"reference":"ORD-123","missionId":"m-charger","candidateId":"c1","title":"USB-C laptop charger","amount":34.99,"currency":"USD","saved":10,"at":"2026-11-20T18:00:01.000Z","auto":true}}
{"type":"approval","approval":{"id":"a1","missionId":"m-headphones","reason":"$212.50 is over your $50.00 auto-buy limit","at":"2026-11-20T18:00:02.000Z","candidate":{"id":"c2","title":"Headphones","vendor":"Example store","price":212.5,"currency":"USD","attributes":{"List price":"$300.00"},"verdict":"selected"}}}
{"type":"error","message":"Search provider timed out"}
{"type":"done"}
```

- `step.kind`: `plan | search | fetch | compare | decide | act`; `step.status`: `running | ok | warn | fail`. Steps upsert by `id`: send one as `running`, then again with the same id as `ok` or `fail`.
- `mission.status`: `watching | waiting | done`.
- Guardrails: approving in the inbox overrides the auto-buy limit but never the daily budget.

Try it against the running app (mock or your backend):

```bash
curl -N -X POST http://localhost:3000/api/agent/tick -H 'content-type: application/json' \
  -d '{"tick":1,"missions":[{"id":"m1","title":"Charger","maxPrice":40,"currency":"USD"}],"guardrails":{"autoBuyLimit":50,"dailyBudget":300},"spentToday":0}'
```

Unset `AGENT_BACKEND_URL` (and restart) to fall back to the mock. If the backend is unreachable, the routes return `502 {"error":"Agent backend unreachable"}`.

## Checks

Run from `web/`:

```bash
npm run lint
npm run build
npm run check:agent   # reducer self-check
npm run smoke         # HTTP smoke checks; needs a running server (default http://localhost:3000)
```

`npm run smoke -- http://localhost:3123` checks another URL.

## Known limitations

- All data is mock until a backend is connected.
- Autopilot runs in the browser tab: it checks only while the dashboard is open, and state resets on reload (only the on/off switch is saved).
- No real purchases or payments.
- No auth.
- Not deployed.
