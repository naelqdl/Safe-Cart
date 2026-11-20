// Tick step 4: read a listing as UNTRUSTED data. Injection guard = deterministic pattern rules (always on)
// + SIE zero-shot classifier (when keyed). Instructions are dropped; only structured fields go on.
import { sponsors } from './adapters/sponsors.ts';
import type { Recorder } from './trail.ts';

const INJECTION = [
  /<!--[\s\S]*?-->/g,
  /\b(ai|llm)\s+(shopping\s+)?(agents?|assistants?)\b[^.\n]*/gi,
  /\bignore\s+(all\s+|your\s+|previous\s+)*(instructions|budget|rules|limits)\b[^.\n]*/gi,
  /\b(system\s*prompt|you\s+must\s+buy|buy\s+\d+\s+(of\s+these|now))\b[^.\n]*/gi,
];

export interface Inspected { injection: boolean; evidence?: string; cleanText: string; extracted: Record<string, string> }

export async function inspectListing(text: string, title: string, rec: Recorder): Promise<Inspected> {
  const done = rec.start('guard', `Quarantine listing text: ${title}`, { tool: 'rules + sie.classify' });
  const hits = INJECTION.flatMap((re) => [...text.matchAll(re)].map((m) => m[0]));
  const cls = await sponsors.sieDetectInjection(text);
  const sieFlag = cls.ok && !!(cls as any).flagged;
  const injection = hits.length > 0 || sieFlag;
  let clean = text;
  for (const h of hits) clean = clean.replace(h, '[removed: instruction aimed at AI agents]');
  const stepId = done(
    injection ? `Blocked an instruction hidden in the listing (${title})` : `Listing text clean (${title})`,
    {
      status: injection ? 'blocked' : 'ok', flags: injection ? ['injection_blocked'] : undefined,
      model: cls.ok ? (cls as any).model : undefined, latencyMs: cls.ok ? (cls as any).latencyMs : undefined,
      detail: injection ? `found: "${(hits[0] ?? (cls as any).segment ?? 'SIE classifier').slice(0, 120)}" → dropped; planner never sees it${cls.ok ? ` · SIE ${(cls as any).method}: ${sieFlag ? `flagged ${((cls as any).score ?? 0).toFixed(2)}` : 'not flagged'}` : ''}` : cls.ok ? `SIE ${(cls as any).method}: clean (${(cls as any).segmentsChecked ?? 1} segments)` : `rules only (SIE: ${(cls as any).why})`,
    },
  );
  rec.claim({
    text: 'Listing text is untrusted data, never instructions', trust: 'untrusted', verdict: injection ? 'conflict' : 'not_verifiable', loadBearing: false, stepId,
    sources: [{ label: 'merchant listing (untrusted)', snippet: (hits[0] ?? text).slice(0, 160) }],
  });

  const ex = await sponsors.sieExtract(clean.slice(0, 1500), ['brand', 'model number', 'price', 'UPC']);
  const extracted: Record<string, string> = {};
  if (ex.ok) for (const e of (ex as any).entities) extracted[e.label] ??= e.text;
  rec.step('extract', ex.ok ? `Extracted ${Object.keys(extracted).length} fields with SIE GLiNER2` : 'Used structured catalog fields (SIE extract unavailable)', {
    tool: 'sie.extract', model: ex.ok ? (ex as any).model : undefined, latencyMs: ex.ok ? (ex as any).latencyMs : undefined,
    status: ex.ok ? 'ok' : 'warn', detail: ex.ok ? JSON.stringify(extracted).slice(0, 160) : (ex as any).why,
  });
  return { injection, evidence: hits[0], cleanText: clean, extracted };
}
