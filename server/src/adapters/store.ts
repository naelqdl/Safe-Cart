// SingleStore adapter. Uses ../../integrations/singlestore.ts (S-H1) when it exists and S2_URL is set;
// otherwise the same functions run on the local seed (backend 'local'), and the trail says so.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, seed, type CatalogItem, type Recall } from '../data.ts';
import { recallMentions } from '../../registries/cpsc.ts';
import { state, type LedgerRow } from '../state.ts';

type S2 = Record<string, (...a: any[]) => Promise<any>>;
let s2: S2 | null = null;
export let backend: 'singlestore' | 'local' = 'local';
export let backendNote = 'S2_URL or integrations/singlestore.ts missing';

export async function initStore() {
  const mod = join(REPO, 'server/integrations/singlestore.ts');
  if (!process.env.S2_URL || !existsSync(mod)) return backend;
  try {
    s2 = (await import(pathToFileURL(mod).href)) as S2; // file:// URL: absolute Windows paths (c:\...) fail as bare specifiers
    if (s2.ping) await s2.ping();
    backend = 'singlestore'; backendNote = 'connected';
  } catch (e) { s2 = null; backend = 'local'; backendNote = `SingleStore error: ${(e as Error).message}`; }
  return backend;
}

async function viaS2<T>(fn: string, args: any[], local: () => T): Promise<T> {
  if (s2?.[fn]) {
    try { return (await s2[fn](...args)) as T; } catch (e) { backendNote = `${fn} failed: ${(e as Error).message}`; }
  }
  return local();
}

export const store = {
  recallsForProduct: (p: { brand?: string; model: string; upc?: string; title?: string }) =>
    viaS2<Recall[]>('recallsForProduct', [p], () => seed.recalls.filter((r) => recallMentions(r, p.model, p.upc))),
  matchOwnedToRecall: (recallId: string) =>
    viaS2('matchOwnedToRecall', [recallId], () => {
      const r = seed.recalls.find((x) => x.recallId === recallId);
      return r ? seed.owned.filter((o) => recallMentions(r, o.model, o.upc)) : [];
    }),
  findAlternatives: (q: { category: string; maxPrice: number; excludeModels: string[]; avoidBrands: string[]; excludeSku?: string }) =>
    viaS2<CatalogItem[]>('findAlternatives', [q], () => {
      const ex = new Set(q.excludeModels.map((m) => m.toUpperCase()));
      const avoid = new Set(q.avoidBrands.map((b) => b.toLowerCase()));
      return seed.catalog.filter((c) => c.category === q.category && c.sku !== q.excludeSku && !ex.has(c.model.toUpperCase())
        && !avoid.has(c.brand.toLowerCase()) && (state.prices.get(c.sku)?.price ?? c.price) <= q.maxPrice);
    }),
  logLedger: async (row: LedgerRow) => {
    state.ledger.push(row);
    if (s2?.logLedger) { try { await s2.logLedger(row); } catch { /* ledger also kept in memory */ } }
  },
  activateRecall: (recallId: string) => viaS2('activateRecall', [recallId], () => true),
  resetDemo: () => viaS2('resetDemo', [], () => true),
};
