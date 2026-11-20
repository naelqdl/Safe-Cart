// UI ↔ agent contract. Additive changes only; the backend emits these events as NDJSON.

export type StepKind = "plan" | "search" | "fetch" | "compare" | "decide" | "act";
export type StepStatus = "running" | "ok" | "warn" | "fail";
export interface SourceRef { label: string; url?: string }
export interface AuditStep {
  id: string; at: string /* ISO 8601 */; kind: StepKind; title: string;
  detail?: string; sources?: SourceRef[]; status: StepStatus;
}
export type Verdict = "considering" | "selected" | "rejected";
export interface Candidate {
  id: string; title: string; vendor: string; price: number; currency: string;
  url?: string; imageUrl?: string; attributes: Record<string, string>;
  verdict: Verdict; reason?: string;
}
export interface Decision { candidateId: string; summary: string; actionLabel?: string }
export interface AgentRequest { query: string }
export type AgentEvent =
  | { type: "step"; step: AuditStep }            // upsert by step.id
  | { type: "candidate"; candidate: Candidate }  // upsert by candidate.id
  | { type: "decision"; decision: Decision }
  | { type: "error"; message: string }
  | { type: "done" };
export interface ActionRequest { candidateId: string; query: string }
export interface ActionResult { ok: boolean; reference?: string; message: string; step: AuditStep }
export type RunStatus = "idle" | "running" | "done" | "error";
export interface RunState {
  status: RunStatus; query: string; startedAt?: string;
  events: AgentEvent[]; steps: AuditStep[]; candidates: Candidate[];
  decision?: Decision; error?: string;
}
export type ActionState =
  | { status: "idle" } | { status: "pending" }
  | { status: "success"; result: ActionResult } | { status: "error"; message: string };
export const initialRunState: RunState = { status: "idle", query: "", events: [], steps: [], candidates: [] };
