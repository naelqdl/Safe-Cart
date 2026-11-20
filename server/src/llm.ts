// The only place that calls Claude. Claude WRITES and EXPLAINS: decision rationales, refund-claim
// letters, free-form chat answers. Deterministic code still DECIDES (buy/skip/approve) and chat actions
// stay regex-only. It only ever sees facts the agent already verified; raw listing text never goes in.
// No key / >8 s / refusal / any API error → a labelled template, and the purchase is never blocked.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.SAFECART_LLM_MODEL ?? 'claude-opus-5-5';
const PRICE = { in: 4 / 1e6, out: 20 / 1e6 }; // Claude Opus 5.5 list price, $ per token
const RULES = `Use ONLY the facts given. Never invent prices, recalls, models, dates or sources. Never give safety advice beyond a recall's stated remedy. No markdown, no preamble.`;
const EXPLAIN = `You write short, plain-English explanations for SafeCart, a recall-safe shopping agent. You explain decisions that were already made by fixed rules; never change or second-guess them. ${RULES}`;
const CHAT = `You are SafeCart, Maya's shopping agent. Answer in at most 3 sentences, only from the CONTEXT. If the context doesn't contain the answer, say you don't know. You cannot take actions from chat. ${RULES}`;

let client: Anthropic | null | undefined;
function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  try { client = process.env.ANTHROPIC_API_KEY?.trim() ? new Anthropic() : null; } catch { client = null; }
  return client;
}
export const llmAvailable = () => !!getClient();

export interface Written { text: string; model: string; latencyMs: number; tokens: number; costUsd: number; fallback?: string }

async function write(system: string, task: string, facts: unknown, template: () => string): Promise<Written> {
  const t0 = Date.now();
  const c = getClient();
  if (!c) return { text: template(), model: 'template', latencyMs: 0, tokens: 0, costUsd: 0, fallback: 'no ANTHROPIC_API_KEY' };
  try {
    const r: any = await Promise.race([
      c.beta.messages.create({
        model: MODEL, max_tokens: 1024, system,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' },
        messages: [{ role: 'user', content: `${task}\n\nFACTS (JSON):\n${JSON.stringify(facts)}` }],
      } as any),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 8s')), 8_000)),
    ]);
    if (r.stop_reason === 'refusal') throw new Error('model declined');
    let text = '';
    for (const b of r.content as any[]) if (b.type === 'text') text += b.text;
    text = text.trim();
    if (!text) throw new Error('empty response');
    const tin = r.usage?.input_tokens ?? 0, tout = r.usage?.output_tokens ?? 0;
    return { text, model: r.model ?? MODEL, latencyMs: Date.now() - t0, tokens: tin + tout, costUsd: Math.round((tin * PRICE.in + tout * PRICE.out) * 1e6) / 1e6 };
  } catch (e) {
    return { text: template(), model: 'template', latencyMs: Date.now() - t0, tokens: 0, costUsd: 0, fallback: (e as Error).message.slice(0, 100) };
  }
}

export function writeRationale(facts: { decision: string; item: string; price?: number; target?: number; rule: string; safety?: string; sources?: string[]; rejected?: { name: string; whyNot: string }[]; preferences?: string[] }) {
  return write(EXPLAIN, 'In 2 sentences, explain this already-made decision to the shopper, Maya. Use only the facts given. Do not change the decision.', facts, () =>
    `${facts.decision}: ${facts.item}${facts.price != null ? ` at $${facts.price.toFixed(2)}` : ''}. ${facts.rule}.${facts.rejected?.length ? ` Skipped ${facts.rejected.map((r) => `${r.name} (${r.whyNot})`).join('; ')}.` : ''}`);
}

export function writeClaimLetter(facts: { customer: string; item: string; model: string; orderRef?: string; purchasedAt: string; recallId: string; recallTitle: string; hazard: string; remedy: string; recallUrl: string }) {
  return write(EXPLAIN, 'Write the short refund-claim message the agent sends to the store (Demo Baby Store) for this recalled item: state the order, the item and model, the CPSC recall number and URL, and request the refund the recall remedy provides. Sign as "SafeCart, on behalf of <customer>". Max 120 words.', facts, () =>
    `Hello Demo Baby Store. On behalf of ${facts.customer}: order ${facts.orderRef ?? 'n/a'} (${facts.purchasedAt}) included the ${facts.item}, model ${facts.model}, which is under CPSC recall ${facts.recallId} (${facts.recallUrl}). Per the recall remedy ("${facts.remedy.slice(0, 160)}"), please issue a full refund. Thank you. SafeCart, on behalf of ${facts.customer}.`);
}

export function answerChat(question: string, context: unknown, canned: string) {
  return write(CHAT, `Maya asks: "${question.slice(0, 500)}"`, { CONTEXT: context }, () => canned);
}
