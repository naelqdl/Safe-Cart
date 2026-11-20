// Purchase policy: Statsig dynamic config purchase_policy + gate recall_guard via
// ../../integrations/statsig.ts (S-H2) when present; else user.json defaults. /demo/guard overrides locally.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, seed } from '../data.ts';
import { state } from '../state.ts';

export interface Policy { autoBuyLimit: number; minDiscountPct: number; dailyBudget: number; autonomy: 'auto' | 'ask_first'; recallGuard: boolean; source: 'statsig' | 'default'; note: string }

let statsig: any = null;
export async function initPolicy() {
  const mod = join(REPO, 'server/integrations/statsig.ts');
  if (!existsSync(mod)) return 'default (statsig.ts not merged yet)';
  try { statsig = await import(pathToFileURL(mod).href); return 'statsig'; } catch (e) { return `default (statsig import failed: ${(e as Error).message})`; }
}

export async function getPolicy(): Promise<Policy & { latencyMs: number }> {
  const t0 = Date.now();
  const d = seed.user.policyDefaults ?? {};
  let p: Policy = {
    autoBuyLimit: d.autoBuyLimit ?? 150, minDiscountPct: d.minDiscountPct ?? 20, dailyBudget: d.dailyBudget ?? 400,
    autonomy: 'auto', recallGuard: true, source: 'default', note: 'defaults from data/user.json',
  };
  if (statsig?.getPolicy && !process.env.STATSIG_SERVER_KEY?.trim()) p.note = 'defaults from data/user.json (no STATSIG_SERVER_KEY)';
  else if (statsig?.getPolicy) {
    try {
      const s = await statsig.getPolicy();
      p = { ...p, ...pick(s), source: 'statsig', note: 'Statsig purchase_policy + recall_guard' };
    } catch (e) { p.note = `Statsig failed (${(e as Error).message}); using defaults`; }
  }
  if (state.guardOverride !== undefined) { p.recallGuard = state.guardOverride; p.note += ` · recall_guard overridden locally (${state.guardOverride ? 'on' : 'off'})`; }
  return { ...p, latencyMs: Date.now() - t0 };
}

function pick(s: any): Partial<Policy> {
  const o: Partial<Policy> = {};
  for (const k of ['autoBuyLimit', 'minDiscountPct', 'dailyBudget'] as const) if (typeof s?.[k] === 'number') o[k] = s[k];
  if (s?.autonomy === 'auto' || s?.autonomy === 'ask_first') o.autonomy = s.autonomy;
  if (typeof s?.recallGuard === 'boolean') o.recallGuard = s.recallGuard;
  return o;
}
