// One Recorder per case (a wishlist item on sale, or a recall sweep). Every step is:
//  1) a K-trail Step on run.steps, 2) a K-dashboard AuditStep event (activity timeline),
//  3) a ledger row (SingleStore via the store adapter, else in memory).
import type { AgentEvent, AuditStep, Claim, Run, SourceRef, Step } from './wire.ts';
import { nextId, state } from './state.ts';
import { store } from './adapters/store.ts';

type TrailKind = Step['kind'];
const DASH_KIND: Record<TrailKind, AuditStep['kind']> = {
  retrieve: 'fetch', extract: 'fetch', verify: 'compare', guard: 'compare', policy: 'plan', decide: 'decide', act: 'act',
};
const DASH_STATUS: Record<Step['status'], AuditStep['status']> = { ok: 'ok', warn: 'warn', blocked: 'warn', error: 'fail' };

export interface StepOpts {
  tool?: string; model?: string; latencyMs?: number; status?: Step['status']; flags?: Step['flags'];
  detail?: string; sources?: SourceRef[];
}

export class Recorder {
  run: Run;
  constructor(public emit: (e: AgentEvent) => void, public missionId: string | undefined, goal: string, maxUsd: number, constraints: string[]) {
    this.run = {
      id: nextId('run'), status: 'running', startedAt: new Date().toISOString(),
      mandate: { goal, maxUsd, constraints },
      steps: [], claims: [], cost: { usd: 0, tokens: 0, byModel: {} },
    };
    state.runs.set(this.run.id, this.run);
  }

  /** Emit a step as running, then return a finisher that settles it. */
  start(kind: TrailKind, title: string, o: StepOpts = {}) {
    const id = nextId('st');
    const at = new Date().toISOString();
    this.emit({ type: 'step', step: { id, at, kind: DASH_KIND[kind], title, status: 'running', missionId: this.missionId, sources: o.sources } });
    return (title2: string, o2: StepOpts = {}) => this.settle(id, at, kind, title2 || title, { ...o, ...o2 });
  }

  step(kind: TrailKind, title: string, o: StepOpts = {}) {
    return this.settle(nextId('st'), new Date().toISOString(), kind, title, o);
  }

  private settle(id: string, at: string, kind: TrailKind, title: string, o: StepOpts): string {
    const status = o.status ?? 'ok';
    const s: Step = { id, t: at, kind, title, status, tool: o.tool, model: o.model, latencyMs: o.latencyMs, flags: o.flags, detail: o.detail };
    this.run.steps.push(s);
    this.emit({ type: 'step', step: { id, at, kind: DASH_KIND[kind], title, detail: o.detail, sources: o.sources, status: DASH_STATUS[status], missionId: this.missionId } });
    void store.logLedger({ at, runId: this.run.id, stepId: id, kind, title, status, tool: o.tool, latencyMs: o.latencyMs, detail: o.detail });
    return id;
  }

  claim(c: Omit<Claim, 'id'>) {
    const claim: Claim = { id: nextId('cl'), ...c };
    this.run.claims.push(claim);
    return claim.id;
  }

  finish(status: Run['status']) {
    this.run.status = status;
    this.run.endedAt = new Date().toISOString();
    this.emit({ type: 'run', run: this.run as any });
  }
}
