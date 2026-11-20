// Wire types: K-dashboard v1 (web/src/lib/agent/types.ts) + K-trail (web/src/lib/agent/trail.ts)
// + SafeCart additions (plans/*.md "SafeCart wire types"). The server emits exactly these.
export type { Run, Step, Claim, Decision, Action, Trust, Verdict as ClaimVerdict } from '../../web/src/lib/agent/trail.ts';
export type {
  AuditStep, StepKind, StepStatus, SourceRef, Candidate, Mission, Guardrails, TickRequest, Approval,
  ActionRequest, ActionResult, ChatRequest, ChatReply, ChatAction,
} from '../../web/src/lib/agent/types.ts';
import type { Receipt as BaseReceipt, AgentEvent as BaseEvent } from '../../web/src/lib/agent/types.ts';

export interface SafetyCheck {
  status: 'clear' | 'recalled' | 'unknown'; // unknown = every source failed; never auto-buy on unknown
  sources: { label: string; url?: string }[];
  checkedAt: string;
  recallId?: string;
}
export type Receipt = BaseReceipt & { safety?: SafetyCheck };
export interface RecallAlert {
  id: string; recallId: string; recallTitle: string; hazard: string; remedy: string; url: string;
  itemTitle: string; itemKind: 'owned' | 'wishlist';
  action: 'refund_claim_filed' | 'purchase_skipped' | 'replacement_bought' | 'needs_you';
  claimRef?: string; replacementTitle?: string; at: string;
}
export interface Profile {
  name: string;
  preferences: { label: string; source: 'user' | 'memory' }[];
  wishlist: { id: string; sku: string; title: string; targetPrice: number; price: number; listPrice: number; onSale: boolean; safety?: SafetyCheck }[];
  owned: { id: string; title: string; model: string; purchasedAt: string; merchant: string; safety?: SafetyCheck }[];
  policy: { autoBuyLimit: number; minDiscountPct: number; autonomy: 'auto' | 'ask_first'; recallGuard: boolean; source: 'statsig' | 'default' };
}
export type AgentEvent =
  | Exclude<BaseEvent, { type: 'receipt' }>
  | { type: 'receipt'; receipt: Receipt }
  | { type: 'recall'; alert: RecallAlert };
