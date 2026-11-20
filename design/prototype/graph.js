// Trust web: a live 3D force graph of everything SafeCart knows and every source it checked.
// Built from the shared state (window.SC.S), grown live from agent events. 3d-force-graph (MIT), vendored.
// Interact: orbit / zoom / drag-to-pin / click-to-fly; Sphere or Web layout; Spread slider; Burst; layer toggles.
(() => {
  const { S } = window.SC;
  const el = document.getElementById('graph');
  const lab = document.getElementById('glabels');
  const C = { user: '#ffffff', wish: '#9fb9da', owned: '#c8ced6', recall: '#ff6262', buy: '#4fd39c', claim: '#8db4e2', src: '#f2b552', inj: '#ff9f43' };
  const VAL = { user: 10, wish: 2.4, owned: 2.4, recall: 4.6, buy: 2.8, claim: 2.1, src: 3.6, inj: 2.2 };
  const SHELL = { user: 0, wish: 62, owned: 62, inj: 104, buy: 112, claim: 118, recall: 124, src: 190 };
  const SOURCES = {
    'src:cpsc': 'CPSC recalls (live)', 'src:table': 'Recall table', 'src:senso': 'Senso KB', 'src:sie': 'SIE guard',
    'src:stripe': 'Stripe TEST', 'src:claude': 'Claude', 'src:store': 'Demo Baby Store',
  };
  const KIND = { user: 'Shopper', wish: 'Wishlist item', owned: 'Owned item', recall: 'CPSC recall', buy: 'Purchase', src: 'Source checked', inj: 'Blocked injection', claim: 'Refund request' };
  const nodes = new Map(); const links = new Map(); const hidden = new Set();
  let fg = null, hover = null, sel = null, query = '', lit = false, hiNodes = new Set(), hiLinks = new Set();
  let mode = 'sphere', spread = 1, spin = true, flow = true, showLabels = true, fitted = false, fitN = 0, pending = null, holdSpinUntil = 0, focusNode = null;
  const idOf = (x) => (typeof x === 'object' ? x.id : x);

  // ---------- model ----------
  function node(id, type, label, extra = {}) {
    let n = nodes.get(id);
    if (!n) { n = { id, type, label, born: performance.now(), ...extra }; nodes.set(id, n); }
    else Object.assign(n, { label, ...extra });
    return n;
  }
  function link(a, b, kind) {
    if (!nodes.has(a) || !nodes.has(b)) return;
    const id = `${a}|${b}|${kind}`;
    if (!links.has(id)) links.set(id, { id, source: a, target: b, kind });
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
      if (w.safety?.recallId) { node(`r:${w.safety.recallId}`, 'recall', `CPSC ${w.safety.recallId}`); link(id, `r:${w.safety.recallId}`, 'recalled'); }
    }
    for (const o of p.owned) {
      const id = `o:${o.id}`;
      node(id, 'owned', o.title, { status: o.safety?.status, model: o.model, missionId: o.id });
      link('maya', id, 'owns');
      for (const s of o.safety?.sources ?? []) { const t = srcOf(s.label); if (t) link(id, t, 'checked'); }
      if (o.safety?.recallId) { node(`r:${o.safety.recallId}`, 'recall', `CPSC ${o.safety.recallId}`); link(id, `r:${o.safety.recallId}`, 'recalled'); }
    }
    for (const a of S.recalls.values()) {
      const rid = `r:${a.recallId}`; node(rid, 'recall', `CPSC ${a.recallId}`, { hazard: a.hazard, url: a.url, title: a.recallTitle, live: true, sample: false });
      link(rid, 'src:cpsc', 'published');
      const item = [...nodes.values()].find((n) => (n.type === 'owned' || n.type === 'wish') && n.label === a.itemTitle);
      if (item) link(item.id, rid, 'recalled');
    }
    for (const r of S.receipts) {
      const id = `p:${r.reference}`;
      node(id, 'buy', r.title, { amount: r.amount, ref: r.reference, auto: r.auto, safety: r.safety?.status });
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
    for (const c of [...(S.refunds?.claims ?? []), ...(S.refunds?.samples ?? [])]) {
      let owner = c.ownedItemId ? nodes.get(`o:${c.ownedItemId}`) : null;
      if (!owner) { owner = node(`o:s:${c.claimRef}`, 'owned', c.itemTitle, { status: 'recalled', sample: !!c.sample }); link('maya', owner.id, 'owns'); }
      if (c.recallId) {
        const rid = `r:${c.recallId}`; node(rid, 'recall', `CPSC ${c.recallId}`, { hazard: c.hazard, url: c.url, title: c.recallTitle, sample: !!c.sample && !nodes.get(rid)?.live });
        link(rid, 'src:cpsc', 'published'); link(owner.id, rid, 'recalled');
      }
      const id = `c:${c.claimRef}`;
      node(id, 'claim', c.sample ? `Refund · ${c.to ?? 'store'}` : `Refund ${c.claimRef}`, { status: c.status, replied: !!c.reply, sample: !!c.sample, claimRef: c.claimRef, to: c.to });
      link(owner.id, id, 'refund requested'); if (c.recallId) link(id, `r:${c.recallId}`, 'cites');
      if (!c.sample) { link(id, 'src:store', 'sent to'); if (c.letterModel && c.letterModel !== 'template') link(id, 'src:claude', 'written by'); }
    }
  }
  function data() {
    const ns = [...nodes.values()].filter((n) => !hidden.has(n.type));
    const vis = new Set(ns.map((n) => n.id));
    return { nodes: ns, links: [...links.values()].filter((l) => vis.has(idOf(l.source)) && vis.has(idOf(l.target))) };
  }

  // ---------- look ----------
  const LINK = {
    recalled: ['255,98,98', .55], published: ['255,98,98', .38], cites: ['255,98,98', .3],
    bought: ['79,211,156', .55], 'replaced by': ['79,211,156', .55], paid: ['79,211,156', .4],
    'refund requested': ['141,180,226', .5], 'sent to': ['141,180,226', .35], 'written by': ['141,180,226', .3],
    contained: ['255,159,67', .6], 'blocked by': ['255,159,67', .5], explained: ['200,210,225', .25],
    checked: ['242,181,82', .22], wants: ['200,210,225', .32], owns: ['200,210,225', .32],
  };
  const FLOWING = new Set(['checked', 'paid', 'published', 'blocked by', 'explained', 'sent to', 'refund requested']);
  const nColor = (n) => (lit && !hiNodes.has(n) ? '#2a2f37' : (n.type === 'wish' || n.type === 'owned') && n.status === 'recalled' ? C.recall : C[n.type]);
  const lColor = (l) => {
    const [rgb, a] = LINK[l.kind] ?? ['200,210,225', .3];
    if (lit) return hiLinks.has(l) ? `rgba(${rgb},${Math.min(1, a + .45)})` : 'rgba(255,255,255,.03)';
    return `rgba(${rgb},${a})`;
  };

  // ---------- forces ----------
  function shells() { // "Sphere": Maya at the core, items on the inner shell, recalls/refunds/purchases mid, sources outside
    let ns = [];
    const f = (alpha) => {
      if (mode !== 'sphere') return;
      for (const n of ns) {
        if (n.fx != null) continue;
        if (n.type === 'user') { n.vx -= n.x * 0.3 * alpha; n.vy -= n.y * 0.3 * alpha; n.vz -= n.z * 0.3 * alpha; continue; }
        const R = SHELL[n.type] * spread; const r = Math.hypot(n.x, n.y, n.z) || 1e-3; const k = ((R - r) / r) * 0.22 * alpha;
        n.vx += n.x * k; n.vy += n.y * k; n.vz += n.z * k;
      }
    };
    f.initialize = (n) => { ns = n; };
    return f;
  }
  function gravity() { // keeps unlinked sources from drifting away in Web mode
    let ns = [];
    const f = (alpha) => { if (mode !== 'web') return; for (const n of ns) { const k = (n.type === 'src' ? 0.03 : 0.01) * alpha; n.vx -= n.x * k; n.vy -= n.y * k; n.vz -= n.z * k; } };
    f.initialize = (n) => { ns = n; };
    return f;
  }
  const LD = { wants: 46, owns: 46, checked: 110, published: 70, recalled: 36, cites: 34, 'refund requested': 32, 'sent to': 90, 'written by': 100, bought: 34, 'replaced by': 34, paid: 90, explained: 100, contained: 26, 'blocked by': 90 };
  const LS = { checked: 0.06, 'sent to': 0.1, 'written by': 0.06, paid: 0.1, explained: 0.06, 'blocked by': 0.1, published: 0.2 };
  function applyForces() {
    if (!fg) return;
    const web = mode === 'web' ? 1.35 : 1;
    fg.d3Force('charge').strength((n) => (n.type === 'user' ? -260 : n.type === 'src' ? -140 : n.type === 'recall' ? -110 : -70) * spread * web);
    fg.d3Force('link').distance((l) => (LD[l.kind] ?? 50) * spread * web).strength((l) => (mode === 'sphere' ? (LS[l.kind] ?? 0.5) * 0.6 : LS[l.kind] ?? 0.5));
    fg.d3ReheatSimulation();
  }

  // ---------- labels (crisp HTML over the canvas, fading with depth) ----------
  const spans = new Map();
  function drawLabels() {
    if (!fg) return;
    const cam = fg.camera(); const tgt = fg.controls().target; const W = el.clientWidth, H = el.clientHeight;
    const fx = tgt.x - cam.position.x, fy = tgt.y - cam.position.y, fz = tgt.z - cam.position.z; const fl = Math.hypot(fx, fy, fz) || 1;
    const seen = new Set();
    for (const n of nodes.values()) {
      if (hidden.has(n.type) || n.x == null) continue;
      const near = Math.hypot(n.x - cam.position.x, n.y - cam.position.y, n.z - cam.position.z);
      const front = ((n.x - cam.position.x) * fx + (n.y - cam.position.y) * fy + (n.z - cam.position.z) * fz) / fl;
      const always = n.type === 'user' || n.type === 'src' || n.type === 'recall' || n.type === 'buy';
      const show = showLabels && front > 0 && (always || hiNodes.has(n) || near < fl * 0.6) && (!lit || hiNodes.has(n));
      if (!show) continue;
      const p = fg.graph2ScreenCoords(n.x, n.y, n.z);
      if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) continue;
      let s = spans.get(n.id);
      if (!s) { s = document.createElement('span'); spans.set(n.id, s); lab.appendChild(s); }
      s.className = `k-${n.type}${n === sel || n === hover ? ' sel' : ''}`;
      const txt = n.label.length > 30 ? n.label.slice(0, 28) + '…' : n.label;
      if (s.textContent !== txt) s.textContent = txt;
      const depth = Math.max(0.28, Math.min(1, 1.55 - near / (fl * 1.25)));
      s.style.opacity = lit ? 1 : depth.toFixed(2);
      const r = Math.cbrt(VAL[n.type]) * 4 * (fl / Math.max(near, 1)) * 1.1;
      s.style.left = `${p.x}px`; s.style.top = `${p.y + Math.min(26, 8 + r)}px`;
      seen.add(n.id);
    }
    for (const [id, s] of spans) if (!seen.has(id)) { s.remove(); spans.delete(id); }
  }

  // ---------- animation loop: pop-in, recall pulse, glow, orbit, labels ----------
  const ease = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  function loop() {
    requestAnimationFrame(loop);
    if (!fg || S.page !== 'graph') return;
    const now = performance.now();
    for (const n of nodes.values()) {
      const o = n.__threeObj; if (!o) continue;
      const m = o.material;
      if (m && m.emissive && m.__glow !== nColor(n)) { m.emissive.set(nColor(n)); m.emissiveIntensity = lit && !hiNodes.has(n) ? 0.05 : 0.42; m.__glow = nColor(n); }
      const age = Math.min(1, (now - n.born) / 800); let sc = age < 1 ? Math.max(0.01, ease(age)) : 1;
      if (n.type === 'recall' || n.status === 'recalled') sc *= 1 + 0.16 * Math.sin(now / 330);
      if (n.type === 'claim' && n.replied) sc *= 1 + 0.06 * Math.sin(now / 520);
      if (hover === n || sel === n) sc *= 1.3;
      o.scale.set(sc, sc, sc);
    }
    if (spin && !hover && !lit && now > holdSpinUntil && !focusNode) {
      const cam = fg.camera(); const tgt = fg.controls().target;
      const dx = cam.position.x - tgt.x, dz = cam.position.z - tgt.z; const r = Math.hypot(dx, dz); const a = Math.atan2(dx, dz) + 0.0018;
      cam.position.x = tgt.x + r * Math.sin(a); cam.position.z = tgt.z + r * Math.cos(a); cam.lookAt(tgt);
    }
    drawLabels();
  }

  // ---------- detail card ----------
  function card(n) {
    const g = document.getElementById('gcard');
    if (!n) { g.hidden = true; return; }
    const nb = [...links.values()].filter((l) => idOf(l.source) === n.id || idOf(l.target) === n.id)
      .map((l) => { const out = idOf(l.source) === n.id; const o = nodes.get(out ? idOf(l.target) : idOf(l.source)); return `${out ? '' : '← '}${l.kind}${out ? ' →' : ''} ${o?.label ?? ''}`; });
    const status = n.type === 'claim' ? `<span class="badge ${n.status === 'refund_approved' ? 'ok' : n.status === 'info_requested' ? 'steel' : 'warn'}">${n.status === 'refund_approved' ? 'Refund approved' : n.status === 'info_requested' ? 'Store needs info' : 'Waiting for reply'}</span>`
      : n.status === 'recalled' || n.type === 'recall' ? '<span class="badge bad">Recalled</span>'
      : n.type === 'buy' ? `<span class="badge ok">Paid ${SC.money(n.amount)} · ${n.ref?.startsWith('pi_') ? 'Stripe TEST' : 'simulated'}</span>`
      : n.status === 'clear' ? '<span class="badge ok">Safety clear</span>' : '';
    g.innerHTML = `<div class="k">${KIND[n.type]}${n.sample ? ' · sample' : ''}</div><h4>${SC.esc(n.title ?? n.label)}</h4>${status}
      ${n.hazard ? `<p>${SC.esc(n.hazard.slice(0, 200))}${n.hazard.length > 200 ? '…' : ''}</p>` : ''}${n.detail ? `<p>${SC.esc(n.detail.slice(0, 200))}</p>` : ''}
      ${n.sample ? '<p style="font-size:12px;color:var(--muted)">Real CPSC recall; the order, email and reply are made up for the demo.</p>' : ''}
      <p style="font:12px/1.6 var(--mono);color:var(--muted)">${nb.slice(0, 7).map(SC.esc).join('<br>')}</p>
      <div class="links">${n.type === 'buy' ? '<button class="btn ghost" id="gOpen">Audit trail ›</button>' : ''}${n.type === 'claim' ? '<button class="btn ghost" id="gMail">Read the emails ›</button>' : ''}${n.url ? `<a class="btn ghost" href="${SC.esc(n.url)}" target="_blank" rel="noreferrer">CPSC notice ↗</a>` : ''}<button class="btn ghost" id="gBack">Back out</button></div>`;
    g.hidden = false;
    const ob = document.getElementById('gOpen'); if (ob) ob.onclick = () => { const i = S.runs.findIndex((r) => r.action?.ref === n.ref); if (i >= 0) SC.openRun(i); };
    const om = document.getElementById('gMail'); if (om) om.onclick = () => SC.openRefund?.(n.claimRef);
    document.getElementById('gBack').onclick = () => { card(null); focusNode = null; sel = null; setHi(); fit(); };
  }

  function stats() {
    const ns = [...nodes.values()];
    const checks = [...links.values()].filter((x) => x.kind === 'checked').length;
    const rc = ns.filter((x) => x.type === 'recall').length, rf = ns.filter((x) => x.type === 'claim').length, buys = ns.filter((x) => x.type === 'buy').length;
    document.getElementById('gstats').innerHTML = `<div><b>${ns.length}</b>nodes</div><div><b>${checks}</b>source checks</div><div><b style="color:${rc ? 'var(--bad)' : 'inherit'}">${rc}</b>recalls</div><div><b style="color:${rf ? 'var(--steel)' : 'inherit'}">${rf}</b>refunds</div><div><b style="color:${buys ? 'var(--ok)' : 'inherit'}">${buys}</b>purchases</div>`;
  }
  function refresh() {
    clearTimeout(pending);
    pending = setTimeout(() => { build(); stats(); if (fg) fg.graphData(data()); }, 120);
  }
  function fit(tries = 0) { // wait until the layout has real size, else the camera dives into the cluster
    if (!fg) return; const b = fg.getGraphBbox();
    if ((!b || b.x[1] - b.x[0] < 140) && tries < 12) { setTimeout(() => fit(tries + 1), 500); return; }
    const size = Math.max(b.x[1] - b.x[0], b.y[1] - b.y[0], b.z[1] - b.z[0]); const c = fg.camera().position; const d = Math.hypot(c.x, c.y, c.z) || 1; const want = size * 1.28;
    fg.cameraPosition({ x: (c.x / d) * want, y: (c.y / d) * want, z: (c.z / d) * want }, { x: 0, y: 0, z: 0 }, 900); // frame the core, let outer sources graze the edge
  }
  function size() { if (fg && el.clientWidth) fg.width(el.clientWidth).height(el.clientHeight); }
  const matches = (n) => !!query && `${n.label} ${n.title ?? ''} ${n.id} ${KIND[n.type]}`.toLowerCase().includes(query);
  function setHi() { // one highlight path for hover, click selection and search
    hiNodes = new Set(); hiLinks = new Set();
    const seeds = hover ? [hover] : sel ? [sel] : query ? [...nodes.values()].filter((n) => !hidden.has(n.type) && matches(n)) : [];
    for (const n of seeds) { hiNodes.add(n); for (const l of links.values()) if (l.source === n || l.target === n) { hiLinks.add(l); hiNodes.add(l.source); hiNodes.add(l.target); } }
    lit = seeds.length > 0 || !!query; restyle();
  }
  function flyTo(n) {
    focusNode = n; sel = n; setHi(); card(n);
    const d = Math.hypot(n.x, n.y, n.z);
    fg?.cameraPosition(d < 1 ? { x: 0, y: 0, z: 150 } : { x: n.x * (1 + 90 / d), y: n.y * (1 + 90 / d), z: n.z * (1 + 90 / d) }, n, 1100);
  }
  function restyle() { if (!fg) return; fg.nodeColor(fg.nodeColor()).linkColor(fg.linkColor()).linkWidth(fg.linkWidth()).linkDirectionalParticles(fg.linkDirectionalParticles()); }

  // ---------- mount ----------
  function mount() {
    if (fg || typeof ForceGraph3D === 'undefined') return;
    build();
    fg = ForceGraph3D({ controlType: 'trackball', rendererConfig: { antialias: true, alpha: true } })(el)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .width(el.clientWidth).height(el.clientHeight)
      .graphData(data())
      .nodeId('id')
      .nodeRelSize(5.2)
      .nodeVal((n) => VAL[n.type])
      .nodeResolution(28)
      .nodeOpacity(0.96)
      .nodeColor(nColor)
      .nodeLabel(() => '')
      .linkColor(lColor)
      .linkOpacity(1)
      .linkWidth((l) => (hiLinks.has(l) ? 1.6 : 0.55))
      .linkCurvature(0.12)
      .linkDirectionalParticles((l) => (flow && FLOWING.has(l.kind) && !hidden.has('src') ? (S.busy ? 4 : 2) : 0))
      .linkDirectionalParticleSpeed(() => (S.busy ? 0.014 : 0.006))
      .linkDirectionalParticleWidth(2.2)
      .linkDirectionalParticleColor((l) => `rgb(${(LINK[l.kind] ?? ['200,210,225'])[0]})`)
      .d3VelocityDecay(0.3)
      .warmupTicks(40)
      .cooldownTicks(260)
      .onNodeHover((n) => { hover = n || null; setHi(); el.style.cursor = n ? 'pointer' : 'grab'; })
      .onNodeClick((n) => {
        focusNode = n; sel = n; setHi(); card(n);
        const d = Math.hypot(n.x, n.y, n.z);
        const pos = d < 1 ? { x: 0, y: 0, z: 150 } : { x: n.x * (1 + 90 / d), y: n.y * (1 + 90 / d), z: n.z * (1 + 90 / d) };
        fg.cameraPosition(pos, n, 1100);
      })
      .onBackgroundClick(() => { card(null); focusNode = null; sel = null; setHi(); })
      .onNodeDragEnd((n) => { n.fx = n.x; n.fy = n.y; n.fz = n.z; holdSpinUntil = performance.now() + 2500; })
      .onEngineStop(() => { if (!fitted || nodes.size !== fitN) { fitted = true; fitN = nodes.size; if (!focusNode) fit(); } });
    fg.d3Force('shells', shells());
    fg.d3Force('gravity', gravity());
    fg.d3Force('center', null);
    applyForces();
    fg.cameraPosition({ x: 0, y: 70, z: 430 });
    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', () => { holdSpinUntil = performance.now() + 60000; });
    window.addEventListener('pointerup', () => { if (holdSpinUntil > performance.now() + 5000) holdSpinUntil = performance.now() + 2500; });
    el.addEventListener('wheel', () => { holdSpinUntil = performance.now() + 2500; }, { passive: true });
    stats(); requestAnimationFrame(loop);
    SC.graph = () => fg;
  }

  // ---------- controls ----------
  const $ = (id) => document.getElementById(id);
  const setMode = (m) => { mode = m; $('gSphere').classList.toggle('on', m === 'sphere'); $('gWeb').classList.toggle('on', m === 'web'); applyForces(); };
  $('gSphere').onclick = () => setMode('sphere');
  $('gWeb').onclick = () => setMode('web');
  $('gSpread').oninput = (e) => { spread = e.target.value / 100; applyForces(); };
  $('gSpin').onclick = (e) => { spin = !spin; focusNode = null; e.currentTarget.classList.toggle('on', spin); };
  $('gFlow').onclick = (e) => { flow = !flow; e.currentTarget.classList.toggle('on', flow); restyle(); };
  $('gLabels').onclick = (e) => { showLabels = !showLabels; e.currentTarget.classList.toggle('on', showLabels); };
  $('gBurst').onclick = () => {
    if (!fg) return;
    for (const n of nodes.values()) { if (n.x == null) continue; n.fx = n.fy = n.fz = undefined; const k = 26 + 40 * Math.random(); const t = Math.random() * 2 * Math.PI, p = Math.acos(2 * Math.random() - 1); n.vx = k * Math.sin(p) * Math.cos(t); n.vy = k * Math.sin(p) * Math.sin(t); n.vz = k * Math.cos(p); }
    fg.d3ReheatSimulation(); fitted = false;
  };
  $('gRelease').onclick = () => { for (const n of nodes.values()) { n.fx = n.fy = n.fz = undefined; } fg?.d3ReheatSimulation(); };
  $('gFit').onclick = () => { focusNode = null; sel = null; setHi(); card(null); fit(); };
  $('gSearch').oninput = (e) => { query = e.target.value.trim().toLowerCase(); sel = null; focusNode = null; card(null); setHi(); };
  $('gSearch').onkeydown = (e) => {
    if (e.key === 'Escape') { e.target.value = ''; query = ''; setHi(); e.target.blur(); }
    if (e.key === 'Enter') { const hit = [...nodes.values()].find((n) => !hidden.has(n.type) && matches(n)); if (hit) flyTo(hit); }
    e.stopPropagation(); // typing here must not fire the demo hotkeys
  };
  $('gkeys').onclick = (e) => {
    const b = e.target.closest('button[data-type]'); if (!b) return;
    const t = b.dataset.type; if (hidden.has(t)) hidden.delete(t); else hidden.add(t);
    b.classList.toggle('off', hidden.has(t)); if (fg) fg.graphData(data());
  };
  window.addEventListener('resize', size);

  SC.on((type) => {
    if (type === 'page') {
      if (S.page === 'graph') { mount(); fg?.resumeAnimation(); requestAnimationFrame(() => { size(); refresh(); }); setTimeout(() => { if (!focusNode) fit(); }, 1600); }
      else fg?.pauseAnimation();
    } else if (type === 'reset') { nodes.clear(); links.clear(); card(null); for (const s of spans.values()) s.remove(); spans.clear(); if (fg) fg.graphData(data()); }
    else refresh();
  });
})();
