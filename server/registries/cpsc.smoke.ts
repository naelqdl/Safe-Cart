// npx tsx registries/cpsc.smoke.ts → one OK/FAIL line per picked recall (live CPSC, keyless).
import { seed } from '../src/data.ts';
import { searchRecalls } from './cpsc.ts';

let failed = 0;
for (const r of seed.recalls) {
  const model = r.models[0];
  const q = { productName: r.productName?.split(/\s+/).slice(-1)[0] ?? 'stroller', model };
  const res = await searchRecalls(q);
  const hit = res.recalls.find((x) => x.recallId === r.recallId);
  const ok = !!hit && !res.fromCache;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} cpsc ${r.recallId} model=${model} → ${hit ? `matched (${(hit as any).matchedOn})` : 'no match'} ${res.fromCache ? '[CACHE: ' + res.error + ']' : ''} ${res.latencyMs}ms`);
}
if (!seed.recalls.length) { console.log('FAIL cpsc: no data/recalls/*.json'); failed++; }
process.exit(failed ? 1 : 0);
