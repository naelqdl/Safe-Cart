// SafeCart "one tick" (plans/jus.md steps 1–9). Decisions are deterministic code; models only read and verify.
import { bySku, seed, type CatalogItem, type OwnedItem, type WishItem } from './data.ts';
import { fileClaim, getListing, localPrice, placeOrder, VENDOR } from './adapters/merchant.ts';
import { getPolicy, type Policy } from './adapters/policy.ts';
import { store } from './adapters/store.ts';
import { sponsors } from './adapters/sponsors.ts';
import { checkSafety, type SafetyResult } from './safety.ts';
import { inspectListing } from './listing.ts';
import { nextId, state } from './state.ts';
import { Recorder } from './trail.ts';
import { writeClaimLetter, writeRationale, type Written } from './llm.ts';
import type { AgentEvent, Approval, RecallAlert, Receipt, SafetyCheck, TickRequest } from './wire.ts';

type Emit = (e: AgentEvent) => void;
const money = (n: number) => `$${n.toFixed(2)}`;

function recordWrite(rec: Recorder, kind: 'decide' | 'act', what: string, w: Written) {
  rec.step(kind, w.fallback ? `${what} (LLM unavailable: ${w.fallback}; template used)` : what, {
    tool: 'anthropic.messages', model: w.fallback ? undefined : w.model, latencyMs: w.latencyMs, costUsd: w.costUsd || undefined, tokens: w.tokens || undefined,
    status: w.fallback ? 'warn' : 'ok', detail: w.text.slice(0, 1200), // full claim letter reaches the web's Refund requests panel
  });
}

function alert(emit: Emit, a: Omit<RecallAlert, 'at'>) {
  const full = { ...a, at: new Date().toISOString() };
  state.alerts.set(full.id, full);
  emit({ type: 'recall', alert: full });
  return full;
}

/** Step 8: pay (Stripe TEST) → merchant order → receipt with the safety check → K-trail action. */
async function buy(rec: Recorder, emit: Emit, o: { missionId: string; item: CatalogItem; price: number; listPrice: number; safety?: SafetyCheck; auto: boolean; why: string; capUsd: number }): Promise<Receipt | undefined> {
  const done = rec.start('act', `Paying ${money(o.price)} for ${o.item.title}`, { tool: 'stripe SPT (TEST)' });
  const pay = await sponsors.pay(o.price, o.capUsd, { sku: o.item.sku, run: rec.run.id, agent: 'SafeCart' });
  const payRef = pay.ok ? (pay as any).paymentIntentId as string : nextId('pay-SIM');
  const order = await placeOrder(o.item.sku, payRef);
  done(pay.ok ? `Paid ${money(o.price)} · Stripe TEST ${payRef} · token capped at ${money(o.capUsd)}` : `Payment SIMULATED (${(pay as any).why}) · order ${order.orderRef}`, {
    status: pay.ok ? 'ok' : 'warn', latencyMs: (pay as any).latencyMs,
    detail: `${o.why} · order ${order.orderRef}${order.simulated ? ' (merchant offline: order simulated)' : ''}${pay.ok ? ` · Shared Payment Token ${(pay as any).sptId}: Stripe refuses any charge over ${money(o.capUsd)}` : ''}`,
  });
  if (pay.ok) rec.claim({ text: `Spending is capped at ${money(o.capUsd)} by the payment rail, not just by the agent`, trust: 'trusted', verdict: 'verified', loadBearing: true, stepId: rec.run.steps.at(-1)!.id, sources: [{ label: `Stripe Shared Payment Token ${(pay as any).sptId} (usage_limits.max_amount)` }] });
  const receipt: Receipt = {
    reference: payRef, missionId: o.missionId, candidateId: o.item.sku, title: o.item.title, amount: o.price, currency: 'USD',
    saved: Math.max(0, Math.round((o.listPrice - o.price) * 100) / 100), at: new Date().toISOString(), auto: o.auto, safety: o.safety,
  };
  state.spentToday += o.price;
  state.bought.set(o.missionId, receipt);
  emit({ type: 'receipt', receipt });
  rec.run.action = { kind: 'payment', mode: pay.ok ? 'test' : 'simulated', ref: payRef, amountUsd: o.price, status: pay.ok ? (pay as any).status : 'simulated' };
  rec.claim({ text: `Price ${money(o.price)} (list ${money(o.listPrice)})`, trust: 'merchant', verdict: 'not_verifiable', loadBearing: true, stepId: rec.run.steps.at(-1)!.id, sources: [{ label: `${VENDOR} listing ${o.item.sku}` }] });
  return receipt;
}

/** Steps 6 + 5 for the replacement: alternatives in the same category, safe, preferred, under the cap. */
async function findSafeAlternative(rec: Recorder, item: { sku?: string; category: string; model: string }, cap: number, preferSku?: string): Promise<{ item: CatalogItem; safety: SafetyResult } | undefined> {
  const done = rec.start('retrieve', `Searching alternatives in ${item.category.replace(/_/g, ' ')} under ${money(cap)}`, { tool: 'singlestore.findAlternatives' });
  const recalledModels = seed.recalls.flatMap((r) => r.models);
  let alts = await store.findAlternatives({ category: item.category, maxPrice: cap, excludeModels: [item.model, ...recalledModels], avoidBrands: seed.user.avoidBrands, excludeSku: item.sku });
  done(`${alts.length} alternatives (avoiding ${seed.user.avoidBrands.join(', ') || 'none'}, excluding recalled models)`, { detail: alts.map((a) => a.title).join(' · ').slice(0, 200) });
  if (!alts.length) return undefined;
  // Rank by stated preferences: SIE reranker when keyed, else keyword score; a named second choice wins ties.
  const prefs = seed.user.preferences.join('; ');
  const docs = alts.map((a) => `${a.title}. ${a.brand}. ${Object.entries(a.attrs).map(([k, v]) => `${k}: ${v}`).join(', ')}. ${a.descr}`);
  const rr = await sponsors.sieRerank(prefs, docs);
  let order = alts.map((_, i) => i);
  if (rr.ok) order = (rr as any).results.map((r: any) => r.index);
  else order.sort((a, b) => kw(docs[b]) - kw(docs[a]));
  if (preferSku) { const i = alts.findIndex((a) => a.sku === preferSku); if (i >= 0) order = [i, ...order.filter((x) => x !== i)]; }
  alts = order.map((i) => alts[i]);
  rec.step('decide', `Ranked by Maya's preferences: ${alts[0].title} first`, {
    tool: rr.ok ? 'sie.rerank' : 'keyword rank', model: rr.ok ? (rr as any).model : undefined, latencyMs: rr.ok ? (rr as any).latencyMs : undefined,
    status: rr.ok ? 'ok' : 'warn', detail: `preferences: ${prefs}${rr.ok ? '' : ` · SIE: ${(rr as any).why}`}`,
  });
  for (const alt of alts.slice(0, 3)) {
    const s = await checkSafety({ key: alt.sku, brand: alt.brand, model: alt.model, upc: alt.upc, title: alt.title, category: alt.category }, rec);
    if (s.check.status === 'clear') return { item: alt, safety: s };
  }
  return undefined;
}
const kw = (d: string) => ['light', 'narrow', 'compact', 'fold'].reduce((n, w) => n + (d.toLowerCase().includes(w) ? 1 : 0), 0);

function approval(emit: Emit, missionId: string, item: CatalogItem, price: number, listPrice: number, reason: string, replacingOwnedId?: string) {
  const a: Approval = {
    id: nextId('apr'), missionId, reason, at: new Date().toISOString(),
    candidate: { id: item.sku, title: item.title, vendor: VENDOR, price, currency: 'USD', attributes: { brand: item.brand, model: item.model, ...item.attrs }, verdict: 'selected', reason },
  };
  state.approvals.set(item.sku, { approvalId: a.id, missionId, sku: item.sku, title: item.title, price, listPrice, reason, replacingOwnedId });
  state.approvalEvents.set(a.id, a);
  emit({ type: 'approval', approval: a });
}

/** Step 7: deterministic decision. */
function decide(p: Policy, price: number, safety: SafetyCheck | undefined, spent: number): { buy: boolean; rule: string } {
  if (p.recallGuard && safety?.status === 'unknown') return { buy: false, rule: 'safety UNKNOWN: never auto-buy without an answer from a safety source' };
  if (p.recallGuard && safety?.status === 'recalled') return { buy: false, rule: 'recalled' };
  if (p.autonomy !== 'auto') return { buy: false, rule: 'autonomy = ask_first (Statsig purchase_policy)' };
  if (price > p.autoBuyLimit) return { buy: false, rule: `${money(price)} is over the auto-buy limit ${money(p.autoBuyLimit)}` };
  if (spent + price > p.dailyBudget) return { buy: false, rule: `would exceed the daily budget ${money(p.dailyBudget)}` };
  return { buy: true, rule: `${money(price)} ≤ auto-buy limit ${money(p.autoBuyLimit)}, autonomy on${p.recallGuard ? ', safety clear' : ''}` };
}

// ---------------- step 2: owned-items sweep ----------------
async function sweepOwned(emit: Emit, p: Policy, spent: () => number) {
  for (const recallId of [...state.pendingSweep]) {
    state.pendingSweep.delete(recallId);
    state.sweptRecalls.add(recallId);
    const recall = seed.recalls.find((r) => r.recallId === recallId);
    if (!recall) continue;
    const owned = (await store.matchOwnedToRecall(recallId)) as OwnedItem[];
    for (const o of owned) {
      const rec = new Recorder(emit, o.id, `Protect owned item: ${o.title}`, p.autoBuyLimit, [`CPSC recall ${recallId}`, 'file refund claim', 'buy a safe replacement']);
      rec.step('retrieve', `New CPSC recall ${recallId} matches an item Maya owns: ${o.title}`, {
        tool: 'singlestore.matchOwnedToRecall', status: 'blocked', flags: ['conflict'],
        detail: `model ${o.model} · hazard: ${recall.hazard.slice(0, 140)}`, sources: [{ label: `CPSC recall ${recallId}`, url: recall.url }],
      });
      const letter = await writeClaimLetter({ customer: seed.user.name, item: o.title, model: o.model, orderRef: o.orderRef, purchasedAt: o.purchasedAt, recallId, recallTitle: recall.title, hazard: recall.hazard, remedy: recall.remedy, recallUrl: recall.url });
      recordWrite(rec, 'act', 'Drafted refund claim letter', letter);
      const claimDone = rec.start('act', `Filing refund claim for ${o.title}`, { tool: 'merchant /api/claims' });
      const claim = await fileClaim(o.id, recallId, o.orderRef, letter.text);
      claimDone(`Refund claim ${claim.claimRef} filed${claim.simulated ? ' (SIMULATED: store offline)' : ''}`, { detail: `remedy: ${recall.remedy.slice(0, 140)}` });
      state.safety.set(o.id, { status: 'recalled', sources: [{ label: `CPSC recall ${recallId}`, url: recall.url }], checkedAt: new Date().toISOString(), recallId });
      const a = alert(emit, { id: `alert_${recallId}_${o.id}`, recallId, recallTitle: recall.title, hazard: recall.hazard, remedy: recall.remedy, url: recall.url, itemTitle: o.title, itemKind: 'owned', action: 'refund_claim_filed', claimRef: claim.claimRef });

      const repl = await findSafeAlternative(rec, { sku: o.sku, category: o.category ?? bySku(o.sku ?? '')?.category ?? '', model: o.model }, p.autoBuyLimit);
      if (!repl) { alert(emit, { ...a, action: 'needs_you' }); rec.finish('blocked'); continue; }
      const { price, listPrice } = localPriceOrListing(repl.item);
      const d = decide(p, price, repl.safety.check, spent());
      rec.run.decision = { chosen: repl.item.title, rationale: `Replaces recalled ${o.title}. ${d.rule}.`, alternatives: [{ name: o.title, whyNot: `recalled: CPSC ${recallId}` }] };
      const why = writeRationale({ decision: d.buy ? 'Bought a replacement' : 'Asked Maya first', item: repl.item.title, price, rule: d.rule, safety: repl.safety.check.status, sources: repl.safety.check.sources.map((x) => x.label), rejected: rec.run.decision.alternatives, preferences: seed.user.preferences })
        .then((w) => { rec.run.decision!.rationale = w.text; recordWrite(rec, 'decide', 'Explained decision to Maya', w); });
      if (d.buy) {
        const r = await buy(rec, emit, { missionId: o.id, item: repl.item, price, listPrice, safety: repl.safety.check, auto: true, why: `replacement for recalled ${o.title}`, capUsd: p.autoBuyLimit });
        alert(emit, { ...a, action: 'replacement_bought', replacementTitle: repl.item.title, claimRef: claim.claimRef });
        await why;
        rec.finish(r ? 'done' : 'failed');
      } else {
        approval(emit, o.id, repl.item, price, listPrice, `Replacement for recalled ${o.title}: ${d.rule}`, o.id);
        alert(emit, { ...a, action: 'needs_you', claimRef: claim.claimRef, replacementTitle: repl.item.title });
        await why;
        rec.finish('blocked');
      }
    }
  }
}
const localPriceOrListing = (c: CatalogItem) => localPrice(c.sku);

// ---------------- step 3–8: wishlist watch ----------------
async function watchWish(emit: Emit, p: Policy, w: WishItem, spent: () => number) {
  if (state.bought.has(w.id)) { emit({ type: 'mission', missionId: w.id, status: 'done', note: 'already bought' }); return; }
  const item = bySku(w.sku);
  if (!item) return;
  const l = await getListing(w.sku);
  const discount = l.listPrice > 0 ? Math.round((1 - l.price / l.listPrice) * 100) : 0;
  const onSale = l.price <= w.targetPrice || discount >= p.minDiscountPct;
  if (!onSale) { emit({ type: 'mission', missionId: w.id, status: 'watching', note: `${money(l.price)} · waiting for ≤ ${money(w.targetPrice)} or ${p.minDiscountPct}% off` }); return; }

  const rec = new Recorder(emit, w.id, `Buy "${item.title}" on sale`, Math.min(p.autoBuyLimit, w.targetPrice), [`target ${money(w.targetPrice)}`, `auto-buy ≤ ${money(p.autoBuyLimit)}`, ...seed.user.preferences]);
  rec.step('retrieve', `On sale: ${item.title} ${money(l.price)} (${discount}% off ${money(l.listPrice)})`, {
    tool: l.source === 'merchant' ? 'merchant /api/products' : 'catalog fallback (store offline)', status: l.source === 'merchant' ? 'ok' : 'warn',
    detail: `wishlist target ${money(w.targetPrice)} · rule: price ≤ target or ≥ ${p.minDiscountPct}% off`,
  });
  await inspectListing(l.listingText, item.title, rec);

  let chosen = item, price = l.price, listPrice = l.listPrice;
  let safety: SafetyCheck | undefined;
  const alternatives: { name: string; whyNot: string }[] = [];
  if (!p.recallGuard) {
    safety = { status: 'unknown', sources: [], checkedAt: new Date().toISOString() }; // unchecked: NAIVE
    rec.step('policy', 'NAIVE mode: safety check skipped (Statsig recall_guard = off)', { status: 'warn', tool: 'statsig.recall_guard', detail: 'demo contrast: this is what a normal shopping agent does' });
  } else {
    const s = await checkSafety({ key: item.sku, brand: item.brand, model: item.model, upc: item.upc, title: item.title, category: item.category }, rec);
    safety = s.check;
    if (s.check.status === 'recalled' && s.recall) {
      alert(emit, { id: `alert_${s.recall.recallId}_${w.id}`, recallId: s.recall.recallId, recallTitle: s.recall.title, hazard: s.recall.hazard, remedy: s.recall.remedy, url: s.recall.url, itemTitle: item.title, itemKind: 'wishlist', action: 'purchase_skipped' });
      alternatives.push({ name: item.title, whyNot: `recalled (CPSC ${s.recall.recallId}): ${s.recall.hazard.slice(0, 100)}` });
      const alt = await findSafeAlternative(rec, item, Math.min(w.targetPrice, p.autoBuyLimit), w.secondChoiceSku);
      if (!alt) { rec.run.decision = { chosen: 'nothing', rationale: 'Recalled, and no safe alternative fits the target price.', alternatives }; rec.finish('blocked'); emit({ type: 'mission', missionId: w.id, status: 'waiting', note: 'recalled; no safe alternative' }); return; }
      chosen = alt.item; safety = alt.safety.check;
      ({ price, listPrice } = await getListing(chosen.sku));
    }
  }
  const d = decide(p, price, safety, spent());
  rec.run.decision = { chosen: chosen.title, rationale: `${chosen === item ? 'Wishlist item on sale' : `Safe second choice for a recalled wishlist item`}. ${d.rule}.`, alternatives };
  rec.step('decide', d.buy ? `Decision: buy ${chosen.title}` : `Decision: ask Maya (${d.rule})`, { status: d.buy ? 'ok' : 'warn', tool: 'policy (deterministic)', detail: d.rule });
  const why = writeRationale({ decision: d.buy ? 'Bought' : 'Asked Maya first', item: chosen.title, price, target: w.targetPrice, rule: d.rule, safety: p.recallGuard ? safety?.status : 'not checked (NAIVE mode)', sources: safety?.sources.map((x) => x.label), rejected: alternatives, preferences: seed.user.preferences })
    .then((w) => { rec.run.decision!.rationale = w.text; recordWrite(rec, 'decide', 'Explained decision to Maya', w); });
  if (d.buy) {
    await buy(rec, emit, { missionId: w.id, item: chosen, price, listPrice, safety, auto: true, why: d.rule, capUsd: p.autoBuyLimit });
    emit({ type: 'mission', missionId: w.id, status: 'done', note: `bought ${chosen.title} for ${money(price)}` });
    await why;
    rec.finish('done');
  } else {
    approval(emit, w.id, chosen, price, listPrice, d.rule);
    emit({ type: 'mission', missionId: w.id, status: 'waiting', note: d.rule });
    await why;
    rec.finish('blocked');
  }
}

const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !['baby', 'video', 'travel', 'with'].includes(w)));
/** The dashboard sends its own mission ids; map each wishlist item to the best-matching mission by title words. */
function missionIdFor(w: WishItem, missions: TickRequest['missions'] | undefined): string {
  if (!missions?.length) return w.id;
  const it = bySku(w.sku);
  const mine = words(`${w.title ?? ''} ${it?.title ?? ''} ${it?.category ?? ''}`);
  let best = { id: w.id, n: 0 };
  for (const m of missions) { const n = [...words(m.title)].filter((x) => mine.has(x)).length; if (n > best.n) best = { id: m.id, n }; }
  return best.id;
}

export async function tick(req: Partial<TickRequest>, emit: Emit) {
  const p = await getPolicy();
  const pol = new Recorder(emit, undefined, 'Policy check', p.autoBuyLimit, []);
  pol.step('policy', `Policy: auto-buy ≤ ${money(p.autoBuyLimit)}, ≥${p.minDiscountPct}% off, autonomy ${p.autonomy}, recall_guard ${p.recallGuard ? 'ON' : 'OFF'}`, {
    tool: p.source === 'statsig' ? 'statsig' : 'defaults', latencyMs: p.latencyMs, status: p.recallGuard ? 'ok' : 'warn', detail: p.note,
  });
  const spent = () => Math.max(state.spentToday, req.spentToday ?? 0);
  await sweepOwned(emit, p, spent);
  const wish = [...seed.wishlist].sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9));
  for (const w of wish) await watchWish(emit, p, { ...w, id: missionIdFor(w, req.missions) }, spent);
}

/** POST /action: Maya approved a purchase. Runs the safety check again first (unless naive mode). */
export async function act(candidateId: string, emit: Emit) {
  const pend = state.approvals.get(candidateId);
  const item = bySku(candidateId);
  const p = await getPolicy();
  const rec = new Recorder(emit, pend?.missionId, `Approved purchase: ${item?.title ?? candidateId}`, p.dailyBudget, ['approved by Maya']);
  if (!item) return { ok: false, message: `Unknown candidate ${candidateId}`, step: lastStep(rec, 'act', `Unknown candidate ${candidateId}`, 'error') };
  const { price, listPrice } = await getListing(item.sku);
  let safety: SafetyCheck | undefined;
  if (p.recallGuard) {
    safety = (await checkSafety({ key: item.sku, brand: item.brand, model: item.model, upc: item.upc, title: item.title, category: item.category }, rec)).check;
    if (safety.status !== 'clear') {
      rec.finish('blocked');
      return { ok: false, message: `Not bought: safety ${safety.status}`, step: lastStep(rec, 'decide', `Approval refused by safety gate: ${safety.status}`, 'blocked') };
    }
  }
  if (state.spentToday + price > p.dailyBudget) {
    rec.finish('blocked');
    return { ok: false, message: 'Daily budget would be exceeded', step: lastStep(rec, 'decide', `Over daily budget ${money(p.dailyBudget)}`, 'blocked') };
  }
  const r = await buy(rec, emit, { missionId: pend?.missionId ?? item.sku, item, price, listPrice, safety, auto: false, why: 'approved by Maya', capUsd: price });
  state.approvals.delete(candidateId);
  rec.finish('done');
  return { ok: true, reference: r?.reference, message: `Bought ${item.title} for ${money(price)}`, step: toAudit(rec) };
}

function lastStep(rec: Recorder, kind: any, title: string, status: any) { rec.step(kind, title, { status }); return toAudit(rec); }
function toAudit(rec: Recorder) {
  const s = rec.run.steps.at(-1)!;
  return { id: s.id, at: s.t, kind: 'act' as const, title: s.title, detail: s.detail, status: s.status === 'ok' ? 'ok' as const : s.status === 'error' ? 'fail' as const : 'warn' as const, missionId: rec.missionId };
}
