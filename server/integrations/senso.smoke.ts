// npx tsx server/integrations/senso.smoke.ts
import { smoke } from './_lib.ts';
import { creditBalance, factCheck, ingestText, searchContext, whoAmI } from './senso.ts';

const tag = `smoke-${Date.now()}`; // unique text avoids 409 on re-runs
let contentId = '';
await smoke('senso', [
  ['whoAmI', async () => `${(await whoAmI()).latencyMs}ms`],
  ['ingestText', async () => {
    const r = await ingestText(`T11 smoke policy ${tag}`, `Return policy (${tag}): unopened items can be returned within 30 days for a full refund. Opened blenders cannot be returned.`);
    contentId = r.contentId;
    return `content ${r.contentId} node ${r.nodeId} · ${r.latencyMs}ms`;
  }],
  ['searchContext', async () => {
    const r = await searchContext('Can I return an opened blender?', { contentIds: contentId ? [contentId] : undefined, max: 3 });
    if (!r.passages.length) throw new Error('no passages returned');
    return `${r.passages.length} passages, top score ${r.passages[0].score} · ${r.latencyMs}ms`;
  }],
  ['factCheck', async () => {
    const r = await factCheck('Opened blenders can be returned within 30 days.', 'Can I return an opened blender?');
    const v = r.claims.map((c) => c.verdict).join(',') || 'no claims';
    return `run ${r.runId} status ${r.status} verdicts [${v}] · ${r.latencyMs}ms`;
  }],
  ['creditBalance', async () => JSON.stringify((await creditBalance()).balance).slice(0, 80)],
]);
