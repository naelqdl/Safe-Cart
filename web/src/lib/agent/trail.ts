// K-trail v0 contract — owner cc; do not rename fields
export type Trust = 'trusted' | 'merchant' | 'untrusted' | 'user' | 'inferred';
export type Verdict = 'verified' | 'conflict' | 'unsupported' | 'not_verifiable' | 'pending';
export interface Run {
  id: string; status: 'running' | 'blocked' | 'done' | 'failed';
  startedAt: string; endedAt?: string;
  mandate: { goal: string; maxUsd: number; constraints: string[]; deadline?: string; verifiedBy?: string };
  fsa?: { balanceUsd: number; carryoverUsd: number; atRiskUsd: number; spentUsd: number; leftUsd: number; planDocVersion: string };  // D1 balance panel
  steps: Step[]; claims: Claim[]; decision?: Decision; action?: Action;
  cost: { usd: number; tokens: number; byModel: Record<string, number> };
}
export interface Step {
  id: string; t: string;                       // ISO time
  kind: 'retrieve' | 'extract' | 'verify' | 'decide' | 'policy' | 'guard' | 'act';
  title: string;                                // e.g. "Fact-checked 6 claims against Senso"
  model?: string; tool?: string;                // e.g. "claude-sonnet-5-5", "senso.evals"
  latencyMs?: number; costUsd?: number;
  status: 'ok' | 'warn' | 'blocked' | 'error';
  flags?: ('injection_blocked' | 'over_cap' | 'conflict' | 'escalated')[];
  detail?: string;                              // one line; long payloads go behind outputRef
  outputRef?: string;
}
export interface Claim {
  id: string; text: string; trust: Trust; verdict: Verdict; loadBearing: boolean; stepId: string;
  sources: { label: string; url?: string; snippet?: string; senso?: { contentId: string; versionId: string; score: number } }[];
}
export interface Decision { chosen: string; rationale: string; alternatives: { name: string; whyNot: string }[] }
export interface Action { kind: 'payment' | 'order' | 'claim' | 'email'; mode: 'real' | 'test' | 'simulated';
  ref: string; amountUsd?: number; status: string }  // e.g. ref "pi_3Q…", mode "test"
