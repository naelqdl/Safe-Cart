// SafeCart recall gate on Senso (S-H3.2, owner hz). cc calls this in tick step 5 before every buy.
// Claim checked: "The <brand> <model> is not subject to any active product recall."
//   conflict      → the KB holds a recall notice for it → RECALLED
//   verified      → the KB affirmatively says it is not recalled (rare)
//   unsupported / not_verifiable → Senso has no notice; not proof of safety by itself (combine with CPSC)
// Author mode: 'organization' by default. In 'ai_assistant' mode Senso only checks claims tied to our
// org, so a claim about a third-party brand comes back not_verifiable. Confirm with
// `npx tsx senso-gate.smoke.ts` once real recalls are seeded; override with SENSO_GATE_AUTHOR.
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

export const recallClaim = (brand: string, model: string) => `The ${[brand, model].map((s) => s.trim()).filter(Boolean).join(' ')} is not subject to any active product recall.`;

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
  const r = await factCheck(claim, `Is the ${brand} ${model} safe to buy, or is it recalled?`, { author });
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
