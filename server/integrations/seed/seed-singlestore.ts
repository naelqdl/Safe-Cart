// SingleStore seed for SafeCart (S-H1, owner hz). Applies sql/schema.sql, then TRUNCATE + insert from
// data/catalog.json, data/wishlist.json, data/owned.json, data/recalls/*.json, data/user.json (cc, S-J1).
// Idempotent. If data/ is not there yet, seeds 3 PLACEHOLDER products only (never placeholder recalls).
//   npx tsx server/integrations/seed/seed-singlestore.ts [--data <dir>] [--dry-run]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { close, query, resetDemo } from '../singlestore.ts';
import { REPO_DATA_DIR } from './kb.ts';
import { parseRecall } from './seed-senso.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Read a JSON data file. Tolerates a leading "// source …" / "# source …" line and a wrapper object. */
export function readData(path: string): any {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/^\s*(\/\/|#)[^\n]*\n/, '');
  return JSON.parse(text);
}
/** The first array in a file: the file itself, or {items|products|wishlist|owned|data: [...]}, or any array value. */
export function arrayOf(v: any, ...keys: string[]): any[] {
  if (Array.isArray(v)) return v;
  for (const k of [...keys, 'items', 'data']) if (Array.isArray(v?.[k])) return v[k];
  const first = v && typeof v === 'object' ? Object.values(v).find(Array.isArray) : undefined;
  return (first as any[]) ?? [];
}
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : d);
const s = (v: unknown, max = 1000) => (v === undefined || v === null ? '' : String(v)).slice(0, max);
/** ISO / date-ish → 'YYYY-MM-DD HH:MM:SS' (or null). */
export const dt = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
};

export interface SeedData { userId: string; products: any[]; wishlist: any[]; owned: any[]; recalls: ReturnType<typeof parseRecall>[]; placeholder: boolean }

export function loadSeedData(dir = REPO_DATA_DIR): SeedData {
  const f = (n: string) => join(dir, n);
  const userId = existsSync(f('user.json')) ? s(readData(f('user.json'))?.id ?? readData(f('user.json'))?.userId ?? 'maya', 40) || 'maya' : 'maya';
  const products = existsSync(f('catalog.json')) ? arrayOf(readData(f('catalog.json')), 'products', 'catalog') : [];
  const wishlist = existsSync(f('wishlist.json')) ? arrayOf(readData(f('wishlist.json')), 'wishlist') : [];
  const owned = existsSync(f('owned.json')) ? arrayOf(readData(f('owned.json')), 'owned') : [];
  const rdir = f('recalls');
  const recalls = existsSync(rdir) ? readdirSync(rdir).filter((x) => x.endsWith('.json')).map((x) => parseRecall(join(rdir, x))) : [];
  if (products.length) return { userId, products, wishlist, owned, recalls, placeholder: false };
  return {
    userId, wishlist: [], owned: [], recalls, placeholder: true,
    products: [1, 2, 3].map((i) => ({ sku: `PLACEHOLDER-${i}`, title: `PLACEHOLDER product ${i} (data/catalog.json not ready)`, brand: 'Placeholder', model: `PH-${i}`, category: 'placeholder', price: 10 * i, listPrice: 12 * i, descr: 'placeholder row until cc lands data/**' })),
  };
}

/** Seed prices by sku, for resetDemo(). */
export const seedPrices = (d: SeedData) => Object.fromEntries(d.products.map((p) => [s(p.sku, 64), num(p.price)]));

async function insertMany(table: string, cols: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ')}`, chunk.flat());
  }
}

export async function applySchema(): Promise<void> {
  const sql = readFileSync(resolve(here, '../sql/schema.sql'), 'utf8');
  const stmts = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((x) => x.trim()).filter(Boolean);
  for (const st of stmts) await query(st);
}

export async function seedSingleStore(o: { dataDir?: string; dryRun?: boolean } = {}) {
  const d = loadSeedData(o.dataDir);
  const counts = { products: d.products.length, wishlist: d.wishlist.length, owned: d.owned.length, recalls: d.recalls.length };
  if (o.dryRun) return { ...counts, placeholder: d.placeholder, fulltext: 'dry-run' };
  await applySchema();
  for (const t of ['products', 'price_obs', 'wishlist', 'owned_items', 'recalls']) await query(`TRUNCATE TABLE ${t}`);

  await insertMany('products', ['sku', 'title', 'brand', 'model', 'upc', 'category', 'price', 'list_price', 'url', 'descr', 'attrs'],
    d.products.map((p) => [s(p.sku, 64), s(p.title), s(p.brand, 80), s(p.model, 120), s(p.upc, 20), s(p.category, 40), num(p.price), num(p.listPrice ?? p.list_price, num(p.price)), s(p.url), s(p.descr ?? p.description, 20000), p.attrs ? JSON.stringify(p.attrs) : null]));
  await insertMany('price_obs', ['sku', 'price', 'observed_at'], d.products.map((p) => [s(p.sku, 64), num(p.price), new Date().toISOString().slice(0, 23).replace('T', ' ')]));
  await insertMany('wishlist', ['id', 'user_id', 'sku', 'target_price', 'priority', 'added_at'],
    d.wishlist.map((w, i) => [s(w.id ?? `w${i + 1}`, 40), s(w.userId ?? d.userId, 40), s(w.sku, 64), num(w.targetPrice ?? w.target_price), num(w.priority, i + 1), dt(w.addedAt) ?? dt(new Date())]));
  await insertMany('owned_items', ['id', 'user_id', 'title', 'brand', 'model', 'upc', 'purchased_at', 'merchant', 'order_ref', 'source'],
    d.owned.map((o, i) => [s(o.id ?? `o${i + 1}`, 40), s(o.userId ?? d.userId, 40), s(o.title), s(o.brand, 80), s(o.model, 120), s(o.upc, 20), dt(o.purchasedAt ?? o.purchased_at), s(o.merchant, 80), s(o.orderRef ?? o.order_ref, 80), s(o.source ?? 'seed', 40)]));
  await insertMany('recalls', ['recall_id', 'title', 'brands', 'models', 'upcs', 'hazard', 'remedy', 'url', 'published_at', 'senso_content_id', 'active_in_demo'],
    d.recalls.map((r) => [r.recallId, r.title, JSON.stringify(r.brands), JSON.stringify(r.models), JSON.stringify(r.upcs), r.hazard, r.remedy, r.url, dt(r.publishedAt), null, false]));

  let fulltext = 'created';
  try {
    await query('ALTER TABLE products ADD FULLTEXT USING VERSION 2 ft (title, descr)');
  } catch (e) {
    fulltext = /duplicate|exists/i.test((e as Error).message) ? 'exists' : `failed: ${(e as Error).message}`;
  }
  try {
    await query('OPTIMIZE TABLE products FLUSH');
  } catch (e) {
    fulltext += ` (flush failed: ${(e as Error).message})`;
  }
  await resetDemo(d.userId, {}); // clear ledger + demo flags
  return { ...counts, placeholder: d.placeholder, fulltext };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--data');
  try {
    const r = await seedSingleStore({ dataDir: i >= 0 ? resolve(args[i + 1]) : undefined, dryRun: args.includes('--dry-run') });
    console.log(`OK   seed-singlestore products=${r.products} wishlist=${r.wishlist} owned=${r.owned} recalls=${r.recalls} fulltext=${r.fulltext}${r.placeholder ? '  (PLACEHOLDER products: data/catalog.json not ready)' : ''}`);
  } catch (e) {
    console.log(`FAIL seed-singlestore | ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await close().catch(() => {});
  }
}
