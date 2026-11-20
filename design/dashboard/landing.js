// Landing pipeline map + small interaction layer: step metrics, click-to-open detail drawer,
// header Autopilot toggle, chat as a sliding column, click ripples. Reads window.SC; no server calls of its own.
(() => {
  const { S, esc, money } = window.SC;
  const $ = (id) => document.getElementById(id);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let open = null;

  // ---------- metrics on each step ----------
  function metrics() {
    const p = S.profile; if (!p) return;
    const recalls = new Set([...S.recalls.values()].map((a) => a.recallId)).size;
    const onSale = p.wishlist.filter((w) => w.onSale).length;
    const traps = S.steps.filter((s) => /Blocked an instruction/.test(s.title) && s.status !== 'running').length;
    const refunds = S.refunds?.claims?.length ?? 0;
    const lim = money(p.policy?.autoBuyLimit ?? 150).replace('.00', '');
    const m = {
      watch: [p.wishlist.length + p.owned.length, 'items watched'],
      perceive: traps ? [traps, traps === 1 ? 'trap blocked' : 'traps blocked'] : [onSale, 'on sale now'],
      verify: [recalls, recalls === 1 ? 'recall caught' : 'recalls caught'],
      decide: S.approvals.size ? [S.approvals.size, 'need Maya'] : [lim, 'auto-buy limit'],
      act: [money(S.spent).replace('.00', ''), refunds ? `spent · ${plural(refunds, 'refund')}` : 'spent today'],
      safe: [$('nProtected')?.textContent ?? '0', 'protected'],
    };
    for (const [k, [n, l]] of Object.entries(m)) {
      const el = document.querySelector(`[data-m="${k}"]`); if (!el) continue;
      const html = `<em>${esc(String(n))}</em><span>${esc(l)}</span>`;
      if (el.innerHTML !== html) { el.innerHTML = html; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
    }
    if (open) detail(open, false);
  }

  // ---------- detail drawer ----------
  const go = (page, label) => `<button class="btn ghost" data-go="${page}">${label} ${ic('chevron-right', 14)}</button>`;
  const tiles = (arr) => `<div class="fd-stats">${arr.map(([n, l, c = '']) => `<div><b class="${c}">${n}</b><span>${l}</span></div>`).join('')}</div>`;
  const badgeOf = (s) => (!s ? '<span class="badge idle">Not checked</span>' : s.status === 'recalled' ? `<span class="badge bad">Recalled · CPSC ${esc(s.recallId)}</span>` : s.status === 'clear' ? '<span class="badge ok">Safe</span>' : '<span class="badge warn">Unknown</span>');
  const lastRun = () => [...S.runs].reverse().find((r) => r.decision);
  const D = {
    watch: (p) => `<h3>${ic('heart', 18)}Maya's lists</h3>
      <div class="fd-cols"><div><div class="fd-k">Wants</div>${p.wishlist.map((w) => `<div class="fd-row"><span>${esc(w.title)}</span>${badgeOf(w.safety)}</div>`).join('')}</div>
      <div><div class="fd-k">Owns</div>${p.owned.slice(0, 6).map((o) => `<div class="fd-row"><span>${esc(o.title)}</span>${badgeOf(o.safety)}</div>`).join('')}</div></div>
      <div class="fd-act">${go('memory', 'Open Memory')}${go('missions', 'Missions')}</div>`,
    perceive: (p) => `<h3>${ic('scan-eye', 18)}Perceive</h3><p>Reads store prices and listing pages. Listing text is untrusted: it is screened for hidden instructions before the planner sees anything.</p>
      ${tiles([[p.wishlist.filter((w) => w.onSale).length, 'on sale now'], [S.steps.filter((s) => s.kind === 'fetch').length, 'listings read'], [S.steps.filter((s) => /Blocked an instruction/.test(s.title) && s.status !== 'running').length, 'traps blocked', 'bad']])}
      <div class="fd-act">${go('missions', 'Missions')}${go('activity', 'Activity')}</div>`,
    verify: () => { const recalls = [...S.recalls.values()]; return `<h3>${ic('shield-check', 18)}Verify</h3><p>Before any money moves, every item is checked against live CPSC recalls, the recall table and Senso's trusted notices. Any match means no purchase.</p>
      ${tiles([[3, 'sources per check'], [new Set(recalls.map((a) => a.recallId)).size, 'recalls caught', recalls.length ? 'bad' : '']])}
      ${recalls.slice(-3).reverse().map((a) => `<div class="fd-row"><span>${esc(a.itemTitle)}</span><span class="badge bad">CPSC ${esc(a.recallId)}</span></div>`).join('')}
      <div class="fd-act">${go('recalls', 'Open Recalls')}${go('graph', 'Trust graph')}</div>`; },
    decide: (p) => { const r = lastRun(); return `<h3>${ic('scale', 18)}Decide</h3><p>Fixed policy rules make the call. Claude only explains it in plain English, it never decides.</p>
      ${tiles([[money(p.policy?.autoBuyLimit ?? 150), 'auto-buy limit'], [p.policy?.recallGuard === false ? 'Off' : 'On', 'recall guard', p.policy?.recallGuard === false ? 'bad' : 'ok'], [S.approvals.size, 'waiting for Maya', S.approvals.size ? 'warn' : '']])}
      ${r ? `<blockquote>${esc(r.decision.rationale)}</blockquote>` : ''}
      <div class="fd-act">${go('approvals', 'Approvals')}${go('runs', 'Runs')}</div>`; },
    act: () => `<h3>${ic('credit-card', 18)}Act</h3><p>Pays with a Stripe TEST spending token capped at the approved price, or files a refund claim when a recall hits something Maya owns.</p>
      ${tiles([[money(S.spent), 'spent today', 'ok'], [S.receipts.length, 'purchases'], [S.refunds?.claims?.length ?? 0, 'refund requests']])}
      ${S.receipts.slice(-3).reverse().map((r) => `<div class="fd-row"><span>${esc(r.title)}</span><span class="badge ok">${money(r.amount)}</span></div>`).join('')}
      <div class="fd-act">${go('refunds', 'Refunds')}${go('runs', 'Audit trails')}</div>`,
    safe: () => `<h3>${ic('shield', 18)}Maya protected</h3><p>Nothing recalled gets bought, and owned items are re-checked whenever a new recall is published.</p>
      ${tiles([[$('nProtected')?.textContent ?? 0, 'items protected', 'ok'], [new Set([...S.recalls.values()].map((a) => a.recallId)).size, 'recalls caught', 'bad'], [S.runs.length, 'audited decisions']])}
      <div class="fd-act">${go('graph', 'Trust graph')}${go('activity', 'Activity')}</div>`,
  };
  function detail(f, anim = true) {
    const p = S.profile; if (!p) return;
    const box = $('fdetail'); box.dataset.f = f; box.hidden = false; $('fhint').hidden = true;
    box.classList.toggle('nolog', f === 'watch' || f === 'safe');
    if (anim) { box.classList.remove('in'); void box.offsetWidth; box.classList.add('in'); }
    $('fdBody').innerHTML = D[f](p);
  }
  $('flowmap').addEventListener('click', (e) => {
    const n = e.target.closest('.fnode'); if (!n) return;
    const f = n.dataset.f;
    document.querySelectorAll('.fnode').forEach((x) => x.classList.toggle('sel', x === n && open !== f));
    if (open === f) { open = null; $('fdetail').hidden = true; $('fhint').hidden = false; return; }
    open = f; detail(f);
  });
  $('fdetail').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) SC.setPage(b.dataset.go); });

  // ---------- header Autopilot toggle (works in the compact chat window too) ----------
  const st = $('status');
  st.addEventListener('click', () => SC.setAuto(!S.auto));
  const syncAuto = () => { st.dataset.auto = String(!!S.auto); };
  setInterval(syncAuto, 400); syncAuto();

  // ---------- chat slides in as a column (panel steps aside) ----------
  const chat = $('chat'); const studio = document.querySelector('.studio');
  new MutationObserver(() => studio.classList.toggle('chat-open', chat.classList.contains('open'))).observe(chat, { attributes: true, attributeFilter: ['class'] });
  $('chatClose').onclick = () => chat.classList.remove('open');

  // ---------- nav tooltips (labels collapse to icons on narrow screens) ----------
  document.querySelectorAll('#pages button').forEach((b) => { b.title = b.textContent.replace(/\d+$/, '').trim(); });

  // ---------- demo drawer remembers its state ----------
  const db = $('demoBox');
  try { if (localStorage.getItem('sc-demo-open') === '1') db.open = true; } catch {}
  db.addEventListener('toggle', () => { try { localStorage.setItem('sc-demo-open', db.open ? '1' : '0'); } catch {} });

  // ---------- click ripple ----------
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('button, .row, .rf-row, a.chip, .btn, summary'); if (!t || t.closest('#graph')) return;
    const r = t.getBoundingClientRect(); const d = Math.max(r.width, r.height) * 2.2;
    const sp = document.createElement('span'); sp.className = 'ripple';
    sp.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
    t.classList.add('rippling'); t.appendChild(sp); setTimeout(() => sp.remove(), 650);
  });

  let t = null;
  SC.on(() => { clearTimeout(t); t = setTimeout(metrics, 120); });
  setTimeout(metrics, 600);
})();
