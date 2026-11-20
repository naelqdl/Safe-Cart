# Phase 2 Context: SafeCart build

## Phase Goal
Pivot the team from D1 (Forfeit Zero) to SafeCart: a personal shopping agent that remembers preferences, wishlist and owned items, buys wishlist items on sale autonomously, and never buys a recalled product while protecting owned items from recalls (refund claim + safe replacement). Golden path green by 14:45 PT; submit by 16:30.

## Requirements Covered
SC-01 … SC-09 (see REQUIREMENTS.md).

## What Already Exists (from prior phases)
- web/ dashboard (Phase 1 + autopilot, chat, Electron, K-trail run view) — see .planning/CODEBASE.md.
- Team assets reused: hz's Senso/Stripe/SIE clients (branch hz/integrations), ag's merchant sandbox (branch ag/merchant-sandbox), ch's registry pattern (server/registries/), K-dashboard v1 and K-trail v0 contracts (vault ctx/).

## Key Design Decisions
- Recall protection is the differentiator: safety check before every buy + owned-items sweep.
- Real data: CPSC recall API (keyless). Simulated: store, shopper, inbox. Payments: Stripe TEST.
- Contracts change additively only (SafetyCheck, RecallAlert, Profile, recall event).
- Architecture proposals and spec pipeline skipped (deadline).
- Per-human briefs (one prompt each): plans/nael.md, plans/hz.md, plans/jus.md (mirrored in the Relay vault hackathon/plans/).

### Sponsors: where each one is load-bearing
| Sponsor | Job in SafeCart | Owner | Priority | Breaks without it |
|---|---|---|---|---|
| SingleStore | catalog, price history, wishlist, owned items, recalls table, ledger; alternative search (full-text + filters, vector P1) | hz client, cc queries | P0 | no memory, no recall↔owned match, no ledger |
| Senso | trusted KB: recall notices + store refund policies, versioned; factCheck gate on "not recalled" before every buy | hz client + seed, cc gate | P0 | no cited safety proof in the trail |
| Superlinked SIE | guard (injection) and extract (model/price) on untrusted listings; rerank alternatives by preferences | hz client, cc calls | P0 | planner reads raw untrusted text; no model numbers to match |
| Statsig | dynamic config purchase_policy + gate recall_guard; flipped live on stage | hz client, cc reads, Nael shows | P0 | no live policy change |
| Amplitude | browser events for every agent outcome; funnel sale→safety→buy | Nael | P0 | no analytics story |
| Stripe (not a sponsor) | test-mode PaymentIntent = real action | hz client (exists) | P0 | no real action |
| Cognee | preference memory from past orders (“prefers lightweight”, “returned X because…”) used to rerank | hz sidecar, cc calls | P1 | preferences become static JSON |
| Airbyte | reads the seeded Gmail inbox of order confirmations → owned items | hz | P1 | owned items load from data/inbox files |
| Firedrill | 10 simulated shoppers × traps (recalled sale item, injected listing): naive vs SafeCart pass rate | Nael | P1 | no measured numbers |
| Persona | step-up verification before any auto-buy over $150 | cc | P2 | over-limit buys use a plain approval |
| Arcee | cheap model for claim letters/summaries; cost per step in trail | cc | P2 | everything on one model |
| Guild | skip (access gated) | — | — | — |

## Plan Structure
| Plan | Wave | Owner | Brief | Agents |
|---|---|---|---|---|
| 02-01 Seed data, CPSC client, merchant | 1 | jusman (ch, ag) | jus.md | engineering-senior-developer, testing-api-tester |
| 02-02 Sponsor clients | 1 | Hong Zhe (hz) | hz.md | engineering-ai-engineer, testing-api-tester |
| 02-03 Web SafeCart UI + Amplitude | 1 | Nael (nc) | nael.md | engineering-frontend-developer, testing-qa-verification-specialist |
| 02-04 Agent loop on :8000 | 2 | jusman (cc) | jus.md | engineering-ai-engineer, engineering-backend-architect |
| 02-05 Golden path, Firedrill, submission | 3 | Nael (nc) | nael.md | testing-qa-verification-specialist, product-technical-writer |

### Timeline (PT, today; hard deadline 16:30)
| Time | Milestone |
|---|---|
| 12:20–12:35 | Humans agree on the pivot; Hong Zhe creates keys; everyone pulls main |
| 12:35–13:45 | Wave 1: seed data + registry + merchant (jus), sponsor clients (hz), web on mock (Nael) |
| 13:45–14:45 | Wave 2: agent loop wired to clients; web against :8000 |
| **14:45** | **Golden path green end to end (P0). No P1 work before this.** |
| 14:45–15:40 | P1: Cognee, Airbyte, Firedrill, Persona; demo rehearsal |
| 15:40 | Code freeze. Merge to main |
| 15:40–16:15 | Record ≤3-min video, write submission, README |
| 16:20 | Submit (tokensand.com/personalagenthack/submit). Repo shared with reviewers |
