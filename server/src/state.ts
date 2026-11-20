// In-memory demo state for one user (Maya). /demo/reset restores it.
import type { Approval, RecallAlert, Receipt, SafetyCheck } from './wire.ts';
import type { Run } from './wire.ts';

export interface LedgerRow { at: string; runId: string; stepId: string; kind: string; title: string; status: string; tool?: string; latencyMs?: number; detail?: string }
export interface PendingBuy { approvalId: string; missionId: string; sku: string; title: string; price: number; listPrice: number; reason: string; replacingOwnedId?: string }

function fresh() {
  return {
    prices: new Map<string, { price: number; listPrice: number }>(), // local mirror when the merchant is offline
    pendingSweep: new Set<string>(),   // recallIds published via /demo/recall, not yet swept
    sweptRecalls: new Set<string>(),
    bought: new Map<string, Receipt>(), // missionId/ownedId → receipt
    alerts: new Map<string, RecallAlert>(),
    approvals: new Map<string, PendingBuy>(), // candidateId (sku) → pending
    approvalEvents: new Map<string, Approval>(),
    safety: new Map<string, SafetyCheck>(), // sku or owned id → last check
    runs: new Map<string, Run>(),
    ledger: [] as LedgerRow[],
    spentToday: 0,
    injections: new Map<string, string>(), // sku → text planted live via /demo/inject (merchant admin stand-in)
    guardOverride: undefined as boolean | undefined, // local /demo/guard when Statsig is not wired
    seq: 0,
  };
}

export let state = fresh();
export function resetState() { state = fresh(); }
export const nextId = (p: string) => `${p}_${Date.now().toString(36)}${(++state.seq).toString(36)}`;
