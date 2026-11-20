// SingleStore client for SafeCart (S-H1, owner hz; brief plans/hz.md#H1). SingleStore speaks the MySQL
// wire protocol, so this uses mysql2/promise with S2_URL (mysql://user:pass@host:3306/db).
// One DB holds catalog, price history, wishlist, owned items, recalls and the audit ledger.
// No agent logic: typed reads/writes + latencyMs, 2 retries on dropped connections.
import mysql from 'mysql2/promise';
import { IntegrationError, requireEnv, sleep, timed } from './_lib.ts';

const S = 'singlestore';
let pool: mysql.Pool | undefined;

export interface S2Conn { host: string; port: number; user: string; password: string; database: string; local: boolean }

/**
 * Parse S2_URL = mysql://user:password@host[:port]/database. The password may contain ANY character
 * (@ # / ? : %): we split on the LAST '@' instead of using URL(), so it needs no percent-encoding.
 * In .env, wrap the value in double quotes if the password has '#' (else the loader treats it as a comment).
 */
export function parseS2Url(raw: string): S2Conn {
  const v = raw.trim().replace(/^singlestore:/, 'mysql:');
  const m = /^mysql:\/\/([^:@/]+):(.*)@([A-Za-z0-9.-]+)(?::(\d+))?\/([A-Za-z0-9_]*)\/?$/s.exec(v);
  if (!m) throw new IntegrationError(S, 0, 'S2_URL must look like mysql://user:password@host:3306/database (wrap it in double quotes in .env if the password has #)', 'bad_url');
  const [, user, pw, host, port, database] = m;
  // accept a percent-encoded password too, but never mangle a raw one that happens to contain '%'
  let password = pw;
  if (/%[0-9A-Fa-f]{2}/.test(pw)) { try { password = decodeURIComponent(pw); } catch { /* raw */ } }
  return { host, port: Number(port || 3306), user, password, database, local: ['localhost', '127.0.0.1', '::1'].includes(host) };
}

function getPool(): mysql.Pool {
  if (pool) return pool;
  const c = parseS2Url(requireEnv('S2_URL'));
  pool = mysql.createPool({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database || undefined,
    // SingleStore Helios requires TLS; its certs are publicly trusted. S2_SSL=off for a local dev cluster.
    ssl: c.local || process.env.S2_SSL === 'off' ? undefined : { rejectUnauthorized: true },
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

/** Create the database named in S2_URL if it doesn't exist yet (seed script calls this first). */
export async function ensureDatabase(): Promise<{ database: string; created: boolean }> {
  const c = parseS2Url(requireEnv('S2_URL'));
  const database = c.database;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new IntegrationError(S, 0, `S2_URL must end with /<database name> (letters, digits, _); got "${database}"`, 'bad_url');
  const conn = await mysql
    .createConnection({
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      ssl: c.local || process.env.S2_SSL === 'off' ? undefined : { rejectUnauthorized: true },
      connectTimeout: 15_000,
    })
    .catch((e: any) => {
      throw new IntegrationError(S, e?.errno ?? 0, `${e?.sqlMessage ?? e?.message ?? e}`, e?.code);
    });
  try {
    const [rows]: any = await conn.query('SHOW DATABASES');
    const exists = (rows as any[]).some((r) => Object.values(r)[0] === database);
    if (!exists) await conn.query(`CREATE DATABASE ${database}`);
    return { database, created: !exists };
  } finally {
    await conn.end().catch(() => {});
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
/** A list result: a real array (what cc's adapter indexes) with latencyMs (and extras) attached. */
export type Listed<T, X = {}> = T[] & { latencyMs: number } & X;
const listed = <T, X extends object = {}>(t0: number, items: T[], extra?: X): Listed<T, X> => Object.assign(items, { latencyMs: Math.round(performance.now() - t0) }, extra ?? {}) as Listed<T, X>;
const strList = (v: unknown): string[] => (Array.isArray(json(v)) ? (json(v) as unknown[]).map(String) : []);

// ---------- domain rows ----------
export interface WishlistRow { id: string; userId: string; sku: string; title: string; brand: string; model: string; upc: string; category: string; price: number; listPrice: number; targetPrice: number; priority: number; discountPct: number }
export interface OwnedRow { id: string; userId: string; sku: string; category: string; title: string; brand: string; model: string; upc: string; purchasedAt: string; merchant: string; orderRef: string; source: string }
export interface RecallRow { recallId: string; title: string; brands: string[]; models: string[]; upcs: string[]; hazard: string; remedy: string; url: string; publishedAt: string; sensoContentId: string | null; activeInDemo: boolean }
export interface ProductRow { sku: string; title: string; brand: string; model: string; upc: string; category: string; price: number; listPrice: number; url: string; descr: string; attrs: Record<string, string>; score?: number }

const toRecall = (r: any): RecallRow => ({
  recallId: r.recall_id, title: r.title, brands: strList(r.brands), models: strList(r.models), upcs: strList(r.upcs),
  hazard: r.hazard ?? '', remedy: r.remedy ?? '', url: r.url ?? '', publishedAt: r.published_at ?? '',
  sensoContentId: r.senso_content_id ?? null, activeInDemo: !!r.active_in_demo,
});
const toOwned = (r: any): OwnedRow => ({
  id: r.id, userId: r.user_id, sku: r.sku ?? '', category: r.category ?? '', title: r.title, brand: r.brand ?? '', model: r.model ?? '', upc: r.upc ?? '',
  purchasedAt: r.purchased_at, merchant: r.merchant ?? '', orderRef: r.order_ref ?? '', source: r.source ?? '',
});
const toProduct = (r: any): ProductRow => ({
  sku: r.sku, title: r.title, brand: r.brand ?? '', model: r.model ?? '', upc: r.upc ?? '', category: r.category ?? '',
  price: Number(r.price), listPrice: Number(r.list_price), url: r.url ?? '', descr: r.descr ?? '', attrs: (json(r.attrs) && typeof json(r.attrs) === 'object' ? json(r.attrs) : {}) as Record<string, string>,
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

// ---------- reads (list functions return arrays with latencyMs attached: cc's adapter indexes them) ----------
export async function getWishlist(userId = 'maya'): Promise<Listed<WishlistRow>> {
  const t0 = performance.now();
  const rows = await query(
    `SELECT w.id, w.user_id, w.sku, w.target_price, w.priority, p.title, p.brand, p.model, p.upc, p.category, p.price, p.list_price
     FROM wishlist w JOIN products p ON p.sku = w.sku WHERE w.user_id = ? ORDER BY w.priority, w.id`, [userId]);
  return listed(t0, rows.map((r: any) => ({
    id: r.id, userId: r.user_id, sku: r.sku, title: r.title, brand: r.brand ?? '', model: r.model ?? '', upc: r.upc ?? '',
    category: r.category ?? '', price: Number(r.price), listPrice: Number(r.list_price), targetPrice: Number(r.target_price), priority: Number(r.priority),
    discountPct: r.list_price > 0 ? Math.round((1 - Number(r.price) / Number(r.list_price)) * 1000) / 10 : 0,
  })));
}

export async function getOwned(userId = 'maya'): Promise<Listed<OwnedRow>> {
  const t0 = performance.now();
  return listed(t0, (await query('SELECT * FROM owned_items WHERE user_id = ? ORDER BY purchased_at DESC', [userId])).map(toOwned));
}

export function getProduct(sku: string) {
  return timed(async () => {
    const [r] = await query('SELECT * FROM products WHERE sku = ?', [sku]);
    return { product: r ? toProduct(r) : null };
  });
}

export async function getRecalls(o: { activeOnly?: boolean } = {}): Promise<Listed<RecallRow>> {
  const t0 = performance.now();
  return listed(t0, (await query(`SELECT * FROM recalls${o.activeOnly ? ' WHERE active_in_demo = TRUE' : ''} ORDER BY published_at DESC`)).map(toRecall));
}

/** Owned items hit by a recall (normalised model/UPC vs the recall row's JSON arrays). Array of owned items; `.recall` attached. */
export async function matchOwnedToRecall(recallId: string, userId = 'maya'): Promise<Listed<OwnedRow & { matchedBy: 'model' | 'upc' }, { recall: RecallRow }>> {
  const t0 = performance.now();
  const [r] = await query('SELECT * FROM recalls WHERE recall_id = ?', [recallId]);
  if (!r) throw new IntegrationError(S, 404, `recall ${recallId} not in recalls table`, 'not_found');
  const recall = toRecall(r);
  const owned = (await query('SELECT * FROM owned_items WHERE user_id = ?', [userId])).map(toOwned);
  const items = owned.flatMap((o) => {
    const by = matchesRecall(o, recall);
    return by ? [{ ...o, matchedBy: by }] : [];
  });
  return listed(t0, items, { recall });
}

/** Recalls covering a product (model/UPC). Empty array = no recall in our table (still check CPSC live). */
export async function recallsForProduct(p: { brand?: string; model?: string; upc?: string; title?: string }): Promise<Listed<RecallRow & { matchedBy: 'model' | 'upc' }>> {
  const t0 = performance.now();
  const all = (await query('SELECT * FROM recalls')).map(toRecall);
  return listed(t0, all.flatMap((r) => {
    const by = matchesRecall(p, r);
    return by ? [{ ...r, matchedBy: by }] : [];
  }));
}

/** Full-text search terms: letters/digits only (FTS v2 uses Lucene syntax; strip operators). */
export const ftsTerms = (text: string) =>
  text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !['AND', 'OR', 'NOT', 'TO'].includes(w)).slice(0, 12).join(' ');

export interface AlternativesQuery {
  category: string;
  maxPrice: number;
  excludeModels?: string[];
  /** brands to skip; `avoidBrands` (cc's name) and `excludeBrands` both work */
  excludeBrands?: string[];
  avoidBrands?: string[];
  excludeSku?: string;
  text?: string;
  limit?: number;
}

/** Safe alternatives: same category, at most maxPrice, excluding recalled models, the item itself and avoided brands; ranked by full-text relevance when `text` is given. */
export async function findAlternatives(o: AlternativesQuery): Promise<Listed<ProductRow, { mode: 'fulltext' | 'price' }>> {
  const t0 = performance.now();
  const brands = [...(o.excludeBrands ?? []), ...(o.avoidBrands ?? [])];
  const where = ['category = ?', 'price <= ?'];
  const params: unknown[] = [o.category, o.maxPrice];
  if (o.excludeSku) {
    where.push('sku <> ?');
    params.push(o.excludeSku);
  }
  if (o.excludeModels?.length) {
    where.push(`model NOT IN (${o.excludeModels.map(() => '?').join(',')})`);
    params.push(...o.excludeModels);
  }
  if (brands.length) {
    where.push(`LOWER(brand) NOT IN (${brands.map(() => '?').join(',')})`);
    params.push(...brands.map((b) => b.toLowerCase()));
  }
  const limit = Math.min(Math.max(o.limit ?? 10, 1), 50);
  const terms = ftsTerms(o.text ?? '');
  const byPrice = () => query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY price ASC LIMIT ${limit}`, params);
  let rows: any[];
  let mode: 'fulltext' | 'price' = 'price';
  if (terms) {
    try {
      rows = await query(`SELECT *, MATCH(TABLE products) AGAINST(?) AS score FROM products WHERE ${where.join(' AND ')} ORDER BY score DESC, price ASC LIMIT ${limit}`, [terms, ...params]);
      mode = 'fulltext';
    } catch {
      rows = await byPrice(); // full-text index missing or not flushed yet: never fail the tick
    }
  } else rows = await byPrice();
  // SQL compares models exactly; also drop normalised matches ("ZS 100" vs "ZS-100")
  const ex = new Set((o.excludeModels ?? []).map(norm));
  return listed(t0, rows.map(toProduct).filter((p) => !ex.has(norm(p.model))), { mode });
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

/** A ledger row. Matches cc's LedgerRow (server/src/state.ts); `sponsor` defaults to the tool's prefix. */
export interface LedgerEntry {
  runId: string;
  kind: string;
  title: string;
  at?: Date | string;
  sponsor?: string;
  stepId?: string;
  status?: string;
  tool?: string;
  latencyMs?: number;
  detail?: unknown;
}

/** Tool name to sponsor column: "singlestore.findAlternatives" gives "singlestore", "stripe.pay (TEST)" gives "stripe". */
export const sponsorOf = (e: LedgerEntry) => (e.sponsor ?? (e.tool ? e.tool.split(/[.\s/]/)[0] : '')).toLowerCase().slice(0, 30);

/** Append audit rows (one or many, one INSERT). stepId/status/tool/latencyMs go into the detail JSON. */
export function logLedger(entries: LedgerEntry | LedgerEntry[]) {
  return timed(async () => {
    const list = Array.isArray(entries) ? entries : [entries];
    if (!list.length) return { inserted: 0 };
    const at = (e: LedgerEntry) => (e.at ? new Date(e.at) : new Date()).toISOString().replace('T', ' ').replace('Z', '');
    const detail = (e: LedgerEntry) => {
      const extra = Object.fromEntries(Object.entries({ stepId: e.stepId, status: e.status, tool: e.tool, latencyMs: e.latencyMs }).filter(([, v]) => v !== undefined));
      const d = e.detail === undefined ? {} : typeof e.detail === 'object' && e.detail !== null && !Array.isArray(e.detail) ? e.detail : { text: e.detail };
      const all = { ...extra, ...(d as object) };
      return Object.keys(all).length ? JSON.stringify(all) : null;
    };
    const values = list.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = list.flatMap((e) => [String(e.runId).slice(0, 60), at(e), String(e.kind).slice(0, 20), e.title, sponsorOf(e), detail(e)]);
    await query(`INSERT INTO ledger (run_id, at, kind, title, sponsor, detail) VALUES ${values}`, params);
    return { inserted: list.length };
  });
}

export async function getLedger(o: { runId?: string; limit?: number } = {}) {
  const t0 = performance.now();
  const limit = Math.min(Math.max(o.limit ?? 100, 1), 1000);
  const rows = o.runId
    ? await query(`SELECT * FROM ledger WHERE run_id = ? ORDER BY at LIMIT ${limit}`, [o.runId])
    : await query(`SELECT * FROM ledger ORDER BY at DESC LIMIT ${limit}`);
  return listed(t0, rows.map((r: any) => ({ id: Number(r.id), runId: r.run_id as string, at: r.at as string, kind: r.kind as string, title: r.title as string, sponsor: r.sponsor as string, detail: json(r.detail) })));
}

/** /demo/recall: mark a recall as newly published so the next tick sweeps owned items. */
export function activateRecall(recallId: string) {
  return timed(async () => {
    const r: any = await query('UPDATE recalls SET active_in_demo = TRUE, published_at = NOW() WHERE recall_id = ?', [recallId]);
    if (!(r[0]?.affectedRows ?? 0)) throw new IntegrationError(S, 404, `recall ${recallId} not in recalls table`, 'not_found');
    return { ok: true };
  });
}

/**
 * /demo/reset: restore seed prices (default: read from data/catalog.json), deactivate demo recalls,
 * clear the ledger, and remove replacement items the agent bought during the demo.
 */
export function resetDemo(userId = 'maya', seedPrices?: Record<string, number>) {
  return timed(async () => {
    let prices = seedPrices;
    if (!prices) {
      try {
        const seed = await import('./seed/seed-singlestore.ts');
        const d = seed.loadSeedData();
        prices = d.placeholder ? {} : seed.seedPrices(d);
      } catch {
        prices = {};
      }
    }
    for (const [sku, price] of Object.entries(prices)) await query('UPDATE products SET price = ? WHERE sku = ?', [price, sku]);
    await query('UPDATE recalls SET active_in_demo = FALSE');
    await query('DELETE FROM ledger');
    await query("DELETE FROM owned_items WHERE user_id = ? AND source = 'replacement'", [userId]);
    return { ok: true, pricesRestored: Object.keys(prices).length };
  });
}
