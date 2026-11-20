// Senso: verified context layer (K-integrations, R-senso, B4-senso). Owner hz.
// base https://apiv2.senso.ai/api/v1 · header X-API-Key: $SENSO_API_KEY (key needs KB scope, else 403)
import { http, IntegrationError, requireEnv, sleep, timed } from './_lib.ts';

const BASE = process.env.SENSO_BASE_URL ?? 'https://apiv2.senso.ai/api/v1';
const S = 'senso';

export type Verdict = 'verified' | 'conflict' | 'unsupported' | 'not_verifiable';
export interface Passage { contentId: string; nodeId: string; versionId: string; text: string; score: number; rank: number }
export interface Claim { text: string; verdict: Verdict; passages: Passage[]; reasoning?: string; suggestedFix?: string }

const headers = (extra: Record<string, string> = {}) => ({ 'X-API-Key': requireEnv('SENSO_API_KEY'), ...extra });

/** GET /org/me: proves the key works. */
export function whoAmI() {
  return timed(async () => ({ org: (await http(S, `${BASE}/org/me`, { headers: headers() })).data }));
}

/**
 * Ingest raw text into the KB and wait until it is searchable.
 * POST /org/kb/raw → 202 {id, kb_node_id}; poll GET /org/kb/nodes/{id} every 5 s.
 * 409 (identical text already exists) throws IntegrationError with status 409;
 * change the text (e.g. add a version line) to re-ingest.
 */
export function ingestText(title: string, text: string, o: { timeoutMs?: number } = {}) {
  return timed(async () => {
    const { data } = await http(S, `${BASE}/org/kb/raw`, { headers: headers(), json: { title, text } });
    const contentId: string = data?.id ?? data?.content_id;
    const nodeId: string = data?.kb_node_id ?? data?.node_id;
    if (!nodeId) throw new IntegrationError(S, 200, 'ingest response had no kb_node_id', undefined, data);
    const deadline = Date.now() + (o.timeoutMs ?? 180_000);
    for (;;) {
      const n = (await http(S, `${BASE}/org/kb/nodes/${nodeId}`, { headers: headers() })).data;
      const st = n?.content?.processing_status ?? n?.processing_status;
      if (st === 'complete') return { contentId: contentId ?? n?.content?.id, nodeId, versionId: n?.content?.version_id as string | undefined };
      if (st === 'failed') throw new IntegrationError(S, 200, `processing failed for node ${nodeId}`, 'processing_failed', n);
      if (Date.now() > deadline) throw new IntegrationError(S, 0, `node ${nodeId} still '${st}' after timeout`, 'processing_timeout', n);
      await sleep(5000);
    }
  });
}

function toPassage(r: any, i: number): Passage {
  return {
    contentId: r?.content_id ?? r?.contentId ?? '',
    nodeId: r?.kb_node_id ?? r?.node_id ?? '',
    versionId: r?.version_id ?? r?.content_version_id ?? '',
    text: r?.chunk_text ?? r?.text ?? '',
    score: Number(r?.score ?? 0),
    rank: Number(r?.rank ?? i + 1),
  };
}

/** Chunks only (we bring our own LLM). POST /org/search/context, signals off. */
export function searchContext(query: string, o: { contentIds?: string[]; max?: number } = {}) {
  return timed(async () => {
    const json: Record<string, unknown> = { query, max_results: Math.min(o.max ?? 5, 20) };
    if (o.contentIds?.length) {
      json.content_ids = o.contentIds;
      json.require_scoped_ids = true;
    }
    const { data } = await http(S, `${BASE}/org/search/context`, { headers: headers({ 'X-Senso-Signals': 'off' }), json });
    const results: any[] = data?.results ?? data?.chunks ?? [];
    return { passages: results.map(toPassage) };
  });
}

const DONE = new Set(['completed', 'gated', 'failed']);

/**
 * Claim-by-claim fact check of text against the KB. POST /org/evals/text {wait:true};
 * on 202 (wait ceiling hit) polls GET /org/evals/runs/{id}. `status` 'gated' means
 * Senso refused to check (e.g. text opens with "I'm sorry"): treat as unchecked.
 * author 'ai_assistant' only checks claims about our org; try 'organization' too (R-senso#Gotchas).
 */
export function factCheck(text: string, question?: string, o: { author?: 'ai_assistant' | 'organization'; timeoutMs?: number } = {}) {
  return timed(async () => {
    const json = { text, question, author: o.author ?? 'ai_assistant', evaluator: 'kb_accuracy', wait: true };
    let { data } = await http(S, `${BASE}/org/evals/text`, { headers: headers(), json, timeoutMs: 120_000 });
    const runId: string = data?.eval_run_id ?? data?.run_id ?? data?.id;
    const deadline = Date.now() + (o.timeoutMs ?? 180_000);
    while (!DONE.has(data?.status) && !Array.isArray(findClaims(data)) && runId) {
      if (Date.now() > deadline) throw new IntegrationError(S, 0, `eval run ${runId} still '${data?.status}'`, 'eval_timeout', data);
      await sleep(5000);
      data = (await http(S, `${BASE}/org/evals/runs/${runId}`, { headers: headers() })).data;
    }
    if (data?.status === 'failed') throw new IntegrationError(S, 200, `eval run ${runId} failed`, 'eval_failed', data);
    const claims: Claim[] = (findClaims(data) ?? []).map((c: any) => ({
      text: c?.claim ?? c?.text ?? c?.claim_text ?? '',
      verdict: normVerdict(c?.verdict ?? c?.status),
      passages: (c?.evidence ?? c?.citations ?? c?.passages ?? []).map(toPassage),
      reasoning: c?.reasoning,
      suggestedFix: c?.suggested_fix,
    }));
    return { runId, status: (data?.status as string) ?? 'completed', accuracyPct: data?.accuracy_pct as number | undefined, claims, raw: data };
  });
}

function findClaims(d: any): any[] | undefined {
  return d?.claims ?? d?.result?.claims ?? d?.results?.claims ?? d?.evaluation?.claims ?? d?.output?.claims;
}

function normVerdict(v: unknown): Verdict {
  const s = String(v ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (s === 'verified' || s === 'conflict' || s === 'unsupported' || s === 'not_verifiable') return s;
  if (s === 'supported' || s === 'correct') return 'verified';
  if (s === 'contradicted' || s === 'incorrect') return 'conflict';
  return 'not_verifiable';
}

/** GET /org/credits/balance (credit unit is undocumented). */
export function creditBalance() {
  return timed(async () => ({ balance: (await http(S, `${BASE}/org/credits/balance`, { headers: headers() })).data }));
}
