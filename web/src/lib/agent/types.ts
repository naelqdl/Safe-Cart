// UI ↔ agent contract. The backend emits AgentEvents as NDJSON (one JSON object per line).
// Additive changes only once a backend is connected.

import type { Run } from "./trail";

export type StepKind = "plan" | "search" | "fetch" | "compare" | "decide" | "act";
export type StepStatus = "running" | "ok" | "warn" | "fail";
export interface SourceRef { label: string; url?: string }
export interface AuditStep {
  id: string; at: string /* ISO 8601 */; kind: StepKind; title: string;
  detail?: string; sources?: SourceRef[]; status: StepStatus;
  missionId?: string; // which mission this step belongs to
}
export type Verdict = "considering" | "selected" | "rejected";
export interface Candidate {
  id: string; title: string; vendor: string; price: number; currency: string;
  url?: string; imageUrl?: string; attributes: Record<string, string>;
  verdict: Verdict; reason?: string;
}

// --- Autopilot: the agent proactively watches missions and acts within guardrails ---
export interface Mission { id: string; title: string; maxPrice: number; currency: string }
export interface Guardrails {
  autoBuyLimit: number; // buys at or under this price happen without asking
  dailyBudget: number;  // total the agent may spend per day (auto + approved)
}
/** POST /api/agent/tick body: one proactive check. The agent picks what to look at. */
export interface TickRequest { tick: number; missions: Mission[]; guardrails: Guardrails; spentToday: number }
/** A purchase the agent wants to make but needs the user's OK for (over a guardrail). */
export interface Approval { id: string; missionId: string; candidate: Candidate; reason: string; at: string }
/** A purchase that was executed (auto = agent acted alone; false = user approved). */
export interface Receipt {
  reference: string; missionId: string; candidateId: string; title: string;
  amount: number; currency: string; saved: number; at: string; auto: boolean;
  safety?: SafetyCheck;
}
export type MissionStatus = "watching" | "waiting" | "done";

// --- SafeCart (plans/nael.md "Shared contract"): recall safety, alerts and the shopper profile ---
export interface SafetyCheck {
  status: "clear" | "recalled" | "unknown";   // unknown = a source failed; never auto-buy on unknown
  sources: SourceRef[];                        // e.g. CPSC API, Senso KB (content id); empty = NAIVE (no check)
  checkedAt: string;                           // ISO
  recallId?: string;
}
export interface RecallAlert {
  id: string; recallId: string; recallTitle: string; hazard: string; remedy: string; url: string;
  itemTitle: string; itemKind: "owned" | "wishlist";
  action: "refund_claim_filed" | "purchase_skipped" | "replacement_bought" | "needs_you";
  claimRef?: string; replacementTitle?: string; at: string;
}
export interface Profile {
  name: string;
  preferences: { label: string; source: "user" | "memory" }[];   // memory = from Cognee (P1)
  wishlist: { id: string; sku: string; title: string; targetPrice: number; price: number; listPrice: number; onSale: boolean; safety?: SafetyCheck }[];
  owned: { id: string; title: string; model: string; purchasedAt: string; merchant: string; safety?: SafetyCheck }[];
  policy: { autoBuyLimit: number; minDiscountPct: number; autonomy: "auto" | "ask_first"; recallGuard: boolean; source: "statsig" | "default" };
}

export type AgentEvent =
  | { type: "step"; step: AuditStep }                 // upsert by step.id
  | { type: "mission"; missionId: string; status: MissionStatus; note?: string }
  | { type: "approval"; approval: Approval }          // add to the approvals inbox
  | { type: "receipt"; receipt: Receipt }             // the agent executed a purchase
  | { type: "run"; run: Run }                         // K-trail Run; upsert by run.id
  | { type: "recall"; alert: RecallAlert }            // SafeCart recall alert; upsert by alert.id
  | { type: "error"; message: string }
  | { type: "done" };

/** POST /api/action body: execute a purchase the user approved. */
export interface ActionRequest { candidateId: string; query: string }
export interface ActionResult { ok: boolean; reference?: string; message: string; step: AuditStep; safety?: SafetyCheck }

// --- Chat: the user talks to the agent; the agent also posts on its own ---
export interface ChatMessage {
  id: string; role: "user" | "agent"; text: string; at: string;
  approvalId?: string; // agent message about a pending approval → render Approve/Decline
}
/** Things the agent may do from a chat turn; the client executes them via AutopilotApi. */
export type ChatAction =
  | { type: "add_mission"; title: string; maxPrice: number }
  | { type: "set_autopilot"; on: boolean }
  | { type: "approve"; approvalId: string }
  | { type: "decline"; approvalId: string }
  | { type: "check_now" };
export interface ChatContext {
  autopilot: boolean; guardrails: Guardrails; currency: string;
  missions: MissionState[]; approvals: Approval[]; receipts: Receipt[];
  recentSteps: AuditStep[]; // newest first, at most 20
}
/** POST /api/chat body (forwarded to AGENT_BACKEND_URL + "/chat" when set). */
export interface ChatRequest { message: string; context: ChatContext }
export interface ChatReply { reply: string; actions: ChatAction[] }

// --- Client dashboard state (not sent over the wire) ---
export interface MissionState extends Mission { status: MissionStatus; lastChecked?: string; note?: string }
export interface ApprovalUiState { status: "idle" | "pending" | "error"; message?: string }
export interface DashboardState {
  missions: MissionState[];
  steps: AuditStep[];
  events: AgentEvent[];
  approvals: Approval[];
  approvalStates: Record<string, ApprovalUiState>;
  receipts: Receipt[];
  runs: Run[];          // newest last
  recalls: RecallAlert[]; // newest first
  checks: number;       // ticks completed
  ticking: boolean;
  lastTickAt?: string;
  error?: string;
}
/** What useAutopilot() returns; the dashboard components consume this. */
export interface AutopilotApi {
  state: DashboardState;
  enabled: boolean;
  setEnabled(on: boolean): void;
  secondsToNextCheck: number;
  runNow(): void;
  approve(approvalId: string): void;
  decline(approvalId: string): void;
  addMission(title: string, maxPrice: number): void;
  /** Contract: missions mirror the profile wishlist (id = wishlist id, maxPrice = targetPrice). No-op when ids are unchanged. */
  syncWishlist(items: { id: string; title: string; targetPrice: number }[]): void;
}
