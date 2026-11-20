# Demo video notes (SafeCart)

Notes for recording the ≤3 min submission video. Live-demo run sheet and recorder setup: [DEMO.md](DEMO.md) (section 4 covers Game Bar / OBS).

## Before you hit record

1. Start, in this order: `cd server && npm run dev` (:8000), `cd merchant && npm start` (:3100), `cd web && npm run build && npm run desktop` (:3210). Keep the window **maximized** (un-maximized = small chat widget).
2. **Logs** tab → **Reset demo**. Autopilot OFF. Use **Check now** to control timing.
3. Optional: `curl localhost:8000/health` shows which sponsor keys are set. Without keys the trail says "fallback" / "SIMULATED"; that is honest, don't hide it.

## Tabs (where things are)

- **Shop**: what Maya sees: stat tiles, recall alerts, memory (preferences, wishlist, owned), approvals, receipts, "Refund requests sent" card.
- **Refunds**: every refund request SafeCart sent and the store's reply. Click a row to open the emails.
- **Logs**: demo buttons (sale, recall, inject, guard, reset), audit trail, runs, watch list.
- Chat is docked on the right.

## Shot list (about 3:00)

| Time | Do | Show | Say |
|---|---|---|---|
| 0:00 | Shop tab | Memory panel: preferences, wishlist, owned items | "Every shopping agent finds you a deal. None checks whether it's recalled, or watches what you already own." |
| 0:15 | Chat: **add a car seat to my wishlist** | Reply "Added Nuvo Safe Convertible Car Seat…", then it appears in the wishlist | "You tell it what you want; it finds it in the store, sets a target price and runs a recall check first." |
| 0:35 | Logs → **Publish recall**, then Shop | Red alert on Maya's owned high chair (real CPSC recall 10328): refund claim filed, replacement bought | "A real CPSC recall hit something Maya owns. SafeCart filed the refund and bought a safe replacement." |
| 1:00 | **Refunds** tab, click the high chair row | The refund email SafeCart sent; ~10 s later the store's reply ("Refund approved") | "Here's the letter it sent and the store's answer." Then click a **Sample** row to show a second thread. |
| 1:25 | Logs → **Put stroller on sale −30%** | Trail: sale seen, stroller RECALLED (CPSC 10014), skipped, next choice bought | "It saw the sale, checked the recall, skipped it and bought the safe second choice. Every step is in the trail with its source." |
| 1:55 | Recall guard OFF, sale again, guard ON | Receipt labelled NAIVE | "With the guard off, a naive agent buys the recalled stroller." |
| 2:15 | **Plant injected listing**, open the run in Runs | "blocked a hidden instruction" banner | "Listing text is untrusted; hidden instructions for AI agents are dropped." |
| 2:30 | Sponsor map / architecture | https://claude.ai/artifact/MLAKbdaVUM9ngT9sEtGBhL, docs/architecture.png | Sponsors and what each does. |
| 2:45 | (talk) | | Next step: screen-aware memory (below). Close. |

A sale applies to one check only: click **Put stroller on sale** again before each sale beat. Click **Reset demo** after every practice take.

## Say it accurately (judges will ask)

- **Recall data is real.** Live CPSC API (saferproducts.gov), checked before every buy; also the recall table (SingleStore with `S2_URL`, otherwise local seed) and Senso (with `SENSO_API_KEY`). On this PC without keys: CPSC live + local seed only.
- **Simulated:** the store (merchant :3100), Maya, her order emails, and the store's refund reply (automatic, 10 s after the request).
- **Sample refund requests:** the 4 rows marked **Sample** use real CPSC recalls from 19 Nov 2026 (Kidsview infant bouncer, Qpancy pajamas, CHE-US magnetic toys, Ororo battery pack); their letters, order numbers and replies are made up.
- **Payments:** Stripe TEST mode, or "SIMULATED" without a key. No real money.
- **Claude:** writes each decision's explanation and the refund letter; it never decides to buy. Without `ANTHROPIC_API_KEY` a labelled template is used (the template cuts the recall remedy short, e.g. "prepaid shippi").
- **Where Maya's data comes from today:** seed files (`data/user.json`, `wishlist.json`, `owned.json`, matching the order emails in `data/inbox/`) plus chat ("add … to my wishlist"). Chat-added items last until Reset demo.
- **Screen reading is NOT built.** Say it as the vision: "SafeCart is meant to run as a desktop companion that, with your permission, reads what's on screen while you shop: what you add to a wishlist or cart, what you buy, what you look at often, and stores it in this dashboard." Do not show or imply it working.
- Firedrill evals were not run; Cognee/Airbyte are not on main. Don't quote numbers you didn't measure.

## Gotchas

- Window must stay maximized; links (CPSC notices) open in the system browser and steal focus.
- `NEXT_PUBLIC_*` changes need `npm run build`; server code reloads by itself (tsx watch).
- If the backend breaks mid-take: empty `AGENT_BACKEND_URL` in web/.env.local, relaunch; the mock runs the same beats (no Refunds rows except the samples).
