// Safety check (tick step 5). Deterministic: code decides clear/recalled/unknown; no model guesses.
// Sources run in parallel: recall table (SingleStore/local) ∪ live CPSC ∪ Senso search ∪ Senso fact-check.
// recalled if ANY source matches the exact model/UPC; unknown if EVERY source failed (never auto-buy on unknown).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, seed, type Recall } from './data.ts';
import { normModel, searchRecalls } from '../registries/cpsc.ts';
import { backend, store } from './adapters/store.ts';
import { sponsors } from './adapters/sponsors.ts';
import { state } from './state.ts';
import type { Recorder } from './trail.ts';
import type { SafetyCheck } from './wire.ts';

let gate: any = null; // hz's senso-gate.ts recallFactCheck(brand, model), when merged
const gatePath = join(REPO, 'server/integrations/senso-gate.ts');
if (existsSync(gatePath)) gate = await import(gatePath).catch(() => null);

export interface Product { key: string; brand: string; model: string; upc?: string; title: string; category?: string }
export interface SafetyResult { check: SafetyCheck; recall?: Recall }

export async function checkSafety(p: Product, rec: Recorder): Promise<SafetyResult> {
  const done = rec.start('verify', `Safety check: ${p.brand} ${p.model}`, { tool: 'recall-table + cpsc + senso' });
  const sources: SafetyCheck['sources'] = [];
  let recall: Recall | undefined;
  let ok = 0, failed = 0;
  const why: string[] = [];

  const [table, cpsc, search, fact] = await Promise.allSettled([
    store.recallsForProduct({ brand: p.brand, model: p.model, upc: p.upc, title: p.title }),
    searchRecalls({ productName: (p.category ?? p.title).replace(/_/g, ' '), model: p.model, upc: p.upc }),
    sponsors.sensoSearch(`recall ${p.brand} ${p.model} ${p.title}`, 5),
    gate?.recallFactCheck ? gate.recallFactCheck(p.brand, p.model).then((r: any) => ({ ok: true, ...r }), (e: Error) => ({ ok: false, why: e.message }))
      : sponsors.sensoFactCheck(`The ${p.brand} ${p.model} (${p.title}) has no active safety recall.`, `Is the ${p.brand} ${p.model} recalled?`),
  ]);

  // 1. Recall table
  if (table.status === 'fulfilled') {
    ok++;
    const hit = table.value[0];
    sources.push({ label: `Recall table (${backend === 'singlestore' ? 'SingleStore' : 'local seed'})${hit ? `: ${hit.recallId}` : ': no match'}` });
    if (hit) { recall = hit; why.push(`recall table → ${hit.recallId}`); }
  } else { failed++; why.push(`recall table failed`); }

  // 2. Live CPSC
  if (cpsc.status === 'fulfilled') {
    const c = cpsc.value;
    if (c.fromCache) { failed++; why.push(`CPSC offline (${c.error}); cached copy used`); } else ok++;
    const hit = c.recalls[0];
    sources.push({ label: `CPSC recall API${c.fromCache ? ' (CACHED)' : ' (live)'}${hit ? `: recall ${hit.recallId}` : ': no match'} · ${c.latencyMs}ms`, url: hit?.url ?? c.url });
    if (hit) { recall ??= seed.recalls.find((r) => r.recallId === hit.recallId) ?? hit; why.push(`CPSC → ${hit.recallId} (${hit.matchedOn})`); }
  } else { failed++; why.push('CPSC failed'); }

  // 3. Senso search (trusted KB of recall notices)
  if (search.status === 'fulfilled' && search.value.ok) {
    ok++;
    const m = normModel(p.model);
    const hit = (search.value as any).passages.find((x: any) => m.length >= 4 && normModel(x.text).includes(m));
    sources.push({ label: `Senso KB${hit ? `: recall notice (content ${hit.contentId}, version ${hit.versionId})` : ': no recall notice'} · ${(search.value as any).latencyMs}ms` });
    if (hit) why.push(`Senso notice ${hit.contentId}`);
    if (hit && !recall) recall = seed.recalls.find((r) => r.models.some((x) => normModel(x) === m));
  } else { failed++; why.push(`Senso search: ${search.status === 'fulfilled' ? (search.value as any).why : 'error'}`); }

  // 4. Senso fact-check of the load-bearing claim "not recalled"
  let factVerdict: string | undefined;
  if (fact.status === 'fulfilled' && (fact.value as any).ok) {
    ok++;
    const v = fact.value as any;
    factVerdict = v.verdict ?? v.claims?.[0]?.verdict ?? (v.recalled ? 'conflict' : undefined);
    sources.push({ label: `Senso fact-check: "${p.model} has no active recall" → ${factVerdict ?? 'n/a'}${v.runId ? ` (run ${v.runId})` : ''}` });
    if (factVerdict === 'conflict') why.push('Senso eval: CONFLICT');
  } else { failed++; why.push(`Senso fact-check: ${fact.status === 'fulfilled' ? (fact.value as any).why : 'error'}`); }

  const recalled = !!recall || factVerdict === 'conflict';
  const status: SafetyCheck['status'] = recalled ? 'recalled' : ok === 0 ? 'unknown' : 'clear';
  const check: SafetyCheck = { status, sources, checkedAt: new Date().toISOString(), recallId: recall?.recallId };
  state.safety.set(p.key, check);

  const stepId = done(
    status === 'recalled' ? `RECALLED: ${p.brand} ${p.model} (CPSC ${recall?.recallId ?? 'Senso'})` : status === 'clear' ? `Safety clear: ${p.brand} ${p.model} (${ok}/${ok + failed} sources answered)` : `Safety UNKNOWN: no source answered for ${p.model}`,
    { status: status === 'clear' ? 'ok' : status === 'recalled' ? 'blocked' : 'warn', flags: status === 'recalled' ? ['conflict'] : undefined, detail: why.join(' · ') || 'no recall found by any source', sources: sources.map((s) => ({ label: s.label, url: s.url })) },
  );
  rec.claim({
    text: `${p.brand} ${p.model} is not under an active recall`, trust: 'trusted', loadBearing: true, stepId,
    verdict: status === 'clear' ? 'verified' : status === 'recalled' ? 'conflict' : 'not_verifiable',
    sources: [
      ...(recall ? [{ label: `CPSC recall ${recall.recallId}: ${recall.title}`, url: recall.url, snippet: recall.hazard.slice(0, 200) }] : []),
      ...sources.map((s) => ({ label: s.label, url: s.url })),
    ],
  });
  return { check, recall };
}
