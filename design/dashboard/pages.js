// Content pages ported from the team dashboard (web/): Recalls, Refunds, Memory, Approvals, Activity, Runs, Missions.
// Same data as the live stage (window.SC.S, fed by /tick events) + GET /profile and GET /refunds on the agent.
(() => {
  const { S, esc, money } = window.SC;
  const $ = (id) => document.getElementById(id);
  const PIC = { Recalls: 'triangle-alert', Refunds: 'receipt-text', Memory: 'brain', Approvals: 'shield-check', Activity: 'activity', Runs: 'list-tree', Missions: 'crosshair' };
  const head = (title, sub, right = '') => `<div class="pg-head"><div><span class="pg-ic">${ic(PIC[title] ?? 'gauge', 24)}</span><h2>${title}</h2><p>${sub}</p></div>${right}</div>`;
  const sec = (icon, t, style = '') => `<div class="sec" style="${style}">${ic(icon, 15)}${t}</div>`;
  const empty = (t) => `<div class="pg-card"><p style="color:var(--muted)">${t}</p></div>`;
  const ago = (iso) => { const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };
  const ACT = { purchase_skipped: ['Skipped the purchase', 'warn'], refund_claim_filed: ['Refund claim filed', 'steel'], replacement_bought: ['Safe replacement bought', 'ok'], needs_you: ['Needs Maya', 'bad'] };
  const localMissions = [];

  function recalls() {
    const list = [...S.recalls.values()].reverse();
    $('ctRecalls').hidden = !list.length; $('ctRecalls').textContent = new Set(list.map((a) => a.recallId)).size;
    $('pgRecalls').innerHTML = head('Recalls', 'Every recall that touched something Maya owns or wants, and what the agent did about it.') +
      (list.length ? list.map((a) => `<div class="pg-card bad">
        <div class="chips"><span class="badge bad">CPSC ${esc(a.recallId)}</span><span class="badge idle">${a.itemKind}</span><span class="badge ${ACT[a.action]?.[1] ?? 'idle'}">${ACT[a.action]?.[0] ?? a.action}</span><span class="meta">${ago(a.at)}</span></div>
        <h3>${esc(a.itemTitle)}</h3>
        <p><b>Hazard.</b> ${esc(a.hazard)}</p><p><b>Remedy.</b> ${esc(a.remedy)}</p>
        <div class="chips">${a.claimRef ? `<span class="chip">Refund claim ${esc(a.claimRef)}</span>` : ''}${a.replacementTitle ? `<span class="chip">Replacement: ${esc(a.replacementTitle)}</span>` : ''}<a class="chip" href="${esc(a.url)}" target="_blank">${ic('external-link', 14)}CPSC notice</a></div>
      </div>`).join('') : empty('No recalls affect Maya’s items yet. Press 2 to publish one.'));
  }

  // Refunds: live requests the agent filed at the store (+ Claude's letter, store reply, recall facts) and
  // sample requests on real CPSC recalls (data/sample-refunds.json, labelled Sample), like the web Refunds tab.
  const RF = { refund_approved: ['Refund approved', 'ok'], info_requested: ['Store needs info', 'steel'] };
  const rfStatus = (c) => RF[c.status] ?? ['Waiting for reply', 'warn'];
  const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const allRefunds = () => [...(S.refunds.claims ?? []), ...(S.refunds.samples ?? [])];
  let rfSig = '';
  async function loadRefunds() {
    try { const r = await (await SC.api('/refunds')).json(); S.refunds = { claims: r.claims ?? [], samples: r.samples ?? [], source: r.source }; }
    catch (e) { S.refunds = { ...S.refunds, error: e.message }; }
    const sig = JSON.stringify(allRefunds().map((c) => [c.claimRef, c.status, !!c.reply]));
    if (sig !== rfSig) { rfSig = sig; refundsPage(); SC.emit('refunds'); }
  }
  function refundsPage() {
    const el = $('pgRefunds'); if (!el) return;
    const list = allRefunds(); const replied = list.filter((c) => c.reply).length; const live = S.refunds.claims?.length ?? 0;
    $('ctRefunds').hidden = !live; $('ctRefunds').textContent = live;
    el.innerHTML = head('Refunds', 'What SafeCart sent for Maya’s recalled items, and what came back. Click one to read the emails.',
      `<div class="chips"><span class="badge idle">${list.length} sent</span><span class="badge ${replied ? 'ok' : 'idle'}">${replied} replied</span></div>`) +
      (S.refunds.error ? `<p class="fine-note" style="color:var(--bad)">Couldn't reach the agent: ${esc(S.refunds.error)}</p>` : '') +
      `<div class="pg-card flush"><ul class="rf-list">${list.map((c) => {
        const [label, cls] = rfStatus(c);
        const byClaude = c.letterModel && c.letterModel !== 'template';
        return `<li><button class="rf-row" data-rf="${esc(c.claimRef)}">
          <span class="rf-main">${ic('mail', 18, 'rf-ic')}
            <span class="rf-txt"><b>${esc(c.itemTitle)}</b><small>To ${esc(c.to ?? 'Demo Baby Store')} · CPSC recall ${esc(c.recallId ?? '?')} · ${when(c.at)}</small></span></span>
          <span class="rf-tags">${c.sample ? '<span class="tag">Sample</span>' : '<span class="tag live">Live</span>'}${byClaude ? '<span class="tag">Letter by Claude</span>' : ''}<span class="badge ${cls}">${label}</span></span>
        </button></li>`;
      }).join('') || '<li class="rf-empty">No refund requests yet.</li>'}</ul></div>
      <p class="fine-note">Live requests come from the simulated store, which replies automatically after about 10 s. Sample requests use real CPSC recalls from November 2026 (saferproducts.gov); their emails, order numbers and replies are made up for the demo.</p>`;
  }
  const email = (from, to, at, body) => `<article class="email"><dl><dt>From</dt><dd>${esc(from)}</dd><dt>To</dt><dd>${esc(to)}</dd><dt>Sent</dt><dd>${when(at)}</dd></dl><div class="body">${esc(body)}</div></article>`;
  function openRefund(ref) {
    const c = allRefunds().find((x) => x.claimRef === ref); if (!c) return;
    const [label, cls] = rfStatus(c); const to = c.to ?? 'Demo Baby Store'; const me = 'SafeCart, for Maya Chen';
    const sh = $('sheet');
    sh.innerHTML = `<header><div><h4>Refund request · ${esc(c.claimRef)}</h4><h3>${esc(c.itemTitle)}</h3>
        <div class="chips" style="margin-top:8px"><span class="badge ${cls}">${label}</span>${c.sample ? '<span class="tag">Sample</span>' : '<span class="tag live">Live</span>'}${c.orderRef ? `<span class="tag">Order ${esc(c.orderRef)}</span>` : ''}</div></div>
        <button class="x" id="sheetX" aria-label="Close">×</button></header>
      <h4>Sent${c.letterModel && c.letterModel !== 'template' ? ` · written by ${esc(c.letterModel)}` : ''}</h4>${email(me, to, c.at, c.message ?? 'Letter not recorded for this request.')}
      <h4>Reply</h4>${c.reply ? email(to, me, c.reply.at, c.reply.text) : '<p class="fine-note">No reply yet.</p>'}
      ${c.hazard || c.url ? `<h4>CPSC recall ${esc(c.recallId)}</h4><div class="pg-card">${c.recallTitle ? `<h3>${esc(c.recallTitle)}</h3>` : ''}${c.hazard ? `<p><b>Hazard.</b> ${esc(c.hazard)}</p>` : ''}${c.remedy ? `<p><b>Remedy.</b> ${esc(c.remedy)}</p>` : ''}${c.url ? `<a class="btn ghost" style="justify-self:start" href="${esc(c.url)}" target="_blank" rel="noreferrer">Recall notice on cpsc.gov ↗</a>` : ''}</div>` : ''}`;
    sh.classList.add('open'); $('sheetBg').classList.add('open');
    $('sheetX').onclick = () => { sh.classList.remove('open'); $('sheetBg').classList.remove('open'); };
  }
  SC.openRefund = openRefund;
  S.refunds = { claims: [], samples: [] };

  // ---- shared visual rows: a status dot, the item, a price-vs-target bar, the price ----
  const tone = (st) => (st === 'recalled' ? 'bad' : st === 'bought' ? 'ok' : st === 'on sale' ? 'warn' : st === 'safe' ? 'ok' : 'idle');
  const pbar = (price, list, target) => {
    const max = Math.max(list || 0, price || 0, target || 0) * 1.04 || 1; const pc = (v) => Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1);
    return `<div class="pbar ${price <= target ? 'hit' : ''}" title="${money(price)} now · target ${money(target)}"><i style="width:${pc(price)}%"></i><b style="left:${pc(target)}%"></b></div>`;
  };
  const mrow = (st, title, sub, mid, right) => `<div class="mrow"><span class="mdot ${tone(st)}"></span><div class="mt"><b>${esc(title)}</b>${sub ? `<small class="${tone(st)}">${sub}</small>` : ''}</div><div class="mmid">${mid}</div><div class="mp">${right}</div></div>`;
  function memory() {
    const p = S.profile; if (!p) return;
    const bought = new Map(S.receipts.map((r) => [r.missionId, r]));
    const wst = (w) => (bought.has(w.id) ? 'bought' : w.safety?.status === 'recalled' ? 'recalled' : w.onSale ? 'on sale' : 'watching');
    const ost = (o) => (o.safety?.status === 'recalled' ? 'recalled' : o.safety?.status === 'clear' ? 'safe' : 'idle');
    $('pgMemory').innerHTML = head('Memory', 'What SafeCart knows about Maya.') +
      `<div class="chips">${p.preferences.map((x) => `<span class="chip ${x.source === 'memory' ? 'mem' : ''}">${esc(x.label)}</span>`).join('')}</div>
       <div class="mlist"><div class="mhead"><span>Wants</span><span>${p.wishlist.length}</span></div>${p.wishlist.map((w) => mrow(wst(w), w.title, wst(w) === 'recalled' ? `Recalled · CPSC ${esc(w.safety.recallId)}` : wst(w), pbar(w.price, w.listPrice, w.targetPrice), `<b>${money(w.price)}</b><small>target ${money(w.targetPrice)}</small>`)).join('')}</div>
       <div class="mlist"><div class="mhead"><span>Owns</span><span>${p.owned.length}</span></div>${p.owned.map((o) => mrow(ost(o), o.title, ost(o) === 'recalled' ? `Recalled · CPSC ${esc(o.safety.recallId)}` : ost(o) === 'safe' ? 'Safe' : 'Not checked yet', `<span class="mmeta">${esc(o.merchant)}</span>`, `<small>${esc(o.purchasedAt)}</small>`)).join('')}</div>`;
  }
  function approvals() {
    const list = [...S.approvals.values()];
    $('ctApprovals').hidden = !list.length; $('ctApprovals').textContent = list.length;
    $('pgApprovals').innerHTML = head('Approvals', 'Purchases above Maya’s auto-buy limit wait here. Approving re-runs the safety check and asks for a Persona identity check before paying.') +
      (list.length ? list.map((a) => `<div class="pg-card"><div class="chips"><span class="badge warn">Waiting</span><span class="meta">${ago(a.at)}</span></div>
        <h3>${esc(a.candidate.title)} · ${money(a.candidate.price)}</h3><p>${esc(a.reason)}</p>
        ${a.verify ? `<div class="pg-card"><div class="chips"><span class="badge steel">Persona</span><span class="meta">Identity check · inquiry ${esc(a.verify.inquiryId)}${a.verify.simulated ? ' · SIMULATED (no Persona key)' : ''}</span></div>
          <p>${esc(a.note ?? '')}</p>
          ${a.verify.url ? `<p><a href="${esc(a.verify.url)}" target="_blank" rel="noreferrer">Verify with Persona</a>, then press Approve again.</p>` : ''}
          ${a.verify.simulated ? `<div class="chips"><button class="btn" data-pv-pass="${esc(a.id)}">Pass check as Maya</button><button class="btn ghost" data-pv-fail="${esc(a.id)}">Fail check</button></div>` : ''}</div>` : ''}
        <div class="chips"><button class="btn" data-ap="${esc(a.id)}">Approve</button><button class="btn ghost" data-de="${esc(a.id)}">Decline</button></div></div>`).join('')
        : empty('Nothing waiting. Everything so far fit the policy, so the agent acted on its own.'));
  }

  function activity() {
    const steps = [...S.steps].reverse();
    $('pgActivity').innerHTML = head('Activity', `Every check, decision and purchase, as it happened. ${steps.length} steps.`, '<button class="btn ghost" id="exportBtn">Export JSON</button>') +
      (steps.length ? `<div class="pg-card"><div class="tl">${steps.slice(0, 120).map((s) => `<div class="it ${esc(s.status)}"><div>${esc(s.title)}</div>${s.detail ? `<div class="m" style="color:var(--ink-2)">${esc(s.detail.slice(0, 220))}</div>` : ''}<div class="m">${new Date(s.at).toLocaleTimeString([], { hour12: false })} · ${esc(s.kind)}${s.missionId ? ` · ${esc(s.missionId)}` : ''}</div></div>`).join('')}</div></div>` : empty('No activity yet. Engage Autopilot or press C.'));
    $('exportBtn').onclick = () => {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: S.profile, receipts: S.receipts, recalls: [...S.recalls.values()], runs: S.runs, events: S.events }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `safecart-audit-${Date.now()}.json`; a.click();
    };
  }

  function runs() {
    $('pgRuns').innerHTML = head('Runs', 'Each autonomous decision, with its full audit trail: claims, sources, steps, cost.') +
      (S.runs.length ? `<div class="pg-grid">${S.runs.map((r, i) => {
        const inj = r.steps.some((s) => (s.flags ?? []).includes('injection_blocked'));
        return `<button class="pg-card ${r.status === 'blocked' ? 'bad' : r.action ? 'ok' : ''}" style="text-align:left" data-run="${i}">
          <div class="chips"><span class="badge ${r.status === 'done' ? 'ok' : r.status === 'blocked' ? 'bad' : 'idle'}">${esc(r.status)}</span>${inj ? '<span class="badge warn">Injection blocked</span>' : ''}${r.action ? `<span class="badge steel">${esc(r.action.mode)}</span>` : ''}</div>
          <h3>${esc(r.mandate.goal)}</h3><p>${esc(r.decision?.rationale?.slice(0, 160) ?? '')}</p>
          <div class="meta">${r.steps.length} steps · ${r.claims.length} claims · ${money(r.cost.usd)} · ${r.cost.tokens} tokens</div></button>`;
      }).join('')}</div>` : empty('No runs yet.'));
  }

  function missions() {
    const p = S.profile; if (!p) return;
    const bought = new Map(S.receipts.map((r) => [r.missionId, r]));
    const rows = p.wishlist.map((w) => { const b = bought.get(w.id); const st = b ? 'bought' : w.safety?.status === 'recalled' ? 'recalled' : w.onSale ? 'on sale' : 'watching';
      return mrow(st, w.title, b ? `Bought ${esc(b.title)} · ${money(b.amount)}` : st === 'recalled' ? 'Recalled · will buy a safe alternative' : st === 'on sale' ? `On sale · ${Math.round((1 - w.price / w.listPrice) * 100)}% off` : 'Watching for a sale',
        pbar(w.price, w.listPrice, w.targetPrice), `<b>${money(w.price)}</b><small>target ${money(w.targetPrice)}</small>`); });
    const local = localMissions.map((m) => mrow('watching', m.title, 'Added here · not sent to the agent', '<span class="mmeta">no price yet</span>', `<small>max ${money(m.max)}</small>`));
    $('pgMissions').innerHTML = head('Missions', 'What the agent is watching for Maya, and how close each price is to her target.') +
      `<div class="mlist"><div class="mhead"><span>Watching</span><span>${rows.length + local.length}</span></div>${rows.join('')}${local.join('')}
        <form class="form madd" id="mForm"><input id="mTitle" placeholder="Watch another item…"><input id="mMax" placeholder="Max $" style="flex:0 0 110px"><button class="btn">Add</button></form></div>`;
    $('mForm').onsubmit = (e) => { e.preventDefault(); const t = $('mTitle').value.trim(), mx = parseFloat($('mMax').value); if (!t) return; localMissions.push({ title: t, max: isFinite(mx) ? mx : 0 }); missions(); };
  }
  function renderAll() { recalls(); memory(); approvals(); activity(); runs(); missions(); refundsPage(); }
  document.addEventListener('click', (e) => {
    const ap = e.target.closest('[data-ap]'); if (ap) SC.approve(ap.dataset.ap, true);
    const de = e.target.closest('[data-de]'); if (de) SC.approve(de.dataset.de, false);
    const pp = e.target.closest('[data-pv-pass]'); if (pp) SC.verify(pp.dataset.pvPass, 'approved');
    const pf = e.target.closest('[data-pv-fail]'); if (pf) SC.verify(pf.dataset.pvFail, 'declined');
    const rn = e.target.closest('.view.page [data-run]'); if (rn) SC.openRun(+rn.dataset.run);
    const rf = e.target.closest('[data-rf]'); if (rf) openRefund(rf.dataset.rf);
  });
  let t = null;
  let wantRefunds = false; // remember the request: 'profile' follows 'tickdone' within the debounce window
  SC.on((type) => {
    if (type === 'tickdone' || type === 'reset' || (type === 'page' && S.page === 'refunds')) wantRefunds = true;
    clearTimeout(t);
    t = setTimeout(() => { renderAll(); if (wantRefunds) { wantRefunds = false; loadRefunds(); } }, 80);
  });
  // the store answers ~10 s after a claim: poll while a reply is pending or the user is looking
  setInterval(() => { if (S.page === 'refunds' || S.page === 'graph' || S.page === 'autopilot' || S.refunds.claims.some((c) => !c.reply)) loadRefunds(); }, 3000);
  loadRefunds();
})();
