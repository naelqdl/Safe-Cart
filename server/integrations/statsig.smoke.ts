// npx tsx server/integrations/statsig.smoke.ts
import { requireEnv, smoke } from './_lib.ts';
import { flush, getPolicy, logEvent, shutdown } from './statsig.ts';

await smoke('statsig', [
  ['getPolicy', async () => {
    requireEnv('STATSIG_SERVER_KEY');
    const p = await getPolicy();
    if (p.source !== 'statsig') throw new Error(`fell back to defaults: ${p.error ?? 'unknown'}`);
    return `limit=${p.autoBuyLimit} minDisc=${p.minDiscountPct}% ${p.autonomy} recallGuard=${p.recallGuard} · ${p.latencyMs}ms`;
  }],
  ['logEvent+flush', async () => {
    requireEnv('STATSIG_SERVER_KEY');
    const t0 = performance.now();
    await getPolicy(); // ensure initialized
    logEvent('maya', 'smoke_test', 1, { smoke: 'T11' });
    await flush();
    return `${Math.round(performance.now() - t0)}ms`;
  }],
]);
await shutdown();
