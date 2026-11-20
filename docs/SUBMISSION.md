# SafeCart: submission draft

Form: tokensand.com/personalagenthack/submit. Fill the TODOs before submitting. Sponsor clients are on main; confirm on the demo laptop (GET :8000/health) which ones ran live, not on fallback.

## Project name

SafeCart

## One line

Every shopping agent finds you a deal. Ours checks it's safe first, and keeps protecting what you already own.

## What we built (under 200 words)

SafeCart is a personal shopping agent with an audit trail. It remembers a shopper's preferences, wishlist and owned items, and buys wishlist items on its own when they go on sale and fit her rules. Before every purchase it runs a recall check against CPSC data and a Senso knowledge base, and it never auto-buys when the result is unknown. If a wishlist item is recalled, it skips it and buys the next fitting choice. If a new recall matches something she already owns, it files the refund claim and buys a safe replacement. Listing text is treated as untrusted: a guard flags injected instructions. Every step lands in an audit trail with cited sources, and a Statsig flag turns the recall check off to show a naive agent for contrast. The demo shopper (Maya, fictional) and the store are simulated; recall data is real CPSC data; payments are Stripe TEST mode. The dashboard is a Next.js app; the agent backend runs on :8000 and the store sandbox on :3100.

## Every sponsor tool and how we used it

- SingleStore: catalog, price history, wishlist, owned items, recalls table and the step ledger; full-text search for safe alternatives.- Senso: knowledge base of recall notices and store policy; a fact-check "the <brand> <model> has no active recall" gates every buy and is cited in the trail.- Superlinked SIE: guard on untrusted listing text, extraction of brand, model, price and UPC, rerank of alternatives by preferences.- Statsig: dynamic config `purchase_policy` and gate `recall_guard`, flipped live to switch between SafeCart and the naive agent.- Amplitude: browser events for agent outcomes (sale_detected, safety_check, purchase_auto, recall_alert, approvals, policy_seen). Client is in the repo and is a no-op without an API key. Funnel chart: TODO confirm it was built.
- Firedrill: naive vs SafeCart scenarios scaffolded in `evals/`; not run (drills need macOS/Linux). No results.
- Stripe (not a sponsor): TEST-mode PaymentIntent as the purchase action.
- Claude (not a sponsor): writes each decision rationale and the refund-claim letter; never decides. Model, latency and cost show in the trail.
## Links

- Repo: https://github.com/naelqdl/Safe-Cart
- Video (3 min max): TODO
- Live demo URL: none (runs locally; not deployed)

## Team

- Nael, email: TODO
- jusman, email: TODO
- Hong Zhe, email: TODO
