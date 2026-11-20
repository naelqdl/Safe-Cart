// npx tsx server/integrations/stripe.smoke.ts   (test mode only)
import { IntegrationError, smoke } from './_lib.ts';
import { mintSpt, pay } from './stripe.ts';

let spt = '';
await smoke('stripe', [
  ['pay(fallback pm_card_visa)', async () => {
    const r = await pay(null, 1, { smoke: 'T11' });
    if (r.status !== 'succeeded') throw new Error(`status ${r.status}`);
    return `${r.paymentIntentId} ${r.status} · ${r.latencyMs}ms`;
  }],
  ['mintSpt', async () => {
    const r = await mintSpt(20, new Date(Date.now() + 3600_000));
    spt = r.sptId;
    return `${r.sptId} cap $20 · ${r.latencyMs}ms`;
  }],
  ['pay(spt, $5 under cap)', async () => {
    if (!spt) throw new Error('no SPT (mintSpt failed)');
    const r = await pay(spt, 5, { smoke: 'T11' });
    return `${r.paymentIntentId} ${r.status} · ${r.latencyMs}ms`;
  }],
  ['pay(spt, $50 over cap) is refused', async () => {
    if (!spt) throw new Error('no SPT (mintSpt failed)');
    try {
      const r = await pay(spt, 50, { smoke: 'T11' });
      throw new Error(`NOT refused: ${r.paymentIntentId} ${r.status} (cap must be enforced in our policy)`);
    } catch (e) {
      if (e instanceof IntegrationError) return `refused: ${e.status} ${e.code ?? ''} ${e.message.slice(0, 80)}`;
      throw e;
    }
  }],
]);
