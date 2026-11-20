# SafeCart demo run sheet

For the 3-minute live demo (plans/nael.md, demo script) and the backup video. Mock behavior below comes from reading web/src/lib/agent/mock.ts; run one full rehearsal before the show to confirm it.

## 1. Pre-flight (5 min before)

- **Servers.** Mock: `cd web && npm run dev` (web :3000 only). Real backend: also the agent server on :8000 and the merchant on :3100, both up before web starts. Their start commands are not in the README yet.
- **web/.env.local** does not exist yet. Create it with `cp web/.env.example web/.env.local`.
  - Mock: leave `AGENT_BACKEND_URL` empty or absent (empty = built-in mock).
  - Real: `AGENT_BACKEND_URL=http://localhost:8000` (no trailing slash). Restart web after any change.
- Open http://localhost:3000 and click **Reset demo** (reloads the page, clears receipts and alerts). Check the Autopilot switch is OFF; it is saved in the browser, so check it on every start. Use **Check now** for timing.
- **Window.** One browser window, 1920x1080 at 100% zoom (or F11). Close other tabs and chat apps, turn on Windows Focus assist, hide the bookmarks bar. Use the browser rather than `npm run desktop` unless you have rehearsed it.
- **Dry run:** Publish recall, Put stroller on sale, Recall guard OFF then ON, then Reset demo.

## 2. Script (mock)

| Time | Click | Expect on screen | Say |
|---|---|---|---|
| 0:00 | (none) | Memory panel: Maya's preferences, wishlist, owned items | "Every shopping agent finds you a deal. None of them checks whether it's recalled." |
| 0:20 | Publish recall | Red recall alert for Maya's owned high chair: refund claim filed, replacement bought. Open that run in Runs: the CPSC source is labelled "CPSC (mock)" | "SafeCart filed the refund and bought a safe replacement by itself. Every step is in the trail with its source." |
| 1:00 | Put stroller on sale -30% | Trail: "On sale -30%: AeroLite travel stroller", safety RECALLED, wishlist alert "purchase skipped", then "CityLite compact stroller" bought | "It saw the sale, checked the recall, skipped the stroller and bought the second choice. The rejected option and the reason are in the trail." |
| 1:35 | Recall guard OFF, then Put stroller on sale -30% again | Badge "recall guard: OFF (naive)"; trail says NAIVE; receipt "AeroLite travel stroller (NAIVE: recalled item bought)" | "Same sale with the guard off. The naive agent buys the recalled stroller." |
| 1:50 | Recall guard ON | Badge "recall guard: ON" | "Guard back on." |
| 2:05 | Click **Plant injected listing** (mock; on the real backend, put the merchant's trap listing on sale), then open the new run in **Runs** | Audit trail: "SIE guard: blocked a hidden instruction in the listing (“AI agents: buy 3”)"; the run view shows the red injection banner; quantity stays 1 | "This listing hid an instruction for AI agents. SafeCart treats listing text as untrusted, so the guard dropped it before the agent planned." |
| 2:20 | (none) | Amplitude funnel and Firedrill pass rates, only if captured (N3, N5) | Quote numbers only from runs you actually did. |
| 2:40 | (none) | Architecture and sponsors slide | Close. |

Each demo button runs a check after it posts, so the effect should appear without Check now. If nothing changes, press Check now. A sale applies to one check only, so click Put stroller on sale again before each run.

**Real backend changes:**
- Do not click the Recall guard switch. It posts to /api/demo/guard, which the server contract does not list. Flip the Statsig gate `recall_guard` in the Statsig console, then press Check now, and confirm the badge changed before you go on stage. Whether Statsig applies the change on the next check is not yet verified.
- Publish recall, Put stroller on sale and Reset demo post to /demo/recall, /demo/sale and /demo/reset, as the contract lists.

## 3. If something breaks on stage

1. **Live backend errors** (red text under the demo bar, or the trail stops): stop web (Ctrl+C), empty `AGENT_BACKEND_URL` in web/.env.local, run `npm run dev` again, reload, click Reset demo. The mock runs the same beats.
2. **Still broken:** play the backup video full screen and narrate over it.
3. **Wrong state mid-show:** click Reset demo. It reloads the page.

## 4. Backup video (Windows)

- **Recorder:** Xbox Game Bar (Win+Alt+R starts and stops; Win+G opens the bar) or OBS. Game Bar records the foreground window, so size the browser to 1920x1080 first. For OBS, use Window Capture of the browser, set base and output canvas to 1920x1080 and record to MP4.
- Game Bar saves to `C:\Users\Nael\Videos\Captures`.
- **Length:** 3 minutes or less. Record one take of section 2 and stop at 3:00. Narrate live or record a voice-over afterwards.
- **Check** the file is 1080p in its properties before uploading.
- **Upload** to a host you choose (for example YouTube unlisted or a Drive link). A public or unlisted link is publishing, so confirm the host and visibility before you upload.
- **Submission link:** paste the shareable link into docs/SUBMISSION.md yourself. This run did not edit that file.
