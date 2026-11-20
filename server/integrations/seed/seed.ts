// Seed Senso from data/kb/** (T14, owner hz). Idempotent.
// Per D1#Red-team #4 + cc25: every version of a doc is its OWN Senso doc (SPD v1 and v2 both
// pre-ingested); the agent pins one by contentId. Switching versions on stage is instant (no re-ingest).
//   npx tsx server/integrations/seed/seed.ts           # ingest every doc + every version
//   flags: --dir <path> (default data/kb, else fixtures) · --fixtures · --dry-run
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntegrationError } from '../_lib.ts';
import { findDoc, ingestText, updateText, type DocRef } from '../senso.ts';
import { defaultKbDir, FIXTURE_KB_DIR, loadKb, sensoText, type KbFile } from './kb.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = resolve(here, '.senso-manifest.json');

/** One ingested doc version. Key in Manifest.docs is `<doc>@<version>`, e.g. `spd@2`. */
export interface ManifestEntry {
  doc: string;
  version: number;
  title: string;
  source?: string;
  nodeId: string;
  contentId: string;
  sensoVersionId?: string;
  sha: string;
  seededAt: string;
}
/** What is in this Senso org (gitignored: ids are per org) + which version of each doc is active. */
export interface Manifest { docs: Record<string, ManifestEntry>; active: Record<string, number> }

export function readManifest(): Manifest {
  try {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    if (m && m.docs && m.active) return m;
  } catch {
    /* missing or old format */
  }
  return { docs: {}, active: {} };
}
export const writeManifest = (m: Manifest) => writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
export const key = (doc: string, version: number) => `${doc}@${version}`;

/** Senso title: versions of one doc need distinct names (findDoc matches by exact name). */
export function sensoTitle(f: KbFile, multiVersion: boolean): string {
  return multiVersion ? `${f.title} (version ${f.version})` : f.title;
}

export interface SeedResult {
  doc: string;
  version: number;
  action: 'created' | 'updated' | 'unchanged' | 'adopted' | 'dry-run';
  nodeId?: string;
  contentId?: string;
  latencyMs: number;
}

/** Make sure one doc version is in Senso with the current file text. */
export async function putDoc(f: KbFile, title: string, m: Manifest, dryRun = false): Promise<SeedResult> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const k = key(f.doc, f.version);
  const base = { doc: f.doc, version: f.version };
  const cur = m.docs[k];
  if (cur && cur.sha === f.sha) return { ...base, action: 'unchanged', nodeId: cur.nodeId, contentId: cur.contentId, latencyMs: ms() };
  if (dryRun) return { ...base, action: 'dry-run', latencyMs: ms() };

  const text = sensoText(f);
  const existing = cur?.nodeId ?? (await findDoc(title)).doc?.nodeId;
  let action: SeedResult['action'];
  let r: DocRef;
  if (existing) {
    r = await updateText(existing, title, text); // file text changed: new Senso version of this same doc
    action = 'updated';
  } else {
    try {
      r = await ingestText(title, text);
      action = 'created';
    } catch (e) {
      if (!(e instanceof IntegrationError && e.status === 409)) throw e;
      const found = (await findDoc(title)).doc; // identical text is already in Senso
      if (!found) throw e;
      r = found;
      action = 'adopted';
    }
  }
  m.docs[k] = { doc: f.doc, version: f.version, title, source: f.source, nodeId: r.nodeId, contentId: r.contentId, sensoVersionId: r.versionId, sha: f.sha, seededAt: new Date().toISOString() };
  writeManifest(m);
  return { ...base, action, nodeId: r.nodeId, contentId: r.contentId, latencyMs: ms() };
}

/** Ingest every version of every doc. Each doc's active version defaults to its lowest (demo start: SPD v1). */
export async function seedKb(o: { dir?: string; dryRun?: boolean } = {}): Promise<SeedResult[]> {
  const m = readManifest();
  const out: SeedResult[] = [];
  for (const [doc, files] of loadKb(o.dir ?? defaultKbDir())) {
    for (const f of files) out.push(await putDoc(f, sensoTitle(f, files.length > 1), m, o.dryRun));
    if (!o.dryRun && !files.some((f) => f.version === m.active[doc])) {
      m.active[doc] = files[0].version;
      writeManifest(m);
    }
  }
  return out;
}

/** The active version's manifest entry for a doc. Throws if it was never seeded. */
export function getActive(doc: string): ManifestEntry {
  const m = readManifest();
  const v = m.active[doc];
  const e = v === undefined ? undefined : m.docs[key(doc, v)];
  if (!e) throw new Error(`${doc} is not seeded in Senso yet (run: npx tsx server/integrations/seed/seed.ts)`);
  return e;
}

/** Switch a doc's active version. Instant: no Senso call; the version must already be seeded. */
export function setActive(doc: string, version: number): ManifestEntry {
  const m = readManifest();
  const e = m.docs[key(doc, version)];
  if (!e) {
    const have = Object.values(m.docs).filter((d) => d.doc === doc).map((d) => d.version);
    throw new Error(`${doc} v${version} is not seeded (have: ${have.length ? have.map((x) => `v${x}`).join(', ') : 'none'})`);
  }
  m.active[doc] = version;
  writeManifest(m);
  return e;
}

/** Content ids of every ingested doc version, e.g. {'spd@1': '…', 'irs-pub-502@1': '…'}. */
export function allContentIds(): Record<string, string> {
  return Object.fromEntries(Object.entries(readManifest().docs).map(([k, e]) => [k, e.contentId]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let dir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = resolve(args[++i]);
    else if (args[i] === '--fixtures') dir = FIXTURE_KB_DIR;
  }
  const src = dir ?? defaultKbDir();
  console.log(`KB source: ${src}${src === FIXTURE_KB_DIR ? '  (PLACEHOLDER fixtures; real docs = data/kb from T13)' : ''}`);
  try {
    for (const r of await seedKb({ dir: src, dryRun: args.includes('--dry-run') })) {
      console.log(`OK   ${key(r.doc, r.version)} ${r.action}${r.contentId ? ` content ${r.contentId}` : ''} · ${r.latencyMs}ms`);
    }
    const m = readManifest();
    if (Object.keys(m.active).length) console.log(`active: ${Object.entries(m.active).map(([d, v]) => `${d}=v${v}`).join(' ')}`);
  } catch (e) {
    console.log(`FAIL seed | ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
