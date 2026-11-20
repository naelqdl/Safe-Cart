// Plan document (SPD) pinning + carryover (T14 rework per D1#Red-team #4 and cc25). Owner hz.
// SPD v1 and v2 are both pre-ingested as separate Senso docs (seed/seed.ts). The agent pins one:
// carryover = Senso search scoped to the active SPD's contentId + a deterministic parse (no LLM),
// cited by contentId/versionId. Never send the carryover claim to evals: they see every SPD version.
import { searchContext, type Passage } from './senso.ts';
import { getActive, readManifest, setActive, type ManifestEntry } from './seed/seed.ts';

const DOC = 'spd';

export interface ActiveSpd { version: number; title: string; contentId: string; nodeId: string; sensoVersionId?: string; source?: string }
const view = (e: ManifestEntry): ActiveSpd => ({ version: e.version, title: e.title, contentId: e.contentId, nodeId: e.nodeId, sensoVersionId: e.sensoVersionId, source: e.source });

/** The SPD version the agent is pinned to right now. */
export function activeSpd(): ActiveSpd {
  return view(getActive(DOC));
}

/** For POST /demo/plan {version}: switch the pinned SPD. Instant (both versions are pre-ingested). */
export function setActiveSpd(version: number): ActiveSpd {
  return view(setActive(DOC, version));
}

/** Every seeded SPD version, ascending. */
export function spdVersions(): ActiveSpd[] {
  return Object.values(readManifest().docs).filter((e) => e.doc === DOC).sort((a, b) => a.version - b.version).map(view);
}

/**
 * Pull the carryover dollar amount out of passage text. Deterministic: a dollar figure in a
 * sentence that talks about carrying over. Returns null unless exactly one distinct amount is found.
 */
export function parseCarryover(text: string): { usd: number; sentence: string } | null {
  const hits = new Map<number, string>();
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!/carr(y|ies|ied)[\s-]*over|carryover|roll(s|ed)?\s*over|rollover/i.test(sentence)) continue;
    if (/forfeit/i.test(sentence) && !/carr(y|ies)/i.test(sentence)) continue;
    for (const m of sentence.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g)) hits.set(Number(m[1].replace(/,/g, '')), sentence.trim());
  }
  if (hits.size !== 1) return null;
  const [[usd, sentence]] = [...hits];
  return { usd, sentence };
}

export interface Carryover { usd: number; spdVersion: number; contentId: string; versionId: string; quote: string; passage: Passage; latencyMs: number }

/**
 * Carryover from a pinned SPD version (default: the active one). Throws if the passages are
 * not from that doc or don't state exactly one carryover amount: the agent must not guess.
 */
export async function readCarryover(version?: number): Promise<Carryover> {
  const t0 = performance.now();
  const spd = version === undefined ? activeSpd() : spdVersions().find((s) => s.version === version);
  if (!spd) throw new Error(`SPD v${version} is not seeded`);
  const { passages } = await searchContext('How much of the unused FSA balance carries over to the next plan year?', { contentIds: [spd.contentId], max: 5 });
  const own = passages.filter((p) => p.contentId === spd.contentId);
  if (!own.length) throw new Error(`no passages from SPD v${spd.version} (content ${spd.contentId})`);
  const found = own.map((p) => ({ p, c: parseCarryover(p.text) })).filter((x) => x.c);
  const amounts = new Set(found.map((x) => x.c!.usd));
  if (amounts.size !== 1) throw new Error(`SPD v${spd.version}: expected one carryover amount, found ${amounts.size ? [...amounts].map((a) => `$${a}`).join(', ') : 'none'}`);
  const { p, c } = found[0];
  return { usd: c!.usd, spdVersion: spd.version, contentId: spd.contentId, versionId: p.versionId, quote: c!.sentence, passage: p, latencyMs: Math.round(performance.now() - t0) };
}
