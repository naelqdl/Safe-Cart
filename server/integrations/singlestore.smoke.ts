// npx tsx server/integrations/singlestore.smoke.ts   (run seed/seed-singlestore.ts first)
// One OK/FAIL line per export. Writes go to a smoke run id / are restored afterwards.
import { requireEnv, smoke } from './_lib.ts';
import * as s2 from './singlestore.ts';

const run = `smoke-${Date.now()}`;
const need = () => requireEnv('S2_URL');
let firstRecall: s2.RecallRow | undefined;
let firstProduct: s2.ProductRow | undefined;

await smoke('singlestore', [
  ['ping', async () => { need(); const r = await s2.ping(); if (!r.ok) throw new Error('SELECT 1 failed'); return `${r.latencyMs}ms`; }],
  ['query(tables)', async () => {
    need();
    const t = await s2.query<{ n: string }>("SELECT table_name AS n FROM information_schema.tables WHERE table_schema = DATABASE()");
    const names = t.map((x) => x.n);
    const missing = ['products', 'price_obs', 'wishlist', 'owned_items', 'recalls', 'ledger'].filter((x) => !names.includes(x));
    if (missing.length) throw new Error(`missing tables: ${missing.join(', ')} (run seed/seed-singlestore.ts)`);
    return `6/6 tables`;
  }],
  ['getWishlist', async () => { need(); const r = await s2.getWishlist(); return `${r.items.length} items · ${r.latencyMs}ms`; }],
  ['getOwned', async () => { need(); const r = await s2.getOwned(); return `${r.items.length} items · ${r.latencyMs}ms`; }],
  ['getRecalls', async () => { need(); const r = await s2.getRecalls(); firstRecall = r.recalls[0]; return `${r.recalls.length} recalls · ${r.latencyMs}ms`; }],
  ['matchOwnedToRecall', async () => {
    need();
    if (!firstRecall) return 'no recalls seeded yet (data/recalls)';
    const r = await s2.matchOwnedToRecall(firstRecall.recallId);
    return `${firstRecall.recallId} → ${r.items.map((i) => `${i.title} (${i.matchedBy})`).join(', ') || 'no owned match'} · ${r.latencyMs}ms`;
  }],
  ['recallsForProduct', async () => {
    need();
    if (!firstRecall) return 'no recalls seeded yet';
    const r = await s2.recallsForProduct({ model: firstRecall.models[0] });
    if (!r.recalls.length) throw new Error(`model ${firstRecall.models[0]} did not match its own recall`);
    return `${firstRecall.models[0]} → ${r.recalls.map((x) => x.recallId).join(', ')} · ${r.latencyMs}ms`;
  }],
  ['findAlternatives', async () => {
    need();
    const [p] = await s2.query("SELECT * FROM products ORDER BY price DESC LIMIT 1");
    if (!p) throw new Error('no products seeded');
    firstProduct = (await s2.getProduct(p.sku)).product!;
    const r = await s2.findAlternatives({ category: firstProduct.category, maxPrice: firstProduct.price, excludeModels: [firstProduct.model], text: firstProduct.title });
    return `${r.items.length} alternatives (${r.mode}) for ${firstProduct.sku} · ${r.latencyMs}ms`;
  }],
  ['recordPrice+setPrice', async () => {
    need();
    if (!firstProduct) throw new Error('no product');
    await s2.recordPrice(firstProduct.sku, firstProduct.price);
    await s2.setPrice(firstProduct.sku, firstProduct.price); // same price: no visible change
    return firstProduct.sku;
  }],
  ['logLedger+getLedger', async () => {
    need();
    await s2.logLedger([{ runId: run, kind: 'smoke', title: 'smoke row 1', sponsor: 'singlestore', detail: { ok: true } }, { runId: run, kind: 'smoke', title: 'smoke row 2' }]);
    const r = await s2.getLedger({ runId: run });
    if (r.rows.length !== 2) throw new Error(`expected 2 rows, got ${r.rows.length}`);
    await s2.query('DELETE FROM ledger WHERE run_id = ?', [run]);
    return `2 rows round-trip · ${r.latencyMs}ms`;
  }],
  ['activateRecall', async () => {
    need();
    if (!firstRecall) return 'no recalls seeded yet';
    await s2.activateRecall(firstRecall.recallId);
    const on = (await s2.getRecalls({ activeOnly: true })).recalls.some((r) => r.recallId === firstRecall!.recallId);
    await s2.query('UPDATE recalls SET active_in_demo = FALSE WHERE recall_id = ?', [firstRecall.recallId]);
    if (!on) throw new Error('not active after activateRecall');
    return firstRecall.recallId;
  }],
  ['resetDemo', async () => { need(); const r = await s2.resetDemo('maya', {}); return `ok · ${r.latencyMs}ms`; }],
]);
await s2.close().catch(() => {});
