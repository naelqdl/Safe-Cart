// Evals gate test (T14, owner hz): fact-check sample claims against the seeded KB and compare verdicts.
//   npx tsx server/integrations/seed/gate.ts [--author organization|ai_assistant] [--claims <file>]
// Expected verdicts can depend on the live doc version, e.g. {"spd@1":"verified","spd@2":"conflict"}.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MissingKeyError } from '../_lib.ts';
import { factCheck, type Claim, type Verdict } from '../senso.ts';
import { readManifest } from './seed.ts';

const here = dirname(fileURLToPath(import.meta.url));
interface GateClaim { id: string; question?: string; text: string; expect: Verdict | Record<string, Verdict> }

/** One verdict for a sentence the judge may split into several claims: the worst wins. */
export function rollup(claims: Claim[]): Verdict {
  const v = claims.map((c) => c.verdict);
  if (v.includes('conflict')) return 'conflict';
  if (v.includes('unsupported')) return 'unsupported';
  if (v.includes('verified')) return 'verified';
  return 'not_verifiable';
}

function expected(c: GateClaim, live: Record<string, number>): Verdict {
  if (typeof c.expect === 'string') return c.expect;
  for (const [k, v] of Object.entries(c.expect)) {
    const [doc, ver] = k.split('@');
    if ((live[doc] ?? 1) === Number(ver)) return v;
  }
  throw new Error(`claim ${c.id}: no expectation for live versions ${JSON.stringify(live)}`);
}

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const author = (flag('--author') ?? 'organization') as 'organization' | 'ai_assistant';
const claims: GateClaim[] = JSON.parse(readFileSync(resolve(flag('--claims') ?? resolve(here, 'gate-claims.json')), 'utf8'));
const live = Object.fromEntries(Object.entries(readManifest()).map(([d, m]) => [d, m.version]));
console.log(`gate: author=${author} · live versions ${JSON.stringify(live)}${Object.keys(live).length ? '' : ' (no manifest: run seed.ts first; assuming v1)'}`);

let failed = 0;
for (const c of claims) {
  try {
    const want = expected(c, live);
    const r = await factCheck(c.text, c.question, { author });
    const got = r.status === 'gated' ? 'gated' : rollup(r.claims);
    const top = r.claims.find((x) => x.verdict === got) ?? r.claims[0];
    const ev = top?.evidence[0];
    const why = [top?.quote ? `quote "${top.quote.slice(0, 70)}"` : '', ev ? `evidence ${ev.contentId}@${ev.versionId.slice(0, 8)} (${ev.relation})` : '']
      .filter(Boolean)
      .join(' · ');
    const ok = got === want;
    if (!ok) failed++;
    const verdicts = r.claims.map((x) => x.verdict).join(',');
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.id}: expected ${want}, got ${got} [${verdicts}] run ${r.runId} · ${r.latencyMs}ms${why ? ` | ${why}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`${e instanceof MissingKeyError ? 'SKIP' : 'FAIL'} ${c.id} | ${(e as Error).message}`);
  }
}
process.exitCode = failed ? 1 : 0;
