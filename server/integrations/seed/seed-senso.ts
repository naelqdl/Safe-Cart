// SafeCart Senso seed (S-H3.1, owner hz): real CPSC recall notices + data/kb/*.txt into Senso's KB.
//   npx tsx server/integrations/seed/seed-senso.ts [--data <dir>] [--dry-run]
// Inputs (ch, S-J1): data/recalls/*.json (REAL CPSC recalls only; never invented), data/kb/*.txt|md.
// Idempotent: unchanged docs are skipped, 409 (identical text exists) counts as success.
// Content ids land in seed/.senso-manifest.json and, when ch's singlestore.ts and S2_URL exist,
// in SingleStore recalls.senso_content_id.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKb, REPO_DATA_DIR, type KbFile } from './kb.ts';
import { key, putDoc, readManifest, sensoTitle, type SeedResult } from './seed.ts';

/** A CPSC recall as ch records it. Field names vary (CPSC API uses PascalCase); we accept both. */
export interface RecallDoc { recallId: string; title: string; brands: string[]; models: string[]; upcs: string[]; hazard: string; remedy: string; url: string; publishedAt?: string; path: string; raw: string }

const str = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.map(str).filter(Boolean).join('; ') : typeof v === 'object' ? str((v as any).Name ?? (v as any).name ?? (v as any).Description ?? (v as any).description ?? (v as any).URL ?? (v as any).url) : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? str(v).split(/\s*[;,]\s*/) : []);

export function parseRecall(path: string): RecallDoc {
  const raw = readFileSync(path, 'utf8');
  const j = JSON.parse(raw);
  const r: RecallDoc = {
    recallId: str(j.recallId ?? j.recall_id ?? j.RecallID ?? j.RecallNumber ?? j.recall_number ?? j.id),
    title: str(j.title ?? j.Title ?? j.productName ?? j.product_name ?? j.Products?.[0]?.Name),
    brands: list(j.brands ?? j.brand ?? j.Brands ?? j.Manufacturers ?? j.Products?.map?.((p: any) => p.Name)),
    models: list(j.models ?? j.model ?? j.modelNumbers ?? j.model_numbers ?? j.Products?.map?.((p: any) => p.Model)),
    upcs: list(j.upcs ?? j.upc ?? j.UPCs ?? j.ProductUPCs),
    hazard: str(j.hazard ?? j.Hazards ?? j.hazards),
    remedy: str(j.remedy ?? j.Remedies ?? j.remedies),
    url: str(j.url ?? j.URL ?? j.source ?? j.sourceUrl),
    publishedAt: str(j.publishedAt ?? j.published_at ?? j.RecallDate) || undefined,
    path,
    raw,
  };
  const missing = (['recallId', 'title', 'url'] as const).filter((k) => !r[k]);
  if (missing.length) throw new Error(`${basename(path)}: missing ${missing.join(', ')}`);
  return r;
}

/** The text Senso stores for a recall (the brief's format), so evals and search can cite it. */
export function recallText(r: RecallDoc): string {
  return [
    `CPSC Recall ${r.recallId}: ${r.title}.`,
    r.brands.length ? `Brands: ${r.brands.join(', ')}.` : '',
    `Models: ${r.models.length ? r.models.join(', ') : 'see source'}.`,
    r.upcs.length ? `UPCs: ${r.upcs.join(', ')}.` : '',
    r.publishedAt ? `Published: ${r.publishedAt}.` : '',
    `Hazard: ${r.hazard || 'see source'}.`,
    `Remedy: ${r.remedy || 'see source'}.`,
    `Source: ${r.url}`,
  ].filter(Boolean).join('\n');
}

function recallAsKbFile(r: RecallDoc): KbFile {
  const body = recallText(r);
  return { doc: `recall-${r.recallId.toLowerCase()}`, version: 1, title: `CPSC Recall ${r.recallId}: ${r.title}`, source: r.url, body, path: r.path, sha: createHash('sha256').update(body).digest('hex').slice(0, 16) };
}

/** Best effort: write content ids into ch's SingleStore recalls table. Never fails the seed. */
async function linkSingleStore(ids: { recallId: string; contentId: string }[]): Promise<string> {
  if (!ids.length) return 'no recalls';
  if (!process.env.S2_URL) return 'skipped (no S2_URL)';
  const mod = resolve(fileURLToPath(new URL('../singlestore.ts', import.meta.url)));
  if (!existsSync(mod)) return 'skipped (server/integrations/singlestore.ts not merged yet: ch S-H1)';
  try {
    const s2: any = await import('../singlestore.ts' as string);
    for (const { recallId, contentId } of ids) await s2.query('UPDATE recalls SET senso_content_id = ? WHERE recall_id = ?', [contentId, recallId]);
    return `updated ${ids.length} rows`;
  } catch (e) {
    return `failed: ${(e as Error).message}`;
  }
}

export async function seedSenso(o: { dataDir?: string; dryRun?: boolean } = {}) {
  const data = o.dataDir ?? REPO_DATA_DIR;
  const m = readManifest();
  const results: (SeedResult & { recallId?: string })[] = [];
  const notes: string[] = [];

  const recallDir = join(data, 'recalls');
  const recalls = existsSync(recallDir) ? readdirSync(recallDir).filter((f) => f.endsWith('.json')).map((f) => parseRecall(join(recallDir, f))) : [];
  if (!recalls.length) notes.push(`no recalls in ${recallDir} (ch S-J1)`);
  for (const r of recalls) {
    const f = recallAsKbFile(r);
    results.push({ ...(await putDoc(f, f.title, m, o.dryRun)), recallId: r.recallId });
  }

  const kbDir = join(data, 'kb');
  if (existsSync(kbDir)) {
    for (const [, files] of loadKb(kbDir)) for (const f of files) results.push(await putDoc(f, sensoTitle(f, files.length > 1), m, o.dryRun));
  } else notes.push(`no kb docs in ${kbDir} (ch S-J1)`);

  const links = results.filter((r) => r.recallId && r.contentId).map((r) => ({ recallId: r.recallId!, contentId: r.contentId! }));
  notes.push(`SingleStore link: ${o.dryRun ? 'skipped (dry run)' : await linkSingleStore(links)}`);
  return { results, notes };
}

/** Content id of a seeded recall notice, for searchContext({contentIds}) and SafetyCheck sources. */
export function recallContentId(recallId: string): string | undefined {
  return readManifest().docs[key(`recall-${recallId.toLowerCase()}`, 1)]?.contentId;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--data');
  const dataDir = i >= 0 ? resolve(args[i + 1]) : undefined;
  try {
    const { results, notes } = await seedSenso({ dataDir, dryRun: args.includes('--dry-run') });
    for (const r of results) console.log(`OK   ${r.recallId ? `recall ${r.recallId}` : `kb ${r.doc}@${r.version}`} ${r.action}${r.contentId ? ` content ${r.contentId}` : ''} · ${r.latencyMs}ms`);
    for (const n of notes) console.log(`NOTE ${n}`);
    if (!results.length) process.exitCode = 1;
  } catch (e) {
    console.log(`FAIL seed-senso | ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
