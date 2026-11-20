# Plan 01-01 Summary: Scaffold, config and contract

Status: Complete
Agent: engineering-rapid-prototyper
Wave: 1
Requirements: SKEL-01, SKEL-02, SKEL-03

## Files
- web/ scaffold (create-next-app 16.4.6, shadcn 4.23.0 base-nova; ui: button card badge textarea dialog scroll-area separator skeleton alert)
- web/src/config/app.config.ts (new)
- web/src/lib/agent/types.ts (new, byte-identical to spec contract block + header comment)
- web/src/app/layout.tsx (metadata from appConfig)

## Verification
- All 6 frontmatter verification_commands exit 0; re-run independently by the coordinator: tsc "No errors found", eslint clean, next build ✓ (/ and /_not-found static).
- `grep -rln ShopAgent web/src` → only app.config.ts.

## Decisions
- types.ts is 36 lines (must_haves min 40): spec requires verbatim copy; not padded.
- Generated ui components and layout fonts untouched.

## Environment blocker and resolution
- First run BLOCKED: user ~/.npmrc `allow-scripts=@anthropic-ai/claude-code` → npm 11.19.1 EALLOWSCRIPTS on every project install.
- User approved (Pane card): run npm/npx with `NPM_CONFIG_USERCONFIG=<empty file outside repo>`. ~/.npmrc untouched. Teammates with the same npmrc line need the same workaround (to be noted in README by Plan 04).

## Auto-Remediation
- REPL context reset mid-run: re-ran a failed path-variable command; no file changes.

## Issues for later plans
- next.config.ts has `cacheComponents: true` → Plan 02 must not export `dynamic` (plan + spec patched by coordinator).
- shadcn 4.23 uses the `cn` package (`src/lib/utils.ts` re-exports it). Works.
- eslint 9.39.5 deprecation warning (harmless).
