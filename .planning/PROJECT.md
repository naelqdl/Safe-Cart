# Project: Shopping Agent (Personal Agents Hackathon)

## Vision
A personal shopping agent that helps someone make a purchase or complete a shopping task.
It uses reliable context to make decisions, takes a meaningful action, and shows the
information and steps behind what it did (an audit trail).

## Event constraints
- Format: 5-hour team hackathon (date: 2026-11-20).
- Prompt: "Build a shopping agent with an audit trail. Pick a real problem, build a working experience, and show us the result."
- Product idea: NOT decided yet. Phase 1 builds an idea-agnostic UI skeleton the team can re-skin quickly.
- Sponsors: TBD (to be announced later). Sponsor slots must be config-driven and hidden when empty.

## Architecture constraints
- Frontend: Next.js (App Router, TypeScript, Tailwind CSS v4) + shadcn/ui, located in `web/`.
- Agent backend: unknown language/host. The UI talks to it only through an HTTP NDJSON event contract
  (see .planning/specs/01-ui-skeleton-spec.md). Until a backend exists, a built-in mock agent serves the same contract.
- No real purchases or payments in the skeleton. Every mock output is labelled as mock.
- Secrets only via environment variables; `web/.env.example` documents them without values.

## Judging-relevant pillars (from the prompt)
1. Helps complete a shopping task.
2. Reliable context: every decision cites its source.
3. Meaningful action, with explicit user approval.
4. Visible audit trail of information and steps, exportable.
