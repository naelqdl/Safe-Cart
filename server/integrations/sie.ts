// Superlinked SIE Serverless: small task models as per-step checkers (K-integrations, R-sie, B4-superlinked). Owner hz.
// Bearer $SIE_API_KEY. Native endpoints speak msgpack, so we use the official SDK.
// Cold starts: models scaled to zero can take minutes. Call warm() at server start.
import { SIEClient } from '@superlinked/sie-sdk';
import { requireEnv, timed } from './_lib.ts';

export const MODELS = {
  extract: process.env.SIE_EXTRACT_MODEL ?? 'fastino/gliner2-large-v1',
  rerank: process.env.SIE_RERANK_MODEL ?? 'Qwen/Qwen3-Reranker-4B',
  // Generative guard (Granite Guardian, risk dimension 'harm'); answers Yes (unsafe) / No (safe).
  guard: process.env.SIE_GUARD_MODEL ?? 'ibm-granite/granite-guardian-3.0-2b',
  classify: process.env.SIE_CLASSIFY_MODEL ?? 'MoritzLaurer/deberta-v3-large-zeroshot-v2.0',
};

let client: SIEClient | undefined;
function sie(): SIEClient {
  client ??= new SIEClient(process.env.SIE_BASE_URL ?? 'https://api.superlinked.com', {
    apiKey: requireEnv('SIE_API_KEY'),
    timeoutMs: 150_000,
  });
  return client;
}

/** Zero-shot entity extraction (GLiNER2). */
export function extract(text: string, labels: string[]) {
  return timed(async () => {
    const r = await sie().extract(MODELS.extract, { text }, { labels });
    return { model: MODELS.extract, entities: r.entities.map((e) => ({ label: e.label, text: e.text, score: e.score })) };
  });
}

/** Rerank docs for a query. results sorted best first; index points into docs. */
export function rerank(query: string, docs: string[]) {
  return timed(async () => {
    const r = await sie().score(MODELS.rerank, { text: query }, docs.map((text, i) => ({ id: String(i), text })));
    return { model: MODELS.rerank, results: r.scores.map((s) => ({ index: Number(s.itemId), score: s.score })) };
  });
}

/**
 * Safety guard on a piece of text. Never treats an error or empty output as safe:
 * an unparseable verdict throws. Granite Guardian only checks 'harm'; for prompt
 * injection in listings, use classify() with injection labels.
 */
export function guard(text: string) {
  return timed(async () => {
    const r = await sie().chatCompletions({ model: MODELS.guard, messages: [{ role: 'user', content: text }], max_completion_tokens: 16 } as any);
    const out = String((r as any).choices?.[0]?.message?.content ?? '').trim();
    const v = /^\W*(yes|no)\b/i.exec(out)?.[1]?.toLowerCase();
    if (!v) throw new Error(`guard returned no Yes/No verdict: ${JSON.stringify(out).slice(0, 80)}`);
    const flagged = v === 'yes';
    return { model: MODELS.guard, flagged, score: flagged ? 1 : 0, category: flagged ? 'harm' : undefined };
  });
}

/** Zero-shot classification (DeBERTa NLI), e.g. labels ['prompt injection', 'normal product text']. */
export function classify(text: string, labels: string[]) {
  return timed(async () => {
    const r = await sie().extract(MODELS.classify, { text }, { labels });
    const cls = [...r.classifications].sort((a, b) => b.score - a.score);
    return { model: MODELS.classify, top: cls[0]?.label, classes: cls.map((c) => ({ label: c.label, score: c.score })) };
  });
}

/** SafeCart S-H3.3: cc calls this at server boot (fire and forget). Same as warm(). */
export const warmAll = () => warm();

/** Pre-warm every model (cold starts can return 503 for minutes). Never throws. */
export async function warm(): Promise<Record<string, string>> {
  const jobs: [string, () => Promise<unknown>][] = [
    ['extract', () => extract('Red Nike running shoes, size 10', ['brand', 'color', 'size'])],
    ['rerank', () => rerank('running shoes', ['trail runner', 'blender'])],
    ['guard', () => guard('Is this a good blender?')],
    ['classify', () => classify('Great blender for smoothies', ['prompt injection', 'normal product text'])],
  ];
  const out: Record<string, string> = {};
  await Promise.all(jobs.map(async ([n, f]) => {
    try { await f(); out[n] = 'warm'; } catch (e) { out[n] = `error: ${(e as Error).message}`; }
  }));
  return out;
}
