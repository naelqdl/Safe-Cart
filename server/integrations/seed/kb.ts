// Load KB source docs from data/kb/** (T13, owner ch). Layout contract: seed/README.md.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_KB_DIR = resolve(here, '../../../data/kb');
export const FIXTURE_KB_DIR = resolve(here, 'fixtures/kb');

/** data/kb if it exists (ch's real docs), else the placeholder fixtures. */
export const defaultKbDir = () => (existsSync(REPO_KB_DIR) ? REPO_KB_DIR : FIXTURE_KB_DIR);

export interface KbFile { doc: string; version: number; title: string; source?: string; body: string; path: string; sha: string }

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    const ok = ['.md', '.txt'].includes(extname(f).toLowerCase()) && !f.startsWith('.') && f.toLowerCase() !== 'readme.md';
    return ok ? [p] : [];
  });
}

function frontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: raw.slice(m[0].length) };
}

/** All KB files, grouped by logical doc id, versions ascending. */
export function loadKb(dir: string): Map<string, KbFile[]> {
  if (!existsSync(dir)) throw new Error(`KB dir not found: ${dir}`);
  const docs = new Map<string, KbFile[]>();
  for (const path of walk(dir)) {
    const raw = readFileSync(path, 'utf8');
    const { meta, body } = frontmatter(raw);
    const stem = basename(path, extname(path));
    const vMatch = /-v(\d+)$/i.exec(stem);
    const doc = (meta.doc || stem.replace(/-v\d+$/i, '')).toLowerCase();
    const version = Number(meta.version || vMatch?.[1] || 1);
    const title = meta.title || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || stem;
    const sha = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const f: KbFile = { doc, version, title, source: meta.source, body: body.trim(), path, sha };
    const list = docs.get(doc) ?? [];
    if (list.some((x) => x.version === version)) throw new Error(`duplicate ${doc} v${version}: ${path}`);
    list.push(f);
    list.sort((a, b) => a.version - b.version);
    docs.set(doc, list);
  }
  return docs;
}

/** The text Senso stores: a header the trail can cite (doc, version, source) + the body. */
export function sensoText(f: KbFile): string {
  return [f.title, `Document: ${f.doc} · Version: ${f.version}${f.source ? ` · Source: ${f.source}` : ''}`, '', f.body].join('\n');
}
