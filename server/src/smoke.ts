// npm run smoke [-- http://localhost:8000] → runs the SafeCart demo script against the server and prints
// one line per meaningful event. Exits 1 if any expected beat is missing.
const BASE = process.argv[2] ?? 'http://localhost:8000';
const post = (p: string, b: unknown = {}) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

async function tick(label: string) {
  const res = await post('/tick', { tick: 1, missions: [], guardrails: { autoBuyLimit: 150, dailyBudget: 400 }, spentToday: 0 });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  console.log(`\n== ${label}: ${lines.length} events`);
  for (const e of lines) {
    if (e.type === 'step' && e.step.status !== 'running') console.log(`  step  [${e.step.status}] ${e.step.title}`);
    if (e.type === 'recall') console.log(`  RECALL ${e.alert.itemKind} "${e.alert.itemTitle}" → ${e.alert.action}${e.alert.claimRef ? ` claim ${e.alert.claimRef}` : ''}${e.alert.replacementTitle ? ` · replacement ${e.alert.replacementTitle}` : ''}`);
    if (e.type === 'receipt') console.log(`  RECEIPT ${e.receipt.title} $${e.receipt.amount} ref ${e.receipt.reference} safety=${e.receipt.safety?.status ?? 'none'}`);
    if (e.type === 'approval') console.log(`  APPROVAL ${e.approval.candidate.title}: ${e.approval.reason}`);
    if (e.type === 'run') console.log(`  run ${e.run.id} ${e.run.status} · ${e.run.steps.length} steps · ${e.run.claims.length} claims · decision: ${e.run.decision?.chosen ?? '-'}`);
    if (e.type === 'error') console.log(`  ERROR ${e.message}`);
  }
  return lines;
}

const fails: string[] = [];
const expect = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
const prof = await (await fetch(BASE + '/profile')).json();
const stroller = prof.wishlist[0];
console.log(`profile: ${prof.name} · wishlist ${prof.wishlist.length} · owned ${prof.owned.length} · policy ${JSON.stringify(prof.policy)}`);
await post('/demo/reset');
let ev = await tick('1. quiet tick (nothing on sale)');
expect(ev.at(-1).type === 'done', 'tick ends with done');
await post('/demo/sale', { sku: stroller.sku, pct: 30 });
ev = await tick(`2. ${stroller.title} 30% off (recalled)`);
expect(ev.some((e) => e.type === 'recall' && e.alert.action === 'purchase_skipped'), 'recalled wishlist item skipped');
expect(ev.some((e) => e.type === 'receipt' && e.receipt.safety?.status === 'clear'), 'safe second choice bought');
await post('/demo/recall', {});
ev = await tick('3. new recall hits an owned item');
expect(ev.some((e) => e.type === 'recall' && e.alert.itemKind === 'owned'), 'owned recall alert');
expect(ev.some((e) => e.type === 'recall' && e.alert.action === 'replacement_bought'), 'replacement bought');
await post('/demo/reset'); await post('/demo/guard', { on: false }); await post('/demo/sale', { sku: stroller.sku, pct: 30 });
ev = await tick('4. NAIVE mode (recall_guard off)');
expect(ev.some((e) => e.type === 'receipt' && e.receipt.candidateId === stroller.sku), 'naive agent buys the recalled stroller');
await post('/demo/guard', {}); await post('/demo/reset');
const chat = await (await post('/chat', { message: 'is my high chair safe?', context: {} })).json();
console.log(`\n== 5. chat: ${chat.reply.split('\n')[0]}`);
expect(/RECALLED/.test(chat.reply), 'chat flags the recalled high chair');
console.log(fails.length ? `\nFAIL: ${fails.join('; ')}` : '\nALL DEMO BEATS OK');
process.exit(fails.length ? 1 : 0);
