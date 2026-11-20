// Trust graph: Obsidian-style live force graph of everything SafeCart knows and every source it checked.
// Built from the shared state (window.SC.S) and grown live from agent events. force-graph (MIT), vendored.
(() => {
  const { S } = window.SC;
  const el = document.getElementById('graph');
  const C = {
    user: '#262a31', wish: '#8a9fb5', owned: '#a7aeb7', recall: '#cf4a4a', buy: '#3a9a6e', inj: '#c38a2c', claim: '#5f84a8',
    srcFill: '#f7f8f9', srcRing: '#5f84a8', link: 'rgba(38,42,49,.16)', linkHi: 'rgba(38,42,49,.55)', steel: 'rgba(95,132,168,.9)',
  };
  const R = { user: 10, wish: 5.5, owned: 5.5, recall: 7, buy: 5, src: 7.5, inj: 4.5, claim: 4.8 };
  const SOURCES = {
    'src:cpsc': 'CPSC recalls (live)', 'src:table': 'Recall table', 'src:senso': 'Senso KB', 'src:sie': 'SIE guard',
    'src:stripe': 'Stripe TEST', 'src:claude': 'Claude', 'src:store': 'Demo Baby Store',
  };
  const nodes = new Map(); const links = new Map();
  let fg = null, hover = null, hiNodes = new Set(), hiLinks = new Set(), showLabels = true, flow = true, pending = null;

  function node(id, type, label, extra = {}) {
    let n = nodes.get(id);
    if (!n) { n = { id, type, label, born: performance.now(), ...extra }; nodes.set(id, n); }
    else Object.assign(n, { label, ...extra });
    return n;
  }
  function link(a, b, kind) {
    if (!nodes.has(a) || !nodes.has(b)) return;
    const id = `${a}|${b}|${kind}`;
    if (!links.has(id)) links.set(id, { id, source: a, target: b, kind, born: performance.now() });
  }
  const srcOf = (label) => /CPSC/i.test(label) ? 'src:cpsc' : /Senso/i.test(label) ? 'src:senso' : /Recall table/i.test(label) ? 'src:table' : null;

  function build() {
    const p = S.profile; if (!p) return;
    node('maya', 'user', p.name);
    for (const [id, label] of Object.entries(SOURCES)) node(id, 'src', label);
    for (const w of p.wishlist) {
      const id = `w:${w.id}`;
      node(id, 'wish', w.title, { status: w.safety?.status, price: w.price, sku: w.sku, missionId: w.id });
      link('maya', id, 'wants');
      for (const s of w.safety?.sources ?? []) { const t = srcOf(s.label); if (t) link(id, t, 'checked'); }
      if (w.safety?.recallId) { node(`r:${w.safety.recallId}`, 'recall', `CPSC recall ${w.safety.recallId}`); link(id, `r:${w.safety.recallId}`, 'recalled'); }
    }
    for (const o of p.owned) {
      const id = `o:${o.id}`;
      node(id, 'owned', o.title, { status: o.safety?.status, model: o.model, missionId: o.id });
      link('maya', id, 'owns');
      for (const s of o.safety?.sources ?? []) { const t = srcOf(s.label); if (t) link(id, t, 'checked'); }
      if (o.safety?.recallId) { node(`r:${o.safety.recallId}`, 'recall', `CPSC recall ${o.safety.recallId}`); link(id, `r:${o.safety.recallId}`, 'recalled'); }
    }
    for (const a of S.recalls.values()) {
      const rid = `r:${a.recallId}`; node(rid, 'recall', `CPSC recall ${a.recallId}`, { hazard: a.hazard, url: a.url, title: a.recallTitle, live: true, sample: false });
      link(rid, 'src:cpsc', 'published');
      const item = [...nodes.values()].find((n) => (n.type === 'owned' || n.type === 'wish') && n.label === a.itemTitle);
      if (item) link(item.id, rid, 'recalled');
    }
    for (const r of S.receipts) {
      const id = `p:${r.reference}`;
      node(id, 'buy', `${r.title}`, { amount: r.amount, ref: r.reference, auto: r.auto, safety: r.safety?.status });
      const owner = nodes.get(`w:${r.missionId}`) || nodes.get(`o:${r.missionId}`);
      if (owner) link(owner.id, id, owner.type === 'owned' ? 'replaced by' : 'bought');
      link(id, 'src:stripe', 'paid');
      for (const s of r.safety?.sources ?? []) { const t = srcOf(s.label); if (t) link(id, t, 'checked'); }
      if (S.runs.some((run) => run.action?.ref === r.reference && run.steps.some((st) => /claude/.test(st.model ?? '')))) link(id, 'src:claude', 'explained');
    }
    for (const st of S.steps) {
      if (/Blocked an instruction/.test(st.title) && st.status !== 'running') {
        const owner = nodes.get(`w:${st.missionId}`);
        const id = `x:${st.missionId ?? st.id}`;
        node(id, 'inj', 'Hidden instruction (blocked)', { detail: st.detail });
        if (owner) link(owner.id, id, 'contained'); link(id, 'src:sie', 'blocked by');
      }
    }
    // refund requests: live ones the agent filed at the store, and samples on real CPSC recalls (dashed)
    for (const c of [...(S.refunds?.claims ?? []), ...(S.refunds?.samples ?? [])]) {
      let owner = c.ownedItemId ? nodes.get(`o:${c.ownedItemId}`) : null;
      if (!owner) { owner = node(`o:s:${c.claimRef}`, 'owned', c.itemTitle, { status: 'recalled', sample: !!c.sample }); link('maya', owner.id, 'owns'); }
      if (c.recallId) {
        const rid = `r:${c.recallId}`; node(rid, 'recall', `CPSC recall ${c.recallId}`, { hazard: c.hazard, url: c.url, title: c.recallTitle, sample: !!c.sample && !nodes.get(rid)?.live });
        link(rid, 'src:cpsc', 'published'); link(owner.id, rid, 'recalled');
      }
      const id = `c:${c.claimRef}`;
      node(id, 'claim', c.sample ? `Refund · ${c.to ?? 'store'}` : `Refund ${c.claimRef}`, { status: c.status, replied: !!c.reply, sample: !!c.sample, claimRef: c.claimRef, to: c.to });
      link(owner.id, id, 'refund requested'); if (c.recallId) link(id, `r:${c.recallId}`, 'cites');
      if (!c.sample) { link(id, 'src:store', 'sent to'); if (c.letterModel && c.letterModel !== 'template') link(id, 'src:claude', 'written by'); }
    }
  }

  function data() { return { nodes: [...nodes.values()], links: [...links.values()] }; }
  function refresh() {
    clearTimeout(pending);
    pending = setTimeout(() => {
      build(); if (!fg) return;
      fg.graphData(data()); fg.d3ReheatSimulation?.();
      stats();
    }, 120);
  }
  function stats() {
    const n = nodes.size, l = links.size;
    const checks = [...links.values()].filter((x) => x.kind === 'checked').length;
    const recalls = [...nodes.values()].filter((x) => x.type === 'recall').length;
    const refunds = [...nodes.values()].filter((x) => x.type === 'claim').length;
    document.getElementById('gstats').innerHTML = `<div><b>${n}</b>nodes</div><div><b>${checks}</b>source checks</div><div><b style="color:${recalls ? C.recall : 'inherit'}">${recalls}</b>recalls</div><div><b style="color:${refunds ? C.claim : 'inherit'}">${refunds}</b>refunds</div>`;
  }

  const ease = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const nColor = (n) => n.type === 'wish' && n.status === 'recalled' ? C.recall : n.type === 'owned' && n.status === 'recalled' ? C.recall : C[n.type] ?? C.owned;
  function draw(n, ctx, scale) {
    const now = performance.now();
    const age = Math.min(1, (now - n.born) / 700); const pop = age < 1 ? ease(age) : 1;
    const r = R[n.type] * pop;
    const dim = hover && !hiNodes.has(n);
    ctx.globalAlpha = dim ? 0.16 : 1;
    // halo: recalls pulse; fresh nodes glow while popping in
    if (n.type === 'recall' || (n.status === 'recalled')) {
      const pulse = (Math.sin(now / 380) + 1) / 2;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 + pulse * 7, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(207,74,74,${0.10 + 0.12 * (1 - pulse)})`; ctx.fill();
    } else if (age < 1) {
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 10 * (1 - age), 0, 2 * Math.PI); ctx.fillStyle = `rgba(95,132,168,${0.25 * (1 - age)})`; ctx.fill();
    }
    if (n.type === 'buy') { ctx.beginPath(); ctx.arc(n.x, n.y, r + 3.5, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(58,154,110,.16)'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.5, r), 0, 2 * Math.PI);
    if (n.type === 'src') { ctx.fillStyle = C.srcFill; ctx.fill(); ctx.lineWidth = 2 / Math.max(1, scale * 0.6); ctx.strokeStyle = C.srcRing; ctx.stroke(); }
    else { ctx.fillStyle = nColor(n); ctx.fill(); }
    if (n.sample) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.2, 0, 2 * Math.PI); ctx.setLineDash([1.6, 1.6]); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(38,42,49,.45)'; ctx.stroke(); ctx.setLineDash([]); }
    if (n.type === 'claim' && n.replied) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.6, 0, 2 * Math.PI); ctx.lineWidth = 1.4; ctx.strokeStyle = n.status === 'refund_approved' ? C.buy : C.claim; ctx.stroke(); }
    if (n.type === 'user') { ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, 2 * Math.PI); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(38,42,49,.25)'; ctx.stroke(); }
    if (hover === n) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, 2 * Math.PI); ctx.lineWidth = 1.5; ctx.strokeStyle = C.user; ctx.stroke(); }
    const important = n.type === 'user' || n.type === 'src' || n.type === 'recall' || hiNodes.has(n);
    if (showLabels && (important || scale > 2.4)) {
      const fs = Math.max(10 / scale, 3.2);
      ctx.font = `${n.type === 'user' || n.type === 'recall' ? 600 : 500} ${fs}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const txt = n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label;
      ctx.fillStyle = n.type === 'recall' ? C.recall : n.type === 'src' ? '#3c5a77' : '#2b2f36';
      ctx.fillText(txt, n.x, n.y + r + 3);
    }
    ctx.globalAlpha = 1;
  }
  const lColor = (l) => {
    const hi = hiLinks.has(l);
    if (hover && !hi) return 'rgba(38,42,49,.05)';
    if (l.kind === 'recalled' || l.kind === 'published') return hi ? 'rgba(207,74,74,.8)' : 'rgba(207,74,74,.42)';
    if (l.kind === 'bought' || l.kind === 'replaced by' || l.kind === 'paid') return hi ? 'rgba(58,154,110,.85)' : 'rgba(58,154,110,.42)';
    if (l.kind === 'blocked by' || l.kind === 'contained') return 'rgba(195,138,44,.6)';
    if (l.kind === 'refund requested' || l.kind === 'sent to' || l.kind === 'cites' || l.kind === 'written by') return hi ? 'rgba(95,132,168,.9)' : 'rgba(95,132,168,.4)';
    return hi ? C.linkHi : C.link;
  };
  const flowing = (l) => flow && ['checked', 'paid', 'published', 'blocked by', 'explained', 'sent to', 'refund requested'].includes(l.kind);

  function card(n) {
    const g = document.getElementById('gcard');
    if (!n) { g.hidden = true; return; }
    const nb = [...links.values()].filter((l) => l.source.id === n.id || l.target.id === n.id)
      .map((l) => { const o = l.source.id === n.id ? l.target : l.source; return `${l.source.id === n.id ? '' : '← '}${l.kind} ${l.source.id === n.id ? '→ ' : ''}${o.label}`; });
    const kind = { user: 'Shopper', wish: 'Wishlist item', owned: 'Owned item', recall: 'CPSC recall', buy: 'Purchase', src: 'Source checked', inj: 'Blocked injection', claim: 'Refund request' }[n.type] + (n.sample ? ' · sample' : '');
    const status = n.type === 'claim' ? `<span class="badge ${n.status === 'refund_approved' ? 'ok' : n.status === 'info_requested' ? 'steel' : 'warn'}">${n.status === 'refund_approved' ? 'Refund approved' : n.status === 'info_requested' ? 'Store needs info' : 'Waiting for reply'}</span>` : n.status === 'recalled' ? '<span class="badge bad">Recalled</span>' : n.type === 'buy' ? `<span class="badge ok">Paid ${SC.money(n.amount)} · ${n.ref?.startsWith('pi_') ? 'Stripe TEST' : 'simulated'}</span>` : n.status === 'clear' ? '<span class="badge ok">Safety clear</span>' : '';
    g.innerHTML = `<div class="k">${kind}</div><h4>${SC.esc(n.label)}</h4>${status}${n.hazard ? `<p>${SC.esc(n.hazard.slice(0, 180))}…</p>` : ''}${n.detail ? `<p>${SC.esc(n.detail.slice(0, 180))}</p>` : ''}
      <p style="font:11.5px var(--mono);color:var(--muted)">${nb.slice(0, 7).map(SC.esc).join('<br>')}</p>
      ${n.sample ? '<p style="font-size:12px;color:var(--muted)">Real CPSC recall; the order, email and reply are made up for the demo.</p>' : ''}<div class="links">${n.type === 'buy' ? `<button class="btn ghost" id="gOpen">Audit trail ›</button>` : ''}${n.type === 'claim' ? `<button class="btn ghost" id="gMail">Read the emails ›</button>` : ''}${n.url ? `<a class="btn ghost" style="display:inline-flex;align-items:center" href="${SC.esc(n.url)}" target="_blank">CPSC notice ↗</a>` : ''}</div>`;
    g.hidden = false;
    const ob = document.getElementById('gOpen');
    if (ob) ob.onclick = () => { const i = S.runs.findIndex((r) => r.action?.ref === n.ref); if (i >= 0) SC.openRun(i); };
    const om = document.getElementById('gMail'); if (om) om.onclick = () => SC.openRefund?.(n.claimRef);
  }

  function collide() { // pairwise (n < ~60): keeps nodes and their labels apart
    let ns = [];
    const room = (n) => R[n.type] + (n.type === 'recall' || n.type === 'src' || n.type === 'user' ? 20 : 9);
    const f = (alpha) => {
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i], b = ns[j]; const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 0.01; const min = room(a) + room(b);
        if (d < min) { const k = ((min - d) / d) * 0.5 * Math.min(1, alpha * 4); a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
      }
    };
    f.initialize = (n) => { ns = n; };
    return f;
  }
  function gravity() { // gentle pull to the centre so unlinked sources orbit instead of drifting off-screen
    let ns = [];
    const f = (alpha) => { for (const n of ns) { const k = (n.type === 'src' ? 0.045 : 0.008) * alpha; n.vx -= n.x * k; n.vy -= n.y * k; } };
    f.initialize = (n) => { ns = n; };
    return f;
  }
  let fitted = false, fitN = 0;
  function mount() {
    if (fg || typeof ForceGraph === 'undefined') return;
    build();
    fg = ForceGraph()(el)
      .backgroundColor('rgba(0,0,0,0)')
      .graphData(data())
      .nodeId('id')
      .nodeRelSize(4)
      .nodeCanvasObject(draw)
      .nodePointerAreaPaint((n, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, R[n.type] + 4, 0, 2 * Math.PI); ctx.fill(); })
      .nodeLabel(() => '')
      .linkColor(lColor)
      .linkWidth((l) => (hiLinks.has(l) ? 2 : 1))
      .linkCurvature(0.08)
      .linkDirectionalParticles((l) => (flowing(l) ? (S.busy ? 3 : 1) : 0))
      .linkDirectionalParticleSpeed(() => (S.busy ? 0.012 : 0.0045))
      .linkDirectionalParticleWidth(2.4)
      .linkDirectionalParticleColor((l) => (l.kind === 'paid' ? 'rgba(58,154,110,.9)' : l.kind === 'published' ? 'rgba(207,74,74,.85)' : C.steel))
      .autoPauseRedraw(false)
      .d3VelocityDecay(0.28)
      .warmupTicks(50)
      .d3AlphaDecay(0.03)
      .cooldownTicks(240)
      .cooldownTime(20000)
      .onNodeHover((n) => {
        hover = n || null; hiNodes = new Set(); hiLinks = new Set();
        if (n) { hiNodes.add(n); for (const l of links.values()) if (l.source === n || l.target === n) { hiLinks.add(l); hiNodes.add(l.source); hiNodes.add(l.target); } }
        el.style.cursor = n ? 'pointer' : '';
      })
      .onNodeClick((n) => { card(n); fg.centerAt(n.x, n.y, 600); fg.zoom(Math.max(fg.zoom(), 2.2), 600); })
      .onBackgroundClick(() => card(null))
      .onNodeDragEnd((n) => { n.fx = n.x; n.fy = n.y; });
    fg.d3Force('charge').strength((n) => (n.type === 'user' ? -700 : n.type === 'src' ? -380 : n.type === 'recall' ? -300 : -230));
    fg.d3Force('collide', collide());
    fg.d3Force('gravity', gravity());
    fg.onEngineStop(() => { if (!fitted || nodes.size !== fitN) { fitted = true; fitN = nodes.size; fit(); } }); // re-frame when the graph grew
    const LD = { wants: [95, 0.6], owns: [95, 0.6], checked: [125, 0.1], published: [95, 0.25], recalled: [52, 0.7], cites: [48, 0.5], 'refund requested': [46, 0.7],
      'sent to': [120, 0.12], 'written by': [125, 0.08], bought: [50, 0.7], 'replaced by': [50, 0.7], paid: [115, 0.12], explained: [125, 0.08], contained: [40, 0.7], 'blocked by': [115, 0.12] };
    fg.d3Force('link').distance((l) => (LD[l.kind] ?? [60, 0.4])[0]).strength((l) => (LD[l.kind] ?? [60, 0.4])[1]);
    size(); stats();
  }
  function fit() { // frame everything, cap the zoom, and nudge right so the legend card never covers nodes
    if (!fg) return; fg.zoomToFit(700, 80);
    setTimeout(() => { if (fg.zoom() > 1.45) fg.zoom(1.45, 300); setTimeout(() => { const c = fg.centerAt(); fg.centerAt(c.x - 120 / fg.zoom(), c.y, 400); }, 320); }, 760);
  }
  function size() { if (fg && el.clientWidth) fg.width(el.clientWidth).height(el.clientHeight); }

  document.getElementById('gFit').onclick = fit;
  SC.graph = () => fg;
  document.getElementById('gFlow').onclick = (e) => { flow = !flow; e.currentTarget.classList.toggle('on', flow); fg?.linkDirectionalParticles(fg.linkDirectionalParticles()); };
  document.getElementById('gLabels').onclick = (e) => { showLabels = !showLabels; e.currentTarget.classList.toggle('on', showLabels); };
  window.addEventListener('resize', size);

  SC.on((type) => {
    if (type === 'page') { if (S.page === 'graph') { fitted = false; mount(); requestAnimationFrame(() => { size(); refresh(); }); setTimeout(() => { if (!fitted && S.page === 'graph') fit(); }, 4500); } }
    else if (type === 'reset') { nodes.clear(); links.clear(); card(null); if (fg) fg.graphData(data()); }
    else refresh();
  });
})();
