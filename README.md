# <Project name TBD>

A shopping agent with an audit trail, built at the Personal Agents Hackathon (2026-11-20).

Problem / user / solution: TBD once the idea is chosen.

## Run locally

Requires Node 20.9+ (tested on Node 24).

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

Demo triggers (mock agent):

- A query containing "fail" shows the agent error state.
- A query containing "decline" makes the action fail (after the run, click the action button and confirm).

### Troubleshooting

- `npm install` fails with `EALLOWSCRIPTS`: your `~/.npmrc` contains an `allow-scripts=` line, which npm 11.19+ rejects. Remove that line, or run npm with an empty user config, for example `NPM_CONFIG_USERCONFIG=/path/to/empty.npmrc npm install`.

## Customize in 5 minutes

| I want to change… | Edit |
|---|---|
| Name, tagline, copy, example prompts, action label, footer | `web/src/config/app.config.ts` |
| Sponsors | `appConfig.sponsors` in `web/src/config/app.config.ts`, logos in `web/public/sponsors/` |
| Colors | `--primary` (light and dark) in `web/src/app/globals.css` |
| Mock scenario | `web/src/lib/agent/mock.ts` |
| Panel layout | `web/src/components/agent-workspace.tsx` |
| A single panel | `web/src/components/<panel>.tsx` (`app-header`, `request-panel`, `candidates-panel`, `decision-card`, `audit-trail`) |
| Event types | `web/src/lib/agent/types.ts` (additive changes only) |

## Connect a real agent backend

Set `AGENT_BACKEND_URL` in `web/.env.local` (copy `web/.env.example`), no trailing slash, then restart the server:

```bash
AGENT_BACKEND_URL=http://localhost:8000
```

The Next.js routes `/api/agent` and `/api/action` validate the request and forward it to your backend, which implements:

- `POST /agent`: body `{"query": string}`. Response: NDJSON (`content-type: application/x-ndjson`), one event per line, ending with exactly one `done` or `error` event.
- `POST /action`: body `{"candidateId": string, "query": string}`. Response: `ActionResult` JSON `{"ok": boolean, "reference"?: string, "message": string, "step": AuditStep}`.

The 5 event shapes (types in `web/src/lib/agent/types.ts`):

```json
{"type":"step","step":{"id":"s1","at":"2026-11-20T18:00:00.000Z","kind":"search","title":"Searched catalog","detail":"3 matches","sources":[{"label":"Example store","url":"https://example.com"}],"status":"ok"}}
{"type":"candidate","candidate":{"id":"c1","title":"65W USB-C charger","vendor":"Example store","price":34.99,"currency":"USD","url":"https://example.com/c1","attributes":{"Power":"65 W"},"verdict":"selected","reason":"Cheapest that meets the spec"}}
{"type":"decision","decision":{"candidateId":"c1","summary":"Buy the 65W charger: under budget and ships by Friday.","actionLabel":"Place order"}}
{"type":"error","message":"Search provider timed out"}
{"type":"done"}
```

- `step.kind`: `plan | search | fetch | compare | decide | act`; `step.status`: `running | ok | warn | fail`.
- `candidate.verdict`: `considering | selected | rejected`.
- `step` and `candidate` events upsert by `id`: send a step as `running`, then again with the same id as `ok` or `fail`.

Try it against the running app (mock or your backend):

```bash
curl -N -X POST http://localhost:3000/api/agent -H 'content-type: application/json' -d '{"query":"a usb-c charger"}'
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
- No real purchases or payments.
- No auth.
- Not deployed.
