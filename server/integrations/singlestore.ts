// SingleStore client for SafeCart (S-H1, owner hz; brief plans/hz.md#H1). SingleStore speaks the MySQL
// wire protocol, so this uses mysql2/promise with S2_URL (mysql://user:pass@host:3306/db).
// One DB holds catalog, price history, wishlist, owned items, recalls and the audit ledger.
// No agent logic: typed reads/writes + latencyMs, 2 retries on dropped connections.
import mysql from 'mysql2/promise';
import { IntegrationError, requireEnv, sleep, timed } from './_lib.ts';

const S = 'singlestore';
let pool: mysql.Pool | undefined;

function getPool(): mysql.Pool {
  if (pool) return pool;
  const url = new URL(requireEnv('S2_URL').replace(/^singlestore:/, 'mysql:'));
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '') || undefined,
    // SingleStore Helios requires TLS; its certs are publicly trusted. S2_SSL=off for a local dev cluster.
    ssl: local || process.env.S2_SSL === 'off' ? undefined : { rejectUnauthorized: true },
    connectionLimit: 5,
    connectTimeout: 10_000,
    decimalNumbers: true, // DECIMAL → number
    dateStrings: true, // DATETIME → 'YYYY-MM-DD HH:MM:SS' strings (no TZ surprises)
    multipleStatements: false,
  });
  return pool;
}

const TRANSIENT = new Set(['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED']);

/** Raw query. Retries twice on dropped connections. Throws IntegrationError with the server's message. */
export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [rows] = await getPool().query(sql, params);
      return (Array.isArray(rows) ? rows : [rows]) as T[];
    } catch (e: any) {
      if (TRANSIENT.has(e?.code) && attempt < 2) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      if (e instanceof IntegrationError) throw e;
      throw new IntegrationError(S, e?.errno ?? 0, `${e?.sqlMessage ?? e?.message ?? e}`, e?.code);
    }
  }
}

export async function close(): Promise<void> {
  const p = pool;
  pool = undefined;
  await p?.end();
}

export const ping = () => timed(async () => ({ ok: (await query<{ ok: number }>('SELECT 1 AS ok'))[0]?.ok === 1 }));

const json = (v: unknown): any => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
const strList = (v: unknown): string[] => (Array.isArray(json(v)) ? (json(v) as unknown[]).map(String) : []);

// ---------- domain rows ----------
export interface WishlistRow { id: string; userId: string; sku: string; title: string; brand: string; model: string; upc: string; category: string; price: number; listPrice: number; targetPrice: number; priority: number; discountPct: number }
export interface OwnedRow { id: string; userId: string; title: string; brand: string; model: string; upc: string; purchasedAt: string; merchant: string; orderRef: string; source: string }
export interface RecallRow { recallId: string; title: string; brands: string[]; models: string[]; upcs: string[]; hazard: string; remedy: string; url: string; publishedAt: string | null; sensoContentId: string | null; activeInDemo: boolean }
export interface ProductRow { sku: string; title: string; brand: string; model: string; upc: string; category: string; price: number; listPrice: number; url: string; descr: string; attrs: Record<string, unknown> | null; score?: number }

const toRecall = (r: any): RecallRow => ({
  recallId: r.recall_id, title: r.title, brands: strList(r.brands), models: strList(r.models), upcs: strList(r.upcs),
  hazard: r.hazard ?? '', remedy: r.remedy ?? '', url: r.url ?? '', publishedAt: r.published_at ?? null,
  sensoContentId: r.senso_content_id ?? null, activeInDemo: !!r.active_in_demo,
});
const toOwned = (r: any): OwnedRow => ({
  id: r.id, userId: r.user_id, title: r.title, brand: r.brand ?? '', model: r.model ?? '', upc: r.upc ?? '',
  purchasedAt: r.purchased_at, merchant: r.merchant ?? '', orderRef: r.order_ref ?? '', source: r.source ?? '',
});
const toProduct = (r: any): ProductRow => ({
  sku: r.sku, title: r.title, brand: r.brand ?? '', model: r.model ?? '', upc: r.upc ?? '', category: r.category ?? '',
  price: Number(r.price), listPrice: Number(r.list_price), url: r.url ?? '', descr: r.descr ?? '', attrs: json(r.attrs),
  ...(r.score !== undefined ? { score: Number(r.score) } : {}),
});

// ---------- recall matching (pure; exported for tests) ----------
/** Model/UPC normalisation: case, spaces, dashes, dots and slashes don't matter ("ZS-100 " = "zs100"). */
export const norm = (s: string) => s.toUpperCase().replace(/[\s\-_./]/g, '');

/** Why an item matches a recall, or null. Model or UPC match = strong; brand + model prefix = weak. */
export function matchesRecall(item: { brand?: string; model?: string; upc?: string }, recall: Pick<RecallRow, 'brands' | 'models' | 'upcs'>): 'model' | 'upc' | null {
  const m = norm(item.model ?? '');
  const u = (item.upc ?? '').replace(/\D/g, '');
  if (m && recall.models.some((x) => norm(x) === m)) return 'model';
  if (u.length >= 8 && recall.upcs.some((x) => x.replace(/\D/g, '') === u)) return 'upc';
  return null;
}

// ---------- reads ----------
export function getWishlist(userId = 'maya') {
  return timed(async () => {
    const rows = await query(
      `SELECT w.id, w.user_id, w.sku, w.target_price, w.priority, p.title, p.brand, p.model, p.upc, p.category, p.price, p.list_price
       FROM wishlist w JOIN products p ON p.sku = w.sku WHERE w.user_id = ? ORDER BY w.priority, w.id`, [userId]);
    const items: WishlistRow[] = rows.map((r: any) => ({
      id: r.id, userId: r.user_id, sku: r.sku, title: r.title, brand: r.brand ?? '', model: r.model ?? '', upc: r.upc ?? '',
      category: r.category ?? '', price: Number(r.price), listPrice: Number(r.list_price), targetPrice: Number(r.target_price), priority: Number(r.priority),
      discountPct: r.list_price > 0 ? Math.round((1 - Number(r.price) / Number(r.list_price)) * 1000) / 10 : 0,
    }));
    return { items };
  });
}

export function getOwned(userId = 'maya') {
  return timed(async () => ({ items: (await query('SELECT * FROM owned_items WHERE user_id = ? ORDER BY purchased_at DESC', [userId])).map(toOwned) }));
}

export function getProduct(sku: string) {
  return timed(async () => {
    const [r] = await query('SELECT * FROM products WHERE sku = ?', [sku]);
    return { product: r ? toProduct(r) : null };
  });
}

export function getRecalls(o: { activeOnly?: boolean } = {}) {
  return timed(async () => ({ recalls: (await query(`SELECT * FROM recalls${o.activeOnly ? ' WHERE active_in_demo = TRUE' : ''} ORDER BY published_at DESC`)).map(toRecall) }));
}

/** Owned items hit by a recall (model/UPC; JSON arrays read from the recalls row). */
export function matchOwnedToRecall(recallId: string, userId = 'maya') {
  return timed(async () => {
    const [r] = await query('SELECT * FROM recalls WHERE recall_id = ?', [recallId]);
    if (!r) throw new IntegrationError(S, 404, `recall ${recallId} not in recalls table`, 'not_found');
    const recall = toRecall(r);
    const owned = (await query('SELECT * FROM owned_items WHERE user_id = ?', [userId])).map(toOwned);
    const items = owned.flatMap((o) => {
      const by = matchesRecall(o, recall);
      return by ? [{ ...o, matchedBy: by }] : [];
    });
    return { recall, items };
  });
}

/** Recalls covering a product (model/UPC). Empty = no recall in our table (still check CPSC live). */
export function recallsForProduct(p: { brand?: string; model?: string; upc?: string }) {
  return timed(async () => {
    const all = (await query('SELECT * FROM recalls')).map(toRecall);
    return { recalls: all.flatMap((r) => { const by = matchesRecall(p, r); return by ? [{ ...r, matchedBy: by }] : []; }) };
  });
}

/** Full-text search terms: letters/digits only (FTS v2 uses Lucene syntax; strip operators). */
export const ftsTerms = (text: string) =>
  text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !['AND', 'OR', 'NOT', 'TO'].includes(w)).slice(0, 12).join(' ');

/** Safe alternatives: same category, ≤ maxPrice, excluding recalled models and avoided brands, ranked by full-text relevance. */
export function findAlternatives(o: { category: string; maxPrice: number; excludeModels?: string[]; excludeBrands?: string[]; text?: string; limit?: number }) {
  return timed(async () => {
    const where = ['category = ?', 'price <= ?'];
    const params: unknown[] = [o.category, o.maxPrice];
    if (o.excludeModels?.length) { where.push(`model NOT IN (${o.excludeModels.map(() => '?').join(',')})`); params.push(...o.excludeModels); }
    if (o.excludeBrands?.length) { where.push(`brand NOT IN (${o.excludeBrands.map(() => '?').join(',')})`); params.push(...o.excludeBrands); }
    const limit = Math.min(Math.max(o.limit ?? 10, 1), 50);
    const terms = ftsTerms(o.text ?? '');
    let rows: any[];
    let mode: 'fulltext' | 'price' = 'price';
    if (terms) {
      try {
        rows = await query(`SELECT *, MATCH(TABLE products) AGAINST(?) AS score FROM products WHERE ${where.join(' AND ')} ORDER BY score DESC, price ASC LIMIT ${limit}`, [terms, ...params]);
        mode = 'fulltext';
      } catch (e) {
        // full-text index missing/not flushed yet: fall back to price order rather than fail the tick
        rows = await query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY price ASC LIMIT ${limit}`, params);
      }
    } else rows = await query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY price ASC LIMIT ${limit}`, params);
    // excluded models are compared exactly in SQL; also drop normalised matches ("ZS 100" vs "ZS-100")
    const ex = new Set((o.excludeModels ?? []).map(norm));
    return { items: rows.map(toProduct).filter((p) => !ex.has(norm(p.model))), mode };
  });
}

// ---------- writes ----------
export function recordPrice(sku: string, price: number) {
  return timed(async () => {
    await query('INSERT INTO price_obs (sku, price, observed_at) VALUES (?, ?, NOW(6))', [sku, price]);
    return { ok: true };
  });
}

/** Mirror a merchant price change (/demo/sale): update the catalog and record the observation. */
export function setPrice(sku: string, price: number) {
  return timed(async () => {
    await query('UPDATE products SET price = ? WHERE sku = ?', [price, sku]);
    await query('INSERT INTO price_obs (sku, price, observed_at) VALUES (?, ?, NOW(6))', [sku, price]);
    return { ok: true };
  });
}

export interface LedgerEntry { runId: string; kind: string; title: string; sponsor?: string; detail?: unknown; at?: Date | string }

/** Append audit rows (one or many, one INSERT). kind ≤ 20 chars, sponsor ≤ 30. */
export function logLedger(entries: LedgerEntry | LedgerEntry[]) {
  return timed(async () => {
    const list = Array.isArray(entries) ? entries : [entries];
    if (!list.length) return { inserted: 0 };
    const at = (e: LedgerEntry) => (e.at ? new Date(e.at) : new Date()).toISOString().replace('T', ' ').replace('Z', '');
    const values = list.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = list.flatMap((e) => [e.runId.slice(0, 60), at(e), e.kind.slice(0, 20), e.title, (e.sponsor ?? '').slice(0, 30), e.detail === undefined ? null : JSON.stringify(e.detail)]);
    await query(`INSERT INTO ledger (run_id, at, kind, title, sponsor, detail) VALUES ${values}`, params);
    return { inserted: list.length };
  });
}

export function getLedger(o: { runId?: string; limit?: number } = {}) {
  return timed(async () => {
    const limit = Math.min(Math.max(o.limit ?? 100, 1), 1000);
    const rows = o.runId ? await query(`SELECT * FROM ledger WHERE run_id = ? ORDER BY at LIMIT ${limit}`, [o.runId]) : await query(`SELECT * FROM ledger ORDER BY at DESC LIMIT ${limit}`);
    return { rows: rows.map((r: any) => ({ id: Number(r.id), runId: r.run_id, at: r.at, kind: r.kind, title: r.title, sponsor: r.sponsor, detail: json(r.detail) })) };
  });
}

/** /demo/recall: mark a recall as newly published so the next tick sweeps owned items. */
export function activateRecall(recallId: string) {
  return timed(async () => {
    const r: any = await query('UPDATE recalls SET active_in_demo = TRUE, published_at = NOW() WHERE recall_id = ?', [recallId]);
    const affected = r[0]?.affectedRows ?? 0;
    if (!affected) throw new IntegrationError(S, 404, `recall ${recallId} not in recalls table`, 'not_found');
    return { ok: true };
  });
}

/**
 * /demo/reset: restore seed prices, deactivate demo recalls, clear the ledger and post-seed price history.
 * seedPrices = {sku: price} from data/catalog.json (seed/seed-singlestore.ts → resetFromCatalog()).
 */
export function resetDemo(userId = 'maya', seedPrices: Record<string, number> = {}) {
  return timed(async () => {
    for (const [sku, price] of Object.entries(seedPrices)) await query('UPDATE products SET price = ? WHERE sku = ?', [price, sku]);
    await query('UPDATE recalls SET active_in_demo = FALSE');
    await query('DELETE FROM ledger');
    await query("DELETE FROM owned_items WHERE user_id = ? AND source = 'replacement'", [userId]);
    return { ok: true, pricesRestored: Object.keys(seedPrices).length };
  });
}
