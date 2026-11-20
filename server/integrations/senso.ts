// Senso: verified context layer (K-integrations, R-senso, B4-senso). Owner hz.
// base https://apiv2.senso.ai/api/v1 · header X-API-Key: $SENSO_API_KEY (key needs KB scope, else 403)
// Field names checked against the public spec: https://docs.senso.ai/specs/sdk-api.yaml
import { http, IntegrationError, requireEnv, sleep, timed } from './_lib.ts';

const BASE = process.env.SENSO_BASE_URL ?? 'https://apiv2.senso.ai/api/v1';
const S = 'senso';

export type Verdict = 'verified' | 'conflict' | 'unsupported' | 'not_verifiable';
export interface Passage { contentId: string; nodeId: string; versionId: string; text: string; score: number; rank: number }
export interface Evidence { contentId: string; versionId: string; chunkIndex?: number; relation: string }
export interface Claim {
  text: string;
  verdict: Verdict;
  /** Contract field: evidence as passages (text = the judge's verbatim KB quote when present; evals return no chunk text). */
  passages: Passage[];
  evidence: Evidence[];
  quote?: string;
  sourceText?: string;
  bucket?: string;
  passed?: boolean | null;
  confidence?: string;
  reasoning?: string;
  suggestedFix?: string;
  groundingFailed?: boolean;
}
export interface DocRef { contentId: string; nodeId: string; versionId?: string; versionNum?: number }

const headers = (extra: Record<string, string> = {}) => ({ 'X-API-Key': requireEnv('SENSO_API_KEY'), ...extra });

/** GET /org/me: proves the key works. */
export function whoAmI() {
  return timed(async () => ({ org: (await http(S, `${BASE}/org/me`, { headers: headers() })).data }));
}

/** Poll GET /org/kb/nodes/{id} every 5 s until processing_status is complete. */
async function waitProcessed(nodeId: string, timeoutMs = 180_000): Promise<DocRef> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const n = (await http(S, `${BASE}/org/kb/nodes/${nodeId}`, { headers: headers() })).data;
    const st = n?.content?.processing_status;
    if (st === 'complete') return { contentId: n.content_id ?? n.content?.id, nodeId, versionNum: n.content?.version_num };
    if (st === 'failed') throw new IntegrationError(S, 200, `processing failed for node ${nodeId}: ${n?.content?.error_code ?? ''}`, 'processing_failed', n);
    if (Date.now() > deadline) throw new IntegrationError(S, 0, `node ${nodeId} still '${st}' after timeout`, 'processing_timeout', n);
    await sleep(5000);
  }
}

/**
 * Ingest raw text (or markdown) as a new KB document and wait until it is searchable.
 * POST /org/kb/raw → 202 ContentResponse. 409 (identical text exists) throws
 * IntegrationError status 409; use findDoc() + updateText() to version an existing doc.
 */
export function ingestText(title: string, text: string, o: { timeoutMs?: number } = {}) {
  return timed(async () => {
    const { data } = await http(S, `${BASE}/org/kb/raw`, { headers: headers(), json: { title, text } });
    if (!data?.kb_node_id) throw new IntegrationError(S, 202, 'ingest response had no kb_node_id', undefined, data);
    const done = await waitProcessed(data.kb_node_id, o.timeoutMs);
    return { ...done, contentId: data.id ?? done.contentId, versionId: data.latest_content_version_id as string | undefined, versionNum: data.version_num ?? done.versionNum };
  });
}

/**
 * Save a new version of an existing raw-text document (same node, same content id;
 * Senso keeps the version history). PUT /org/kb/nodes/{id}/raw, then wait for re-ingest.
 */
export function updateText(nodeId: string, title: string, text: string, o: { timeoutMs?: number } = {}) {
  return timed(async () => {
    const { data } = await http(S, `${BASE}/org/kb/nodes/${nodeId}/raw`, { method: 'PUT', headers: headers(), json: { title, text } });
    const done = await waitProcessed(nodeId, o.timeoutMs);
    return { ...done, contentId: data?.id ?? done.contentId, versionId: data?.latest_content_version_id as string | undefined, versionNum: data?.version_num ?? done.versionNum };
  });
}

/** Find KB documents by exact name. GET /org/kb/find?q= */
export function findDoc(name: string) {
  return timed(async () => {
    const { data } = await http(S, `${BASE}/org/kb/find?q=${encodeURIComponent(name)}&limit=20`, { headers: headers() });
    const nodes: any[] = data?.nodes ?? [];
    const hit = nodes.find((n) => n.type === 'content' && n.name === name);
    return { doc: hit ? ({ contentId: hit.content_id, nodeId: hit.kb_node_id, versionNum: hit.content?.version_num } as DocRef) : null };
  });
}

function toPassage(r: any, i: number): Passage {
  return {
    contentId: r?.content_id ?? '',
    nodeId: r?.kb_node_id ?? '',
    versionId: r?.version_id ?? r?.content_version_id ?? '',
    text: r?.chunk_text ?? '',
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
    return { passages: ((data?.results ?? []) as any[]).map(toPassage) };
  });
}

const DONE = new Set(['completed', 'gated', 'failed', 'canceled']);

/**
 * Claim-by-claim fact check of text against the KB. POST /org/evals/text {wait:true};
 * on 202 (wait ceiling hit) polls GET /org/evals/runs/{id}. Claims stay empty until
 * the run completes. status 'gated' = Senso refused to check (e.g. a refusal): treat as unchecked.
 * author: 'organization' (Senso's default) treats policy/terms statements as checkable claims
 * about our org; 'ai_assistant' only checks claims tied to our org, general ones become not_verifiable.
 */
export function factCheck(text: string, question?: string, o: { author?: 'ai_assistant' | 'organization'; timeoutMs?: number } = {}) {
  return timed(async () => {
    const json = { text, question, author: o.author ?? 'ai_assistant', evaluator: 'kb_accuracy', wait: true };
    let { data } = await http(S, `${BASE}/org/evals/text`, { headers: headers(), json, timeoutMs: 120_000 });
    const runId: string = data?.eval_run_id;
    const deadline = Date.now() + (o.timeoutMs ?? 180_000);
    while (!DONE.has(data?.status)) {
      if (!runId) throw new IntegrationError(S, 0, 'eval response had no eval_run_id', undefined, data);
      if (Date.now() > deadline) throw new IntegrationError(S, 0, `eval run ${runId} still '${data?.status}'`, 'eval_timeout', data);
      await sleep(5000);
      data = (await http(S, `${BASE}/org/evals/runs/${runId}`, { headers: headers() })).data;
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new IntegrationError(S, 200, `eval run ${runId} ${data.status}: ${data.error_message ?? ''}`, data.error_code ?? 'eval_failed', data);
    }
    const claims: Claim[] = ((data.claims ?? []) as any[]).map((c) => {
      const evidence: Evidence[] = (c.evidence ?? []).map((e: any) => ({ contentId: e.content_id, versionId: e.content_version_id ?? '', chunkIndex: e.chunk_index, relation: e.relation }));
      return {
        text: c.claim_text ?? '',
        verdict: normVerdict(c),
        passages: evidence.map((e, i) => ({ contentId: e.contentId, nodeId: '', versionId: e.versionId, text: c.quote ?? '', score: 0, rank: e.chunkIndex ?? i })),
        evidence,
        quote: c.quote,
        sourceText: c.source_text,
        bucket: c.bucket,
        passed: c.passed,
        confidence: c.confidence,
        reasoning: c.reasoning,
        suggestedFix: c.suggested_fix,
        groundingFailed: c.grounding_failed,
      };
    });
    return { runId, status: data.status as string, accuracyPct: data.accuracy_pct as number | undefined, band: data.band as string | undefined, claims, raw: data };
  });
}

function normVerdict(c: any): Verdict {
  const v = String(c?.verdict ?? '').toLowerCase();
  if (v === 'verified' || v === 'conflict' || v === 'unsupported' || v === 'not_verifiable') return v;
  // Spec: a checkable claim with no verdict scores as unsupported; excluded claims (passed=null) are not verifiable.
  return c?.passed === false ? 'unsupported' : 'not_verifiable';
}

/** GET /org/credits/balance (credit unit is undocumented). */
export function creditBalance() {
  return timed(async () => ({ balance: (await http(S, `${BASE}/org/credits/balance`, { headers: headers() })).data }));
}
