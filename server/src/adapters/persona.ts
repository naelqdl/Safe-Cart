// Persona step-up (sponsor: Persona): before a purchase over the auto-buy limit, Maya verifies she is the person
// behind the agent. Real Persona when PERSONA_API_KEY + PERSONA_TEMPLATE_ID are set (sandbox key); otherwise a labelled
// SIMULATED inquiry that the demo bar passes or fails (POST /demo/verify). The trail stores only the inquiry id.
const API = 'https://api.withpersona.com/api/v1';
export type Inquiry = { id: string; url?: string; simulated: boolean };
export type Verdict = 'pending' | 'approved' | 'declined';

const bySku = new Map<string, Inquiry>();
const sim = new Map<string, Verdict>();
let n = 0;
const live = () => !!(process.env.PERSONA_API_KEY && process.env.PERSONA_TEMPLATE_ID);

async function call(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(API + path, {
    method, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bearer ${process.env.PERSONA_API_KEY}`, 'persona-version': '2023-01-05', 'content-type': 'application/json' },
  });
  if (!r.ok) throw new Error(`Persona ${path} → HTTP ${r.status}`);
  return r.json() as Promise<any>;
}

/** The inquiry for this purchase (created on first ask) and whether Maya has passed it. */
export async function personaCheck(sku: string, referenceId: string): Promise<Inquiry & { status: Verdict }> {
  let inq = bySku.get(sku);
  if (!inq) {
    if (live()) {
      const c = await call('/inquiries', 'POST', { data: { attributes: { 'inquiry-template-id': process.env.PERSONA_TEMPLATE_ID, 'reference-id': referenceId } } });
      const link = await call(`/inquiries/${c.data.id}/generate-one-time-link`, 'POST').catch(() => null);
      inq = { id: c.data.id, url: link?.meta?.['one-time-link'], simulated: false };
    } else {
      inq = { id: `inq_SIM_${++n}`, simulated: true };
      sim.set(inq.id, 'pending');
    }
    bySku.set(sku, inq);
  }
  if (inq.simulated) return { ...inq, status: sim.get(inq.id) ?? 'pending' };
  const s = String((await call(`/inquiries/${inq.id}`)).data?.attributes?.status);
  return { ...inq, status: ['approved', 'completed'].includes(s) ? 'approved' : ['declined', 'failed', 'expired'].includes(s) ? 'declined' : 'pending' };
}

export const personaForget = (sku: string) => void bySku.delete(sku);

/** Demo control: pass or fail the newest open SIMULATED inquiry. */
export function resolveSimulated(outcome: 'approved' | 'declined') {
  const open = [...sim].filter(([, v]) => v === 'pending').at(-1);
  if (open) sim.set(open[0], outcome);
  return open?.[0];
}

export function resetPersona() { bySku.clear(); sim.clear(); }
export const personaMode = () => (live() ? 'live' : 'simulated');
