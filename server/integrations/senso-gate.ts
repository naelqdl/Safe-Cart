// SafeCart recall gate on Senso (S-H3.2, owner hz). cc calls this in tick step 5 before every buy.
// Claim checked: "The <brand> <model> sold in our store is not subject to any active product recall."
//   conflict      → the KB holds a recall notice for it → RECALLED
//   verified      → the KB affirmatively says it is not recalled (rare)
//   unsupported / not_verifiable → Senso has no notice; not proof of safety by itself (combine with CPSC)
// Why "sold in our store": Senso's hackathon guide says claims about another company come back
// not_verifiable, and ai_assistant mode only checks claims about our organization and its products.
// Framing the item as our store's product keeps the claim checkable. Author 'organization' by default;
// confirm with `npx tsx senso-gate.smoke.ts` once recalls are seeded; override with SENSO_GATE_AUTHOR.
import { loadEnv } from './_lib.ts';
import { factCheck, type Claim, type Passage, type Verdict } from './senso.ts';

/** One verdict for a sentence the judge may split into several claims: the worst wins. */
export function rollupVerdict(claims: Claim[]): Verdict {
  const v = claims.map((c) => c.verdict);
  if (v.includes('conflict')) return 'conflict';
  if (v.includes('unsupported')) return 'unsupported';
  if (v.includes('verified')) return 'verified';
  return 'not_verifiable';
}

export const recallClaim = (brand: string, model: string) =>
  `The ${[brand, model].map((s) => s.trim()).filter(Boolean).join(' ')} sold in our store is not subject to any active product recall.`;

export interface RecallFactCheck {
  verdict: Verdict | 'gated';
  recalled: boolean;              // verdict === 'conflict'
  passages: Passage[];            // evidence (contentId/versionId; text = the judge's KB quote)
  quote?: string;
  reasoning?: string;
  runId: string;
  author: 'organization' | 'ai_assistant';
  claim: string;
  latencyMs: number;
}

export async function recallFactCheck(brand: string, model: string, o: { author?: 'organization' | 'ai_assistant' } = {}): Promise<RecallFactCheck> {
  loadEnv();
  const author = o.author ?? (process.env.SENSO_GATE_AUTHOR === 'ai_assistant' ? 'ai_assistant' : 'organization');
  const claim = recallClaim(brand, model);
  const r = await factCheck(claim, `Is the ${brand} ${model} your store sells safe to buy, or is it under a recall?`, { author });
  const verdict = r.status === 'gated' ? 'gated' : rollupVerdict(r.claims);
  const top = r.claims.find((c) => c.verdict === verdict) ?? r.claims[0];
  return {
    verdict,
    recalled: verdict === 'conflict',
    passages: r.claims.flatMap((c) => c.passages),
    quote: top?.quote,
    reasoning: top?.reasoning,
    runId: r.runId,
    author,
    claim,
    latencyMs: r.latencyMs,
  };
}
