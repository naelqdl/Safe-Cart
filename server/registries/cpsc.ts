// CPSC recall client (S-J2, owner cc). Keyless: https://www.saferproducts.gov/RestWebServices/Recall
// CPSC records usually leave Products[].Model empty and state model numbers in Description/Title,
// so matching normalizes model strings and searches the whole record text.
// On network failure it falls back to data/recalls/*.json and sets fromCache:true (the trail must say so).
import { loadSeed, normalizeRawRecall, seed, type Recall } from '../src/data.ts';

const BASE = 'https://www.saferproducts.gov/RestWebServices/Recall';
export interface CpscResult { recalls: (Recall & { matchedOn?: string })[]; latencyMs: number; url: string; fromCache: boolean; error?: string }

export const normModel = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Does this recall name this model number (or UPC)? Model must be ≥4 normalized chars. */
export function recallMentions(r: Recall & { _text?: string }, model?: string, upc?: string): string | undefined {
  const m = model ? normModel(model) : '';
  if (m.length >= 4) {
    if (r.models.some((x) => normModel(x) === m)) return `model ${model}`;
    const text = normModel(`${r._text ?? ''} ${r.title} ${r.models.join(' ')}`);
    if (text.includes(m)) return `model ${model} (in recall text)`;
  }
  if (upc && r.upcs.some((u) => u.replace(/\D/g, '') === upc.replace(/\D/g, ''))) return `UPC ${upc}`;
  return undefined;
}

export async function searchRecalls(q: { productName?: string; model?: string; manufacturer?: string; upc?: string }): Promise<CpscResult> {
  const t0 = Date.now();
  const params = new URLSearchParams({ format: 'json' });
  if (q.productName) params.set('ProductName', q.productName);
  if (q.manufacturer) params.set('Manufacturer', q.manufacturer);
  const url = `${BASE}?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as any[];
      const recalls = raw.map((r) => {
        const n = { ...normalizeRawRecall(r), _text: `${r.Description ?? ''} ${r.Title ?? ''} ${(r.Products ?? []).map((p: any) => `${p.Name} ${p.Model}`).join(' ')}` };
        // Prefer our curated normalized record (models parsed from the description) when we have it.
        const curated = seed.recalls.find((c) => c.recallId === n.recallId);
        const merged = curated ? { ...n, models: curated.models.length ? curated.models : n.models, upcs: curated.upcs.length ? curated.upcs : n.upcs } : n;
        return { ...merged, matchedOn: recallMentions(merged, q.model, q.upc) };
      });
      const filtered = q.model || q.upc ? recalls.filter((r) => r.matchedOn) : recalls;
      return { recalls: filtered.map(({ _text, ...r }: any) => r), latencyMs: Date.now() - t0, url, fromCache: false };
    } catch (e) {
      if (attempt === 1) {
        if (!seed.recalls.length) loadSeed();
        const cached = seed.recalls.map((r) => ({ ...r, matchedOn: recallMentions(r, q.model, q.upc) })).filter((r) => (q.model || q.upc ? r.matchedOn : true));
        return { recalls: cached, latencyMs: Date.now() - t0, url, fromCache: true, error: (e as Error).message };
      }
    }
  }
  throw new Error('unreachable');
}
