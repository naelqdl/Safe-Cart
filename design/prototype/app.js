// SafeCart Autopilot prototype: talks to the live agent backend (server/ on :8000).
// ?api=http://host:8000 overrides the backend URL.
const API = new URLSearchParams(location.search).get('api') || 'http://localhost:8000';
const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = { focus: 0, profile: null, tab: 'wishlist', runs: [], runIx: -1, receipts: [], recalls: new Map(), busy: false, auto: false, timer: null, tick: 0, spent: 0 };
$('apiLabel').textContent = API;

async function api(path, body) {
  const res = await fetch(API + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res;
}

// ---------- panel ----------
async function loadProfile() {
  try { S.profile = await (await api('/profile')).json(); renderPanel(); }
  catch (e) { $('rows').innerHTML = `<div class="empty">Agent offline at ${esc(API)}<br>${esc(e.message)}</div>`; }
}

function badge(safety, fallback = 'idle') {
  if (!safety) return `<span class="badge ${fallback}">${fallback === 'idle' ? 'Not checked yet' : fallback}</span>`;
  if (safety.status === 'recalled') return `<span class="badge bad">Recalled · CPSC ${esc(safety.recallId ?? '')}</span>`;
  if (safety.status === 'clear') return `<span class="badge ok">Safety clear · ${safety.sources.length} sources</span>`;
  return `<span class="badge warn">${safety.sources.length ? 'Unknown' : 'Unchecked (naive)'}</span>`;
}

function renderPanel() {
  const p = S.profile; if (!p) return;
  $('who').textContent = `${p.name} · Oakland, CA`;
  const recalls = p.owned.filter((o) => o.safety?.status === 'recalled').length + p.wishlist.filter((w) => w.safety?.status === 'recalled').length;
  $('nProtected').textContent = p.wishlist.length + p.owned.length;
  $('nRecalls').textContent = Math.max(recalls, S.recalls.size);
  $('nSpent').innerHTML = `$${Math.round(S.spent)}`;
  $('policySub').textContent = `· ≤ ${money(p.policy.autoBuyLimit)} · ${p.policy.recallGuard ? 'guard on' : 'NAIVE'}`;
  $('guardSw').classList.toggle('on', p.policy.recallGuard);
  $('policy').innerHTML = [
    ['Auto-buy limit', money(p.policy.autoBuyLimit)], ['Buy when discount ≥', `${p.policy.minDiscountPct}%`],
    ['Autonomy', p.policy.autonomy === 'auto' ? 'Agent decides' : 'Asks first'], ['Recall guard', p.policy.recallGuard ? 'On' : 'Off (naive)'],
    ['Policy source', p.policy.source === 'statsig' ? 'Statsig (live)' : 'Defaults'], ...p.preferences.map((x) => ['Preference', x.label]),
  ].map(([k, v]) => `<div class="item"><span style="color:var(--muted)">${esc(k)}</span><span>${esc(v)}</span></div>`).join('');

  const bought = new Map(S.receipts.map((r) => [r.missionId, r]));
  let html = '';
  if (S.tab === 'wishlist') html = p.wishlist.map((w) => {
    const r = bought.get(w.id); const rc = w.safety?.status === 'recalled';
    const sub = r ? `<span class="badge ok">Bought ${esc(r.title)} · ${money(r.amount)}</span>` : rc ? badge(w.safety) : w.onSale ? `<span class="badge warn">On sale · target ${money(w.targetPrice)}</span>` : `<span class="badge idle">Watching · target ${money(w.targetPrice)}</span>`;
    const price = w.price < w.listPrice ? `<s>${money(w.listPrice)}</s>${money(w.price)}` : money(w.price);
    return `<button class="row ${r ? 'sel' : ''} ${rc ? 'recalled' : ''}" data-mission="${esc(w.id)}"><div><div class="name">${esc(w.title)}</div><div class="sub">${sub}</div></div><div class="price">${price}</div></button>`;
  }).join('');
  if (S.tab === 'owned') html = p.owned.map((o) => {
    const a = [...S.recalls.values()].find((x) => x.itemKind === 'owned' && x.itemTitle === o.title);
    const sub = a ? `<span class="badge bad">Recalled · refund ${esc(a.claimRef ?? 'filed')}${a.replacementTitle ? ` · replaced` : ''}</span>` : badge(o.safety);
    return `<button class="row ${o.safety?.status === 'recalled' ? 'recalled' : ''}"><div><div class="name">${esc(o.title)}</div><div class="sub">Model ${esc(o.model)} · ${esc(o.purchasedAt)}</div><div class="sub">${sub}</div></div></button>`;
  }).join('');
  if (S.tab === 'receipts') html = S.receipts.length ? [...S.receipts].reverse().map((r, i) => `<button class="row" data-receipt="${S.receipts.length - 1 - i}"><div><div class="name">${esc(r.title)}</div><div class="sub">${esc(r.reference)} · ${r.auto ? 'autonomous' : 'approved'}</div><div class="sub">${badge(r.safety, 'warn')}</div></div><div class="price">${money(r.amount)}</div></button>`).join('') : '<div class="empty">No purchases yet. Run a check.</div>';
  $('rows').innerHTML = html || '<div class="empty">Nothing here yet.</div>';
}

// ---------- stage ----------
const STAGE_OF = { fetch: 'perceive', compare: 'verify', plan: 'decide', decide: 'decide', act: 'act' };
function setPipeline(k, bad) {
  const order = ['perceive', 'verify', 'decide', 'act'];
  document.querySelectorAll('.stagebox').forEach((b) => {
    const i = order.indexOf(b.dataset.k), j = order.indexOf(k);
    b.classList.toggle('active', i === j); b.classList.toggle('done', j > -1 && i < j); b.classList.toggle('bad', i === j && !!bad);
  });
}
function feed(step) {
  const el = document.createElement('div');
  el.className = step.status === 'fail' ? 'bad' : step.status;
  el.innerHTML = `<time>${new Date(step.at).toLocaleTimeString([], { hour12: false })}</time><span>${esc(step.title)}</span>`;
  const f = $('feed'); f.prepend(el); while (f.children.length > 40) f.lastChild.remove();
}
function overlay(kind, eyebrow, title, items, prio = 0) {
  if (prio < S.focus) return; S.focus = prio;
  const o = $('overlay'); o.className = `overlay ${kind}`;
  $('ovEyebrow').textContent = eyebrow; $('ovTitle').textContent = title;
  $('ovList').innerHTML = items.map((x) => `<li>${x}</li>`).join('');
}
function target(kind, tag, name, meta) {
  const t = $('target'); t.hidden = false; t.className = `target ${kind}`;
  $('tgTag').textContent = tag; $('tgName').textContent = name;
  $('tgMeta').innerHTML = meta.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('');
}

function onStep(s) {
  feed(s);
  const k = STAGE_OF[s.kind]; if (k) setPipeline(k, s.status === 'warn' && /RECALLED|Blocked/.test(s.title));
  const m = /On sale: (.+?) \$([\d.]+) \((\d+)% off/.exec(s.title);
  if (m && s.status !== 'running') target('', 'READING LISTING', m[1], [['price', `$${m[2]}`], ['discount', `${m[3]}%`], ['trust', 'untrusted page']]);
  if (/^RECALLED: (.+)/.test(s.title)) { const t = $('target'); t.classList.add('bad'); $('tgTag').textContent = s.title.toUpperCase().slice(0, 40); }
  if (/^Safety clear/.test(s.title) && s.status !== 'running') { $('target').classList.remove('bad'); $('target').classList.add('ok'); $('tgTag').textContent = 'SAFETY CLEAR'; }
  if (/Blocked an instruction/.test(s.title)) overlay('bad', 'Injection blocked', 'A listing tried to instruct the agent.', [`${esc(s.detail ?? '')}`, 'The planner never sees untrusted instructions'], 2);
}
function onRecall(a) {
  S.recalls.set(a.id, a);
  const verb = { purchase_skipped: 'Skipped the purchase', refund_claim_filed: 'Filed a refund claim', replacement_bought: 'Bought a safe replacement', needs_you: 'Needs Maya' }[a.action];
  overlay('bad', `Recall · CPSC ${a.recallId}`, `${a.itemTitle} was recalled.`, [
    `${verb}${a.claimRef ? ` <em>${esc(a.claimRef)}</em>` : ''}${a.replacementTitle ? `: ${esc(a.replacementTitle)}` : ''}`,
    esc(a.hazard.slice(0, 150)) + '…', `<a href="${esc(a.url)}" target="_blank" style="color:#9fb7ff">CPSC notice ↗</a>`,
  ], 3);
}
function onReceipt(r) {
  S.receipts.push(r); S.spent += r.amount;
  overlay('ok', r.auto ? 'Bought autonomously' : 'Bought with approval', `${r.title}`, [
    `${money(r.amount)} <em>${esc(r.reference)}</em>`,
    r.safety?.sources?.length ? `Safety clear across ${r.safety.sources.length} sources` : 'No safety check (naive mode)',
    r.saved ? `Saved ${money(r.saved)} vs list price` : 'Paid within the $150 Stripe cap',
  ], 1);
  target('ok', 'PURCHASED', r.title, [['amount', money(r.amount)], ['payment', r.reference.startsWith('pi_') ? 'Stripe TEST' : 'simulated'], ['safety', r.safety?.status ?? 'unchecked']]);
  setPipeline('act');
}
function onRun(run) {
  if (!run.decision && run.steps.length < 2) return;
  const i = S.runs.findIndex((r) => r.id === run.id); if (i >= 0) S.runs[i] = run; else S.runs.push(run);
  renderDots();
}
function renderDots() {
  const d = $('dots');
  d.innerHTML = S.runs.map((r, i) => `<button class="${i === S.runIx ? 'on' : ''} ${r.status === 'blocked' ? 'bad' : ''}" title="${esc(r.mandate.goal)}" data-run="${i}"></button>`).join('') || '<span style="font:11px var(--mono);color:#7d8699">no runs yet</span>';
}

// ---------- tick (NDJSON stream) ----------
async function check() {
  if (S.busy) return; S.busy = true; S.focus = 0;
  $('checkNow').disabled = true; $('stage').classList.add('scanning'); setStatus();
  try {
    const p = S.profile?.policy ?? { autoBuyLimit: 150 };
    const res = await api('/tick', { tick: ++S.tick, missions: [], guardrails: { autoBuyLimit: p.autoBuyLimit, dailyBudget: 500 }, spentToday: S.spent });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl; while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
        const e = JSON.parse(line);
        if (e.type === 'step') onStep(e.step); else if (e.type === 'recall') onRecall(e.alert);
        else if (e.type === 'receipt') onReceipt(e.receipt); else if (e.type === 'run') onRun(e.run);
        else if (e.type === 'error') overlay('bad', 'Agent error', e.message, []);
      }
    }
  } catch (e) { overlay('bad', 'Agent offline', `Can't reach ${API}`, [esc(e.message)], 9); }
  S.busy = false; $('checkNow').disabled = false; $('stage').classList.remove('scanning'); setStatus();
  await loadProfile();
  document.querySelector('.panel').scrollTo({ top: 0, behavior: 'smooth' });
}
function setStatus() {
  const s = $('status'); s.className = `status ${S.busy ? 'busy' : S.auto ? 'on' : ''}`;
  $('statusText').textContent = S.busy ? 'AGENT WORKING' : S.auto ? 'AUTOPILOT ACTIVE' : 'AUTOPILOT OFF';
}

// ---------- audit trail sheet ----------
function openRun(i) {
  const r = S.runs[i]; if (!r) return; S.runIx = i; renderDots();
  const steps = r.steps.map((s) => `<div class="step ${esc(s.status)}"><div class="t">${esc(s.title)}</div>${s.detail ? `<div class="d">${esc(s.detail)}</div>` : ''}<div class="m">${[s.kind, s.tool, s.model, s.latencyMs != null ? `${s.latencyMs} ms` : '', s.costUsd ? `$${s.costUsd.toFixed(4)}` : ''].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('');
  const claims = r.claims.map((c) => `<div class="claim"><div><span class="badge ${c.verdict === 'verified' ? 'ok' : c.verdict === 'conflict' ? 'bad' : 'idle'}">${esc(c.verdict)}</span> <span class="badge idle">${esc(c.trust)}</span></div><div>${esc(c.text)}</div>${c.sources.map((s) => `<div class="src">${s.url ? `<a href="${esc(s.url)}" target="_blank">${esc(s.label)}</a>` : esc(s.label)}</div>`).join('')}</div>`).join('');
  $('sheet').innerHTML = `<header><div><h4>Audit trail · ${esc(r.status)}</h4><h3>${esc(r.mandate.goal)}</h3></div><button class="x" id="sheetX">×</button></header>
    ${r.decision ? `<div class="card"><div class="section-label">Decision</div><div style="font-weight:600">${esc(r.decision.chosen)}</div><div>${esc(r.decision.rationale)}</div>${r.decision.alternatives.map((a) => `<div class="sub" style="color:var(--muted);font-size:12px">Not ${esc(a.name)}: ${esc(a.whyNot)}</div>`).join('')}</div>` : ''}
    ${r.action ? `<div class="linkrow" style="background:var(--grey)"><span>${esc(r.action.kind)} · ${esc(r.action.mode.toUpperCase())}</span><span style="font:12px var(--mono)">${esc(r.action.ref)}</span></div>` : ''}
    <h4>Claims (${r.claims.length})</h4>${claims}
    <h4>Steps (${r.steps.length}) · cost ${money(r.cost.usd)} · ${r.cost.tokens} tokens</h4><div class="steps">${steps}</div>`;
  $('sheet').classList.add('open'); $('sheetBg').classList.add('open');
  $('sheetX').onclick = closeSheet;
}
function closeSheet() { $('sheet').classList.remove('open'); $('sheetBg').classList.remove('open'); }

// ---------- wiring ----------
$('tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); renderPanel(); };
$('rows').onclick = (e) => {
  const rb = e.target.closest('[data-receipt]'); if (rb) { const r = S.receipts[+rb.dataset.receipt]; const i = S.runs.findIndex((x) => x.action?.ref === r.reference); if (i >= 0) openRun(i); return; }
  const mb = e.target.closest('[data-mission]'); if (mb) { const i = S.runs.map((x, j) => [x, j]).filter(([x]) => x.steps.some((s) => true) && x.mandate && JSON.stringify(x).includes(mb.dataset.mission)).map(([, j]) => j).pop(); if (i !== undefined) openRun(i); }
};
$('dots').onclick = (e) => { const b = e.target.closest('[data-run]'); if (b) openRun(+b.dataset.run); };
$('prev').onclick = () => openRun(Math.max(0, (S.runIx < 0 ? S.runs.length : S.runIx) - 1));
$('next').onclick = () => openRun(Math.min(S.runs.length - 1, S.runIx + 1));
$('sheetBg').onclick = closeSheet;
$('policyRow').onclick = () => { $('policy').hidden = !$('policy').hidden; };
$('checkNow').onclick = check;
$('autoSw').onclick = () => {
  S.auto = !S.auto; $('autoSw').classList.toggle('on', S.auto); setStatus();
  clearInterval(S.timer); if (S.auto) { check(); S.timer = setInterval(check, 12000); }
};
$('guardSw').onclick = async () => { const on = !$('guardSw').classList.contains('on'); await api('/demo/guard', { on }); await loadProfile(); };
const demo = (path, body, then) => async () => { try { await api(path, body); } catch (e) { overlay('bad', 'Demo control failed', e.message, []); } if (then) await then(); else await loadProfile(); };
$('dSale').onclick = demo('/demo/sale', { sku: 'STR-BESREY-01', pct: 30 }, check);
$('dRecall').onclick = demo('/demo/recall', { recallId: '10328' }, check);
$('dInject').onclick = demo('/demo/inject', {}, check);
$('dReset').onclick = demo('/demo/reset', {}, async () => {
  Object.assign(S, { runs: [], runIx: -1, receipts: [], recalls: new Map(), spent: 0, focus: 0 }); $('feed').innerHTML = ''; $('target').hidden = true; renderDots(); setPipeline('');
  overlay('', 'Standing by', 'Protecting what Maya buys, and what she owns.', ['Every purchase is checked against U.S. CPSC recalls first', 'Owned items are re-checked when a new recall is published', 'Payments are capped by a Stripe spending token']);
  await api('/demo/guard', {}); await loadProfile();
});
$('chatBtn').onclick = () => $('chat').classList.toggle('open');
$('chatForm').onsubmit = async (e) => {
  e.preventDefault(); const q = $('chatInput').value.trim(); if (!q) return; $('chatInput').value = '';
  const log = $('chatLog'); log.insertAdjacentHTML('beforeend', `<div class="me">${esc(q)}</div>`);
  try { const r = await (await api('/chat', { message: q, context: {} })).json(); log.insertAdjacentHTML('beforeend', `<div class="ai">${esc(r.reply)}</div>`); }
  catch (err) { log.insertAdjacentHTML('beforeend', `<div class="ai">Agent offline: ${esc(err.message)}</div>`); }
  log.scrollTop = log.scrollHeight;
};
loadProfile(); setStatus();
