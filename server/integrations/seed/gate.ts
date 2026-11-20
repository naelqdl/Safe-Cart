// Gate test (T14, owner hz), per cc25:
//  1. carryover: pinned search on EACH seeded SPD version + deterministic parse → expected dollars (v1 $680, v2 $500)
//  2. item eligibility: Senso evals (IRS/CARES; identical in every SPD version) → expected verdicts
//   npx tsx server/integrations/seed/gate.ts [--author organization|ai_assistant] [--claims <file>]
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MissingKeyError } from '../_lib.ts';
import { factCheck, type Claim, type Verdict } from '../senso.ts';
import { readCarryover, spdVersions } from '../spd.ts';

const here = dirname(fileURLToPath(import.meta.url));
interface GateFile { carryover: Record<string, number>; evals: { id: string; question?: string; text: string; expect: Verdict }[] }

/** One verdict for a sentence the judge may split into several claims: the worst wins. */
export function rollup(claims: Claim[]): Verdict {
  const v = claims.map((c) => c.verdict);
  if (v.includes('conflict')) return 'conflict';
  if (v.includes('unsupported')) return 'unsupported';
  if (v.includes('verified')) return 'verified';
  return 'not_verifiable';
}

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const author = (flag('--author') ?? 'organization') as 'organization' | 'ai_assistant';
const gate: GateFile = JSON.parse(readFileSync(resolve(flag('--claims') ?? resolve(here, 'gate-claims.json')), 'utf8'));

let failed = 0;
const line = (ok: boolean | 'skip', msg: string) => {
  if (ok !== true) failed++;
  console.log(`${ok === 'skip' ? 'SKIP' : ok ? 'PASS' : 'FAIL'} ${msg}`);
};
const fail = (id: string, e: unknown) => line(e instanceof MissingKeyError ? 'skip' : false, `${id} | ${(e as Error).message}`);

// 1. carryover, pinned per SPD version
const seeded = new Set(spdVersions().map((s) => s.version));
for (const [k, want] of Object.entries(gate.carryover)) {
  const v = Number(k.split('@')[1]);
  if (!seeded.has(v)) {
    line(false, `carryover ${k} | not seeded (run seed.ts first)`);
    continue;
  }
  try {
    const c = await readCarryover(v);
    line(c.usd === want, `carryover ${k}: expected $${want}, got $${c.usd} · content ${c.contentId} version ${c.versionId.slice(0, 8)} · ${c.latencyMs}ms | "${c.quote.slice(0, 80)}"`);
  } catch (e) {
    fail(`carryover ${k}`, e);
  }
}

// 2. item eligibility via evals
console.log(`evals: author=${author}`);
for (const c of gate.evals) {
  try {
    const r = await factCheck(c.text, c.question, { author });
    const got = r.status === 'gated' ? 'gated' : rollup(r.claims);
    const top = r.claims.find((x) => x.verdict === got) ?? r.claims[0];
    const ev = top?.evidence[0];
    const why = [top?.quote ? `quote "${top.quote.slice(0, 70)}"` : '', ev ? `evidence ${ev.contentId}@${ev.versionId.slice(0, 8)} (${ev.relation})` : '']
      .filter(Boolean)
      .join(' · ');
    const verdicts = r.claims.map((x) => x.verdict).join(',');
    line(got === c.expect, `${c.id}: expected ${c.expect}, got ${got} [${verdicts}] run ${r.runId} · ${r.latencyMs}ms${why ? ` | ${why}` : ''}`);
  } catch (e) {
    fail(c.id, e);
  }
}
process.exitCode = failed ? 1 : 0;
