// npx tsx server/integrations/senso-gate.smoke.ts [--recalled "Brand|Model"] [--clean "Brand|Model"]
// Runs recallFactCheck on a recalled and a clean model in BOTH author modes (S-H3 done-check).
// Defaults: first recall in data/recalls/*.json, and the first data/catalog.json product whose model
// is not in any recall. Run seed/seed-senso.ts first.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { smoke } from './_lib.ts';
import { recallFactCheck } from './senso-gate.ts';
import { REPO_DATA_DIR } from './seed/kb.ts';
import { parseRecall } from './seed/seed-senso.ts';

const args = process.argv.slice(2);
const pair = (flag: string) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const [brand, model] = args[i + 1].split('|');
  return { brand, model };
};

const recallDir = join(REPO_DATA_DIR, 'recalls');
const recalls = existsSync(recallDir) ? readdirSync(recallDir).filter((f) => f.endsWith('.json')).map((f) => parseRecall(join(recallDir, f))) : [];
const recalledModels = new Set(recalls.flatMap((r) => r.models.map((m) => m.toLowerCase())));

let recalled = pair('--recalled');
if (!recalled && recalls[0]) recalled = { brand: recalls[0].brands[0] ?? '', model: recalls[0].models[0] ?? recalls[0].title };

let clean = pair('--clean');
const catPath = join(REPO_DATA_DIR, 'catalog.json');
if (!clean && existsSync(catPath)) {
  const cat = JSON.parse(readFileSync(catPath, 'utf8'));
  const items: any[] = Array.isArray(cat) ? cat : cat.products ?? [];
  const p = items.find((x) => x.model && !recalledModels.has(String(x.model).toLowerCase()));
  if (p) clean = { brand: String(p.brand ?? ''), model: String(p.model) };
}

const checks: [string, () => Promise<string>][] = [];
for (const author of ['organization', 'ai_assistant'] as const) {
  checks.push([`recallFactCheck(recalled, ${author})`, async () => {
    if (!recalled) throw new Error('no recalled model: add data/recalls/*.json (ch S-J1) or pass --recalled "Brand|Model"');
    const r = await recallFactCheck(recalled.brand, recalled.model, { author });
    const note = `${recalled.brand} ${recalled.model} → ${r.verdict} · run ${r.runId} · ${r.latencyMs}ms${r.quote ? ` | "${r.quote.slice(0, 70)}"` : ''}`;
    if (!r.recalled) throw new Error(`expected conflict: ${note}`);
    return note;
  }]);
  checks.push([`recallFactCheck(clean, ${author})`, async () => {
    if (!clean) throw new Error('no clean model: add data/catalog.json (ch S-J1) or pass --clean "Brand|Model"');
    const r = await recallFactCheck(clean.brand, clean.model, { author });
    const note = `${clean.brand} ${clean.model} → ${r.verdict} · run ${r.runId} · ${r.latencyMs}ms`;
    if (r.recalled) throw new Error(`expected not conflict: ${note}`);
    return note;
  }]);
}
await smoke('senso-gate', checks);
