// Claude writes the explanations: the decision rationale and the refund-claim letter.
// It NEVER decides buy/skip (that stays deterministic code in tick.ts). It is given only facts the
// agent already verified, and is told not to add any. No key / timeout / refusal → a labelled template.
import Anthropic from '@anthropic-ai/sdk';
import type { Run } from './wire.ts';

export const MODEL = process.env.SAFECART_LLM_MODEL ?? 'claude-opus-5-5';
const PRICE = { in: 4 / 1e6, out: 20 / 1e6 }; // Claude Opus 5.5, $ per token
const SYSTEM = `You write short, plain-English explanations for SafeCart, a recall-safe shopping agent.
Rules: use ONLY the facts given. Never invent prices, recalls, models, dates or sources. Never give safety advice beyond the recall's stated remedy.
Never change or second-guess the decision; you are explaining it, not making it. No markdown, no preamble.`;

let client: Anthropic | null | undefined;
function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  try { client = process.env.ANTHROPIC_API_KEY?.trim() ? new Anthropic() : null; } catch { client = null; }
  return client;
}
export const llmAvailable = () => !!getClient();

export interface Written { text: string; model: string; latencyMs: number; tokens: number; costUsd: number; fallback?: string }

async function write(task: string, facts: Record<string, unknown>, maxWords: number, template: () => string): Promise<Written> {
  const t0 = Date.now();
  const c = getClient();
  if (!c) return { text: template(), model: 'template', latencyMs: 0, tokens: 0, costUsd: 0, fallback: 'no ANTHROPIC_API_KEY' };
  try {
    const res: any = await Promise.race([
      c.beta.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: `${task} Max ${maxWords} words.\n\nFACTS (JSON):\n${JSON.stringify(facts)}` }],
      } as any),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 15s')), 15_000)),
    ]);
    if (res.stop_reason === 'refusal') throw new Error('model declined');
    const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (!text) throw new Error('empty response');
    const tin = res.usage?.input_tokens ?? 0, tout = res.usage?.output_tokens ?? 0;
    return { text, model: res.model ?? MODEL, latencyMs: Date.now() - t0, tokens: tin + tout, costUsd: tin * PRICE.in + tout * PRICE.out };
  } catch (e) {
    return { text: template(), model: 'template', latencyMs: Date.now() - t0, tokens: 0, costUsd: 0, fallback: (e as Error).message.slice(0, 100) };
  }
}

export function addCost(run: Run, w: Written) {
  if (!w.tokens) return;
  run.cost.usd = Math.round((run.cost.usd + w.costUsd) * 1e6) / 1e6;
  run.cost.tokens += w.tokens;
  run.cost.byModel[w.model] = Math.round(((run.cost.byModel[w.model] ?? 0) + w.costUsd) * 1e6) / 1e6;
}

export function writeRationale(facts: { decision: string; item: string; price?: number; rule: string; safety?: string; sources?: string[]; rejected?: { name: string; whyNot: string }[]; preferences?: string[] }) {
  return write('Explain to Maya, in 1-2 sentences, why her shopping agent made this decision.', facts, 55, () =>
    `${facts.decision}: ${facts.item}${facts.price != null ? ` at $${facts.price.toFixed(2)}` : ''}. ${facts.rule}.${facts.rejected?.length ? ` Skipped ${facts.rejected.map((r) => `${r.name} (${r.whyNot})`).join('; ')}.` : ''}`);
}

export function writeClaimLetter(facts: { customer: string; item: string; model: string; orderRef?: string; purchasedAt: string; recallId: string; recallTitle: string; hazard: string; remedy: string; recallUrl: string }) {
  return write('Write the refund-claim message the agent sends to the store for this recalled item. Address the store; state the order, the CPSC recall number and URL, and request the refund the recall remedy provides. Sign as "SafeCart, on behalf of" the customer.', facts, 120, () =>
    `Hello Demo Baby Store. On behalf of ${facts.customer}: order ${facts.orderRef ?? 'n/a'} (${facts.purchasedAt}) included the ${facts.item}, model ${facts.model}, which is under CPSC recall ${facts.recallId} (${facts.recallUrl}). Per the recall remedy ("${facts.remedy.slice(0, 160)}"), please issue a full refund. Thank you. SafeCart, on behalf of ${facts.customer}.`);
}
