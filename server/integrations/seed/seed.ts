// Seed Senso from data/kb/** (T14, owner hz). Idempotent; versions docs in place.
//   npx tsx server/integrations/seed/seed.ts                 # every doc at its lowest version (demo start: SPD v1)
//   npx tsx server/integrations/seed/seed.ts --version spd=2 # live twist: SPD v2 as a new Senso version of the same doc
//   flags: --dir <path> (default data/kb, else fixtures) · --fixtures · --dry-run
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntegrationError } from '../_lib.ts';
import { findDoc, ingestText, updateText, type DocRef } from '../senso.ts';
import { defaultKbDir, FIXTURE_KB_DIR, loadKb, sensoText, type KbFile } from './kb.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = resolve(here, '.senso-manifest.json');

/** What is live in Senso right now, per logical doc. Specific to one Senso org, so gitignored. */
export interface ManifestEntry { title: string; nodeId: string; contentId: string; version: number; sha: string; sensoVersionNum?: number; sensoVersionId?: string; seededAt: string }
export type Manifest = Record<string, ManifestEntry>;

export function readManifest(): Manifest {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}
const writeManifest = (m: Manifest) => writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');

export interface SeedResult {
  doc: string;
  version: number;
  action: 'created' | 'new-version' | 'unchanged' | 'adopted' | 'dry-run';
  nodeId?: string;
  contentId?: string;
  sensoVersionNum?: number;
  latencyMs: number;
}

/** Put one doc at one version in Senso: create it, add a new Senso version, or skip if already live. */
export async function putDoc(f: KbFile, manifest: Manifest, dryRun = false): Promise<SeedResult> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const base = { doc: f.doc, version: f.version };
  const cur = manifest[f.doc];
  if (cur && cur.sha === f.sha && cur.version === f.version) {
    return { ...base, action: 'unchanged', nodeId: cur.nodeId, contentId: cur.contentId, sensoVersionNum: cur.sensoVersionNum, latencyMs: ms() };
  }
  if (dryRun) return { ...base, action: 'dry-run', latencyMs: ms() };

  const text = sensoText(f);
  const existing = cur?.nodeId ?? (await findDoc(f.title)).doc?.nodeId;
  let action: SeedResult['action'];
  let r: DocRef;
  if (existing) {
    r = await updateText(existing, f.title, text);
    action = 'new-version';
  } else {
    try {
      r = await ingestText(f.title, text);
      action = 'created';
    } catch (e) {
      if (!(e instanceof IntegrationError && e.status === 409)) throw e;
      const found = (await findDoc(f.title)).doc; // identical text is already in Senso
      if (!found) throw e;
      r = found;
      action = 'adopted';
    }
  }
  manifest[f.doc] = {
    title: f.title,
    nodeId: r.nodeId,
    contentId: r.contentId,
    version: f.version,
    sha: f.sha,
    sensoVersionNum: r.versionNum,
    sensoVersionId: r.versionId,
    seededAt: new Date().toISOString(),
  };
  writeManifest(manifest);
  return { ...base, action, nodeId: r.nodeId, contentId: r.contentId, sensoVersionNum: r.versionNum, latencyMs: ms() };
}

/** Seed every doc. `versions` pins a doc to a version (default: its lowest = demo start state). */
export async function seedKb(o: { dir?: string; versions?: Record<string, number>; dryRun?: boolean } = {}): Promise<SeedResult[]> {
  const dir = o.dir ?? defaultKbDir();
  const manifest = readManifest();
  const out: SeedResult[] = [];
  for (const [doc, files] of loadKb(dir)) {
    const want = o.versions?.[doc];
    const f = want === undefined ? files[0] : files.find((x) => x.version === want);
    if (!f) throw new Error(`no ${doc} v${want} in ${dir} (have v${files.map((x) => x.version).join(', v')})`);
    out.push(await putDoc(f, manifest, o.dryRun));
  }
  return out;
}

/** For cc's POST /demo/plan {version}: switch one doc (e.g. 'spd') to a version. */
export async function setDocVersion(doc: string, version: number, dir?: string): Promise<SeedResult> {
  const f = loadKb(dir ?? defaultKbDir()).get(doc)?.find((x) => x.version === version);
  if (!f) throw new Error(`no ${doc} v${version}`);
  return putDoc(f, readManifest());
}

/** Content ids of the live KB docs, for searchContext({contentIds}) scoping. */
export function liveContentIds(): Record<string, string> {
  return Object.fromEntries(Object.entries(readManifest()).map(([d, m]) => [d, m.contentId]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const versions: Record<string, number> = {};
  let dir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version') {
      const [d, v] = args[++i].split('=');
      versions[d.toLowerCase()] = Number(v);
    } else if (args[i] === '--dir') dir = resolve(args[++i]);
    else if (args[i] === '--fixtures') dir = FIXTURE_KB_DIR;
  }
  const src = dir ?? defaultKbDir();
  console.log(`KB source: ${src}${src === FIXTURE_KB_DIR ? '  (PLACEHOLDER fixtures; real docs = data/kb from T13)' : ''}`);
  try {
    for (const r of await seedKb({ dir: src, versions, dryRun: args.includes('--dry-run') })) {
      const extra = `${r.nodeId ? ` node ${r.nodeId}` : ''}${r.sensoVersionNum ? ` senso v${r.sensoVersionNum}` : ''}`;
      console.log(`OK   ${r.doc} v${r.version} ${r.action}${extra} · ${r.latencyMs}ms`);
    }
  } catch (e) {
    console.log(`FAIL seed | ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
