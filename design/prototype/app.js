// SafeCart Autopilot prototype: talks to the live agent backend (server/ on :8000).
// ?api=http://host:8000 overrides the backend URL. Keys: 1 sale · 2 recall · 3 injection · 0 reset · A autopilot · C check now.
const API = new URLSearchParams(location.search).get('api') || 'http://localhost:8000';
const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = {
  focus: 0, focusAt: 0, profile: null, tab: 'wishlist', runs: [], runIx: -1, receipts: [], recalls: new Map(),
  busy: false, auto: false, timer: null, ticker: null, nextAt: 0, tick: 0, spent: 0, t0: Date.now(), recallT: 0, highlight: null,
};
$('apiLabel').textContent = API;

async function api(path, body) {
  const res = await fetch(API + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res;
}

// ---------- panel ----------
async function loadProfile() {
  try {
    S.profile = await (await api('/profile')).json(); renderPanel();
    if (!$('feed').children.length) {
      feedLine('idle', 'ok', `Watching ${S.profile.wishlist.length} wishlist items · ${S.profile.owned.length} owned items`);
      feedLine('idle2', 'ok', 'CPSC recall feed connected · 0 new recalls');
      feedLine('idle3', 'ok', `Policy: auto-buy ≤ ${money(S.profile.policy.autoBuyLimit)} · recall guard ${S.profile.policy.recallGuard ? 'on' : 'OFF'}`);
    }
  } catch (e) { $('rows').innerHTML = `<div class="empty">Agent offline at ${esc(API)}<br>${esc(e.message)}</div>`; }
}

const payLabel = (r) => (r.reference?.startsWith('pi_') ? 'Stripe TEST' : 'simulated');
function badge(safety, fallback = 'idle') {
  if (!safety) return `<span class="badge ${fallback}">${fallback === 'idle' ? 'Not checked yet' : fallback}</span>`;
  if (safety.status === 'recalled') return `<span class="badge bad">Recalled · CPSC ${esc(safety.recallId ?? '')}</span>`;
  if (safety.status === 'clear') return `<span class="badge ok">Safety clear · ${safety.sources.length} sources</span>`;
  return `<span class="badge warn">${safety.sources.length ? 'Safety unknown' : 'Unchecked (naive)'}</span>`;
}

function renderPanel() {
  const p = S.profile; if (!p) return;
  $('who').textContent = `${p.name} · Oakland, CA`;
  const recalls = p.owned.filter((o) => o.safety?.status === 'recalled').length + p.wishlist.filter((w) => w.safety?.status === 'recalled').length;
  $('nProtected').textContent = p.wishlist.length + p.owned.length;
  $('nRecalls').textContent = Math.max(recalls, new Set([...S.recalls.values()].map((a) => a.recallId)).size);
  $('nSpent').textContent = `$${Math.round(S.spent)}`;
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
    const sub = rc && r ? `<span class="badge bad">Recalled → swapped to ${esc(r.title)}</span>`
      : r ? `<span class="badge ok">Bought · ${money(r.amount)} · ${payLabel(r)}</span>`
        : rc ? badge(w.safety) : w.onSale ? `<span class="badge warn">On sale · target ${money(w.targetPrice)}</span>` : `<span class="badge idle">Watching · target ${money(w.targetPrice)}</span>`;
    const price = w.price < w.listPrice ? `<s>${money(w.listPrice)}</s>${money(w.price)}` : money(w.price);
    return `<button class="row ${r && !rc ? 'sel' : ''} ${rc ? 'recalled' : ''}" data-mission="${esc(w.id)}"><div class="txt"><div class="name">${esc(w.title)}</div><div class="sub">${sub}</div></div><div class="price">${price}</div></button>`;
  }).join('');
  if (S.tab === 'owned') html = p.owned.map((o) => {
    const a = [...S.recalls.values()].filter((x) => x.itemKind === 'owned' && x.itemTitle === o.title).pop();
    const sub = a ? `<span class="badge bad">Recalled · refund ${esc(a.claimRef ?? 'filed')}${a.replacementTitle ? ` · replaced` : ''}</span>` : badge(o.safety);
    const hl = S.highlight === o.title;
    return `<button class="row ${o.safety?.status === 'recalled' || a ? 'recalled' : ''} ${hl ? 'sel' : ''}" data-mission="${esc(o.id)}"><div class="txt"><div class="name">${esc(o.title)}</div><div class="sub">Model ${esc(o.model)} · bought ${esc(o.purchasedAt)}</div><div class="sub">${sub}</div></div></button>`;
  }).join('');
  if (S.tab === 'receipts') html = S.receipts.length ? [...S.receipts].reverse().map((r, i) => `<button class="row sel" data-receipt="${S.receipts.length - 1 - i}"><div class="txt"><div class="name">${esc(r.title)}</div><div class="sub">${esc(payLabel(r))} · ${esc(r.reference)} · ${r.auto ? 'autonomous' : 'approved'}</div><div class="sub">${badge(r.safety, 'warn')}</div></div><div class="price">${money(r.amount)}</div></button>`).join('') : '<div class="empty">No purchases yet.</div>';
  $('rows').innerHTML = html || '<div class="empty">Nothing here yet.</div>';
}
function setTab(t) { S.tab = t; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t)); renderPanel(); }

// ---------- stage ----------
const ORDER = ['perceive', 'verify', 'decide', 'act'];
const STAGE_OF = { fetch: 'perceive', compare: 'verify', plan: 'decide', decide: 'decide', act: 'act' };
function setPipeline(k, bad) {
  document.querySelectorAll('.stagebox').forEach((b) => {
    const i = ORDER.indexOf(b.dataset.k), j = k === 'all' ? 99 : ORDER.indexOf(k);
    b.classList.toggle('active', i === j); b.classList.toggle('done', i < j); b.classList.toggle('bad', i === j && !!bad);
  });
}
function feedLine(id, cls, text, at) {
  const f = $('feed');
  const el = document.createElement('div'); el.dataset.id = id; el.className = cls;
  const t = at ? `+${Math.max(0, (Date.parse(at) - S.t0) / 1000).toFixed(1)}s` : '·';
  el.innerHTML = `<time>${t}</time><span>${esc(text)}</span>`;
  const old = f.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (old) old.replaceWith(el); else f.prepend(el);
  while (f.children.length > 12) f.lastChild.remove();
}
function overlay(kind, eyebrow, title, items, prio = 0, extra = '') {
  if (prio < S.focus && Date.now() - S.focusAt < 20000) return;
  S.focus = prio; S.focusAt = Date.now();
  $('overlay').className = `overlay ${kind}`;
  $('ovEyebrow').textContent = eyebrow; $('ovTitle').textContent = title;
  $('ovList').innerHTML = items.map((x) => `<li>${x}</li>`).join('') + (prio ? `<li class="audit"><button onclick="openRun(S.runs.length-1)">Audit trail ›</button></li>` : '');
  $('ovExtra').innerHTML = extra;
}
function target(kind, tag, name, meta) {
  const t = $('target'); t.hidden = false; t.className = `target ${kind}`;
  $('tgTag').textContent = tag; $('tgName').textContent = name;
  $('tgMeta').innerHTML = meta.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('');
}

function onStep(s) {
  feedLine(s.id, s.status === 'fail' ? 'bad' : s.status, s.title, s.at);
  const k = STAGE_OF[s.kind]; if (k) setPipeline(k, /RECALLED|Blocked/.test(s.title));
  const m = /On sale: (.+?) \$([\d.]+) \((\d+)% off/.exec(s.title);
  if (m && s.status !== 'running' && S.focus < 3) target('', 'READING LISTING', m[1], [['price', `$${m[2]}`], ['discount', `${m[3]}%`], ['trust', 'untrusted page']]);
  if (/^RECALLED: /.test(s.title) && s.status !== 'running') { const t = $('target'); t.classList.remove('ok'); t.classList.add('bad'); $('tgTag').textContent = 'RECALLED · DO NOT BUY'; }
  if (/^Safety clear/.test(s.title) && s.status !== 'running' && S.focus < 3 && !$('target').classList.contains('bad')) { $('target').classList.add('ok'); $('tgTag').textContent = 'SAFETY CLEAR'; }
  if (/Blocked an instruction/.test(s.title) && s.status !== 'running') overlay('bad', 'Injection blocked', 'Ignored an instruction hidden in a listing.', [esc(s.detail ?? ''), 'Listing text is data, never instructions. The planner never sees it.'], 2);
}
function onRecall(a) {
  S.recalls.set(a.id, a);
  const verb = { purchase_skipped: 'Skipped the purchase', refund_claim_filed: 'Filed a refund claim', replacement_bought: 'Bought a safe replacement', needs_you: 'Needs Maya' }[a.action];
  if (a.itemKind === 'owned') { S.highlight = a.itemTitle; setTab('owned'); if (!S.recallT) S.recallT = performance.now(); }
  let extra = '';
  if (a.action === 'replacement_bought' && S.recallT) {
    const secs = ((performance.now() - S.recallT) / 1000).toFixed(1);
    extra = `<div class="tts"><div class="n">${secs}<small> s</small></div><div class="l">Time to safe · recall published → refund filed → safe replacement paid · 0 taps from Maya</div></div>`;
    S.recallT = 0; ping();
  }
  overlay('bad', `${a.itemKind === 'owned' ? 'Owned item' : 'Wishlist'} · CPSC recall ${a.recallId}`, `${verb}.`, [
    `<b>${esc(a.itemTitle)}</b> · CPSC ${esc(a.recallId)}`,
    [a.claimRef ? `Refund claim <em>${esc(a.claimRef)}</em>` : '', a.replacementTitle ? `Replacement: ${esc(a.replacementTitle)}` : ''].filter(Boolean).join(' · ') || esc(a.remedy),
    `<span class="clamp">${esc(a.hazard)}</span>`, `<a href="${esc(a.url)}" target="_blank" style="color:#9fb7ff">CPSC notice ↗</a>`,
  ], 3, extra);
}
function onReceipt(r) {
  S.receipts.push(r); S.spent += r.amount;
  const isReplacement = S.profile?.owned.some((o) => o.id === r.missionId);
  overlay('ok', r.auto ? 'Bought autonomously' : 'Bought with approval', r.title, [
    `${money(r.amount)} <em>${esc(r.reference)}</em>`,
    r.safety?.sources?.length ? `Safety clear across ${r.safety.sources.length} sources` : 'No safety check (naive mode)',
    r.saved ? `Saved ${money(r.saved)} vs list price` : 'Paid within the Stripe spending cap',
  ], 1);
  if (S.focus < 3 || isReplacement) target('ok', isReplacement ? 'SAFE REPLACEMENT · PAID' : 'PURCHASED', r.title, [['amount', money(r.amount)], ['payment', payLabel(r)], ['safety', r.safety?.status ?? 'unchecked']]);
  setPipeline('act');
}
function onRun(run) {
  if (!run.decision && run.steps.length < 2) return;
  const i = S.runs.findIndex((r) => r.id === run.id); if (i >= 0) S.runs[i] = run; else S.runs.push(run);
  renderDots();
}
function renderDots() {
  $('carousel').hidden = !S.runs.length;
  $('dots').innerHTML = S.runs.map((r, i) => `<button class="${i === S.runIx ? 'on' : ''} ${r.status === 'blocked' ? 'bad' : ''}" title="${esc(r.mandate.goal)}" aria-label="${esc(r.mandate.goal)}" data-run="${i}"></button>`).join('');
}
function ping() { const p = document.createElement('div'); p.className = 'ping'; $('stage').appendChild(p); setTimeout(() => p.remove(), 1600); }

// ---------- tick (NDJSON stream) ----------
async function check(fresh = true) {
  if (S.busy) return; S.busy = true; if (fresh) S.focus = 0;
  S.t0 = Date.now(); $('stage').classList.add('scanning'); setStatus();
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
        else if (e.type === 'error') overlay('bad', 'Agent error', e.message, [], 9);
      }
    }
    setPipeline('all');
  } catch (e) { overlay('bad', 'Agent offline', `Can't reach ${API}`, [esc(e.message)], 9); }
  S.busy = false; $('stage').classList.remove('scanning'); setStatus();
  await loadProfile();
}
function setStatus() {
  const s = $('status'); s.className = `status ${S.busy ? 'busy' : S.auto ? 'on' : ''}`;
  $('statusText').textContent = S.busy ? 'AGENT WORKING' : S.auto ? 'AUTOPILOT ENGAGED' : 'AUTOPILOT OFF';
  $('stage').classList.toggle('armed', S.auto);
  const cta = $('cta'); cta.classList.toggle('on', S.auto);
  cta.textContent = S.auto ? (S.busy ? 'Engaged · checking now…' : `Engaged · next check in ${Math.max(0, Math.ceil((S.nextAt - Date.now()) / 1000))} s`) : 'Engage Autopilot';
}
function setAuto(on) {
  S.auto = on; $('autoSw').classList.toggle('on', on);
  clearInterval(S.timer); clearInterval(S.ticker);
  if (on) {
    check(); S.nextAt = Date.now() + 12000;
    S.timer = setInterval(() => { S.nextAt = Date.now() + 12000; check(false); }, 12000);
    S.ticker = setInterval(setStatus, 1000);
  }
  setStatus();
}

// ---------- audit trail sheet ----------
function openRun(i) {
  const r = S.runs[i]; if (!r) return; S.runIx = i; renderDots();
  const v = (x) => esc(String(x).replaceAll('_', ' '));
  const steps = r.steps.map((s) => `<div class="step ${esc(s.status)}"><div class="t">${esc(s.title)}</div>${s.detail ? `<div class="d">${esc(s.detail)}</div>` : ''}<div class="m">${[s.kind, s.tool, s.model, s.latencyMs != null ? `${s.latencyMs} ms` : '', s.costUsd ? `$${s.costUsd.toFixed(4)}` : ''].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('');
  const claims = r.claims.map((c) => `<div class="claim"><div><span class="badge ${c.verdict === 'verified' ? 'ok' : c.verdict === 'conflict' ? 'bad' : 'idle'}">${v(c.verdict)}</span> <span class="badge idle">${v(c.trust)}</span></div><div>${esc(c.text)}</div>${c.sources.map((s) => `<div class="src">${s.url ? `<a href="${esc(s.url)}" target="_blank">${esc(s.label)}</a>` : esc(s.label)}</div>`).join('')}</div>`).join('');
  $('sheet').innerHTML = `<header><div><h4>Audit trail · ${esc(r.status)}</h4><h3>${esc(r.mandate.goal)}</h3></div><button class="x" id="sheetX" aria-label="Close">×</button></header>
    ${r.decision ? `<div class="card"><div class="section-label">Decision</div><div style="font-weight:600">${esc(r.decision.chosen)}</div><div>${esc(r.decision.rationale)}</div>${r.decision.alternatives.map((a) => `<div style="color:var(--muted);font-size:12px">Not ${esc(a.name)}: ${esc(a.whyNot)}</div>`).join('')}</div>` : ''}
    ${r.action ? `<div class="linkrow"><span>${esc(r.action.kind)} · ${esc(r.action.mode.toUpperCase())}</span><span style="font:12px var(--mono)">${esc(r.action.ref)}</span></div>` : ''}
    <h4>Claims (${r.claims.length})</h4>${claims}
    <h4>Steps (${r.steps.length}) · cost ${money(r.cost.usd)} · ${r.cost.tokens} tokens</h4><div class="steps">${steps}</div>`;
  $('sheet').classList.add('open'); $('sheetBg').classList.add('open');
  $('sheetX').onclick = closeSheet;
}
function closeSheet() { $('sheet').classList.remove('open'); $('sheetBg').classList.remove('open'); }
window.openRun = openRun; window.S = S;

// ---------- wiring ----------
$('tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.highlight = null; setTab(b.dataset.tab); } };
$('rows').onclick = (e) => {
  const rb = e.target.closest('[data-receipt]');
  if (rb) { const r = S.receipts[+rb.dataset.receipt]; const i = S.runs.findIndex((x) => x.action?.ref === r.reference); if (i >= 0) openRun(i); return; }
  const mb = e.target.closest('[data-mission]');
  if (mb) { const id = mb.dataset.mission; const i = S.runs.map((x, j) => [x, j]).filter(([x]) => x.action && S.receipts.some((r) => r.missionId === id && r.reference === x.action.ref)).map(([, j]) => j).pop(); if (i !== undefined) openRun(i); }
};
$('dots').onclick = (e) => { const b = e.target.closest('[data-run]'); if (b) openRun(+b.dataset.run); };
$('prev').onclick = () => openRun(Math.max(0, (S.runIx < 0 ? S.runs.length : S.runIx) - 1));
$('next').onclick = () => openRun(Math.min(S.runs.length - 1, S.runIx + 1));
$('sheetBg').onclick = closeSheet;
$('policyRow').onclick = () => { $('policy').hidden = !$('policy').hidden; };
$('cta').onclick = () => setAuto(!S.auto);
$('autoSw').onclick = () => setAuto(!S.auto);
$('checkNow').onclick = (e) => { e.preventDefault(); check(); };
$('guardSw').onclick = async () => { const on = !$('guardSw').classList.contains('on'); await api('/demo/guard', { on }); await loadProfile(); feedLine('guard', on ? 'ok' : 'warn', `Recall guard ${on ? 'ON' : 'OFF: naive agent, safety checks skipped'}`); };
const demo = (path, body, before) => async () => { if (before) before(); try { await api(path, body); } catch (e) { overlay('bad', 'Demo control failed', e.message, [], 9); } await check(); };
$('dSale').onclick = demo('/demo/sale', { sku: 'STR-BESREY-01', pct: 30 });
$('dRecall').onclick = demo('/demo/recall', { recallId: '10328' }, () => { S.recallT = performance.now(); });
$('dInject').onclick = demo('/demo/inject', {});
$('dReset').onclick = async () => {
  setAuto(false);
  try { await api('/demo/reset', {}); await api('/demo/guard', {}); } catch (e) { overlay('bad', 'Reset failed', e.message, [], 9); }
  Object.assign(S, { runs: [], runIx: -1, receipts: [], recalls: new Map(), spent: 0, focus: 0, recallT: 0, highlight: null });
  $('feed').innerHTML = ''; $('target').hidden = true; renderDots(); setPipeline(''); setTab('wishlist');
  overlay('', 'Standing by', 'Protecting what Maya buys, and what she owns.', ['Every purchase is checked against U.S. CPSC recalls first', 'Owned items are re-checked when a new recall is published', 'Payments are capped by a Stripe spending token'], 0);
  await loadProfile();
};
const KEYS = { 1: 'dSale', 2: 'dRecall', 3: 'dInject', 0: 'dReset' };
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  const k = e.key.toLowerCase();
  if (KEYS[k]) $(KEYS[k]).click();
  if (k === 'a') setAuto(!S.auto);
  if (k === 'c') check();
  if (k === 'escape') closeSheet();
});
$('chatBtn').onclick = () => $('chat').classList.toggle('open');
$('chatForm').onsubmit = async (e) => {
  e.preventDefault(); const q = $('chatInput').value.trim(); if (!q) return; $('chatInput').value = '';
  const log = $('chatLog'); log.insertAdjacentHTML('beforeend', `<div class="me">${esc(q)}</div>`);
  try { const r = await (await api('/chat', { message: q, context: {} })).json(); log.insertAdjacentHTML('beforeend', `<div class="ai">${esc(r.reply)}</div>`); }
  catch (err) { log.insertAdjacentHTML('beforeend', `<div class="ai">Agent offline: ${esc(err.message)}</div>`); }
  log.scrollTop = log.scrollHeight;
};
loadProfile(); setStatus(); renderDots();
