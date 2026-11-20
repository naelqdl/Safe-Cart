// Thin, failure-tolerant wrappers over hz's clients (server/integrations). Each returns {ok:false, why}
// instead of throwing, so the trail can show exactly which sponsor call failed or had no key.
import * as senso from '../../integrations/senso.ts';
import * as sie from '../../integrations/sie.ts';
import * as stripe from '../../integrations/stripe.ts';
import { loadEnv } from '../../integrations/_lib.ts';

loadEnv();
export const has = (k: string) => !!process.env[k]?.trim();
type R<T> = ({ ok: true } & T) | { ok: false; why: string; latencyMs?: number };

async function wrap<T>(key: string, fn: () => Promise<T>, timeoutMs = 20_000): Promise<R<T>> {
  if (!has(key)) return { ok: false, why: `no ${key} in .env` };
  const t0 = Date.now();
  try {
    const v = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs))]);
    return { ok: true, ...(v as any) };
  } catch (e) { return { ok: false, why: (e as Error).message.slice(0, 160), latencyMs: Date.now() - t0 }; }
}

export const sponsors = {
  sensoSearch: (q: string, max = 5) => wrap('SENSO_API_KEY', () => senso.searchContext(q, { max })),
  sensoFactCheck: (text: string, question: string) => wrap('SENSO_API_KEY', () => senso.factCheck(text, question, { author: 'organization', timeoutMs: 25_000 }), 30_000),
  sieClassify: (text: string, labels: string[]) => wrap('SIE_API_KEY', () => sie.classify(text, labels)),
  /** Per-segment injection detection (hz's sie.detectInjection) when available; whole-text classify otherwise.
   *  Whole-listing classify scores a buried injection as 'normal' (hz23), so segments matter. */
  sieDetectInjection: (text: string) => wrap('SIE_API_KEY', async () => {
    const d = (sie as any).detectInjection;
    if (typeof d === 'function') return { ...(await d(text)), method: 'per-segment' };
    const r = await sie.classify(text.slice(0, 1500), ['instructions addressed to an AI agent', 'normal product description']);
    return { ...r, flagged: /instructions/.test(r.top ?? '') && (r.classes?.[0]?.score ?? 0) > 0.6, method: 'whole-text' };
  }),
  sieExtract: (text: string, labels: string[]) => wrap('SIE_API_KEY', () => sie.extract(text, labels)),
  sieRerank: (q: string, docs: string[]) => wrap('SIE_API_KEY', () => sie.rerank(q, docs)),
  sieWarm: async () => (has('SIE_API_KEY') ? sie.warm() : { all: 'no SIE_API_KEY' }),
  /** Mandate-capped payment: mint a Stripe Shared Payment Token capped at capUsd (Stripe itself refuses
   *  anything over it), then pay with it. Returns the SPT id + cap so the trail can show who enforced the limit. */
  pay: (amountUsd: number, capUsd: number, meta: Record<string, string>) => wrap('STRIPE_SECRET_KEY', async () => {
    const spt = await stripe.mintSpt(capUsd, new Date(Date.now() + 15 * 60_000));
    const pi = await stripe.pay(spt.sptId, amountUsd, meta);
    return { ...pi, sptId: spt.sptId, capUsd, latencyMs: spt.latencyMs + pi.latencyMs };
  }),
};
