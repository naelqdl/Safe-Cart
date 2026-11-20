# State

- Phase: 1 of 3 (complete) + direction change applied (uncommitted)
- Status: Page is now an autonomous dashboard: Autopilot switch, proactive checks via POST /api/agent/tick, guardrails (auto-buy limit, daily budget), approvals inbox, receipts. Old single-run flow removed.
- Last Activity: Autopilot dashboard build (2026-11-20); verified with tsc, lint, check:agent, build, smoke, browser flow (screenshots in .planning/quick/autopilot-dashboard/)
- Next Action: see handoff/2026-11-20-shopping-agent.md (T05 uncommitted on nc/t05-k-trail; D1 = Forfeit Zero re-skin)
- Branch: legion/phase-01-ui-skeleton (not pushed; no remote configured)
- Environment: run npm/npx with NPM_CONFIG_USERCONFIG=<empty file> (user-approved; ~/.npmrc allow-scripts breaks npm 11.19)
- Team coordination: Obsidian Vault/hackathon/ per PROTOCOL.md; we are agent `nc` (agents/nc.md). TASKS.md and KEYS.md are owned by cc — do not edit. Hard deadline 16:30; D1 (idea) due ~11:45.
