// Trust web: a live force graph of everything SafeCart knows and every source it checked.
// Built from the shared state (window.SC.S), grown live from agent events. 3d-force-graph (MIT), vendored.
// 2D (default): every category has its own labelled zone and every node a slot in it, so you can see what is where.
// 3D: orbit / zoom / drag-to-pin / click-to-fly; Sphere or Web layout; Spread slider; Burst. Both: search, layer toggles.
(() => {
  const { S } = window.SC;
  const el = document.getElementById('graph');
  const lab = document.getElementById('glabels');
  const view = el.closest('.view');
  const C = { user: '#ffffff', wish: '#60a5fa', owned: '#c4b5fd', recall: '#f87171', buy: '#4ade80', claim: '#22d3ee', src: '#fbbf24', inj: '#fb923c' };
  const VAL = { user: 10, wish: 2.4, owned: 2.4, recall: 4.6, buy: 2.8, claim: 2.1, src: 3.6, inj: 2.2 };
  const REL = 5.2; // node radius = cbrt(val) * REL
  const SHELL = { user: 0, wish: 62, owned: 62, inj: 104, buy: 112, claim: 118, recall: 124, src: 190 };
  const SOURCES = {
    'src:cpsc': 'CPSC recalls (live)', 'src:table': 'Recall table', 'src:senso': 'Senso KB', 'src:sie': 'SIE guard',
    'src:stripe': 'Stripe TEST', 'src:claude': 'Claude', 'src:store': 'Demo Baby Store',
  };
  const KIND = { user: 'Shopper', wish: 'Wishlist item', owned: 'Owned item', recall: 'CPSC recall', buy: 'Purchase', src: 'Source checked', inj: 'Blocked injection', claim: 'Refund request' };
  // 2D zones in graph units (x,y = bottom-left corner; three.js y is up). Grid: sources on top, items + Maya in the middle, outcomes below.
  const ZONES = {
    src: { name: 'Sources checked', icon: 'shield-check', x: -500, y: 272, w: 1000, h: 64, c: C.src },
    wish: { name: 'Wishlist', icon: 'heart', x: -500, y: -60, w: 290, h: 300, c: C.wish },
    user: { name: 'Maya', icon: 'crosshair', x: -180, y: -60, w: 170, h: 300, c: '#6ea8ff' },
    owned: { name: 'Owned', icon: 'package', x: 20, y: -60, w: 480, h: 300, c: C.owned },
    buy: { name: 'Purchases', icon: 'credit-card', x: -500, y: -320, w: 235, h: 230, c: C.buy },
    inj: { name: 'Blocked injections', icon: 'bug', x: -245, y: -320, w: 235, h: 230, c: C.inj },
    recall: { name: 'Recalls', icon: 'triangle-alert', x: 10, y: -320, w: 235, h: 230, c: C.recall },
    claim: { name: 'Refunds', icon: 'receipt-text', x: 265, y: -320, w: 235, h: 230, c: C.claim },
  };
  const GRID = { x0: -500, x1: 500, y0: -320, y1: 336 };
  const SHORT = { 'src:cpsc': 'CPSC live', 'src:table': 'Recall table', 'src:senso': 'Senso KB', 'src:sie': 'SIE guard', 'src:stripe': 'Stripe TEST', 'src:claude': 'Claude', 'src:store': 'Store' };
  const BOTTOM = ['buy', 'inj', 'recall', 'claim'];
  const HEAD = 42; // units reserved for a zone header
  const REL2 = 6.2; // bigger nodes in 2D, where the camera sits further back
  const nodes = new Map(); const links = new Map(); const hidden = new Set();
  let fg = null, hover = null, sel = null, query = '', lit = false, hiNodes = new Set(), hiLinks = new Set();
  let dim = 2, mode = 'sphere', spread = 1, spin = true, flow = true, showLabels = true, fitted = false, fitN = 0, pending = null, holdSpinUntil = 0, focusNode = null;
  const idOf = (x) => (typeof x === 'object' ? x.id : x);
  const zOf = (n) => n.z || 0;

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

  // 2D: give every visible node a slot in its zone (stable insertion order, so nodes don't jump around)
  function layoutSlots(ns) {
    const groups = {};
    for (const n of ns) (groups[n.type] ||= []).push(n);
    for (const [type, list] of Object.entries(groups)) {
      const z = ZONES[type]; if (!z) continue;
      const x0 = z.x + 16, x1 = z.x + z.w - 16, top = z.y + z.h - HEAD, bot = z.y + 14;
      const n = list.length;
      if (type === 'user') { list.forEach((m) => { m.tx = z.x + z.w / 2; m.ty = (top + bot) / 2 + 8; m.slotW = z.w - 32; m.lab = 'b'; }); continue; }
      if (type === 'src') { // one compact row; the zone header sits inline on the left
        const sx0 = z.x + 185, avail = z.x + z.w - 12 - sx0; // slot widths follow label length so short names never truncate
        const want = list.map((m) => (SHORT[m.id] ?? m.label).length * 7.6 + 50); const k = avail / want.reduce((a, b) => a + b, 0);
        let x = sx0; list.forEach((m, i) => { const w = want[i] * k; m.tx = x + 12; m.ty = z.y + z.h / 2; m.slotW = w; m.lab = 'r'; x += w; });
        continue;
      }
      const cols = (z.w >= 400 && n > 5) || n > 6 ? 2 : 1; const rows = Math.ceil(n / cols);
      const colW = (x1 - x0) / cols; const rowH = Math.min((top - bot) / Math.max(1, rows), 56);
      const startY = (top + bot) / 2 + (rows * rowH) / 2;
      list.forEach((m, i) => { const c = i % cols, r = Math.floor(i / cols); m.tx = x0 + colW * c + 14; m.ty = startY - rowH * (r + 0.5); m.slotW = colW; m.lab = 'r'; });
    }
  }
  function layoutZones() {
    const cnt = {}; for (const n of nodes.values()) cnt[n.type] = (cnt[n.type] || 0) + 1;
    const full = BOTTOM.filter((t) => cnt[t] && !hidden.has(t)), slim = BOTTOM.filter((t) => !full.includes(t));
    const y = -320, h = 230, x0 = -500, x1 = 500, gap = 20, sw = 230, sh = 46;
    let right = x1;
    if (slim.length && full.length) { slim.forEach((t, i) => Object.assign(ZONES[t], { x: x1 - sw, y: y + h - (i + 1) * sh - i * 10, w: sw, h: sh, slim: true })); right = x1 - sw - gap; }
    else if (slim.length) { const w = (x1 - x0 - gap * (slim.length - 1)) / slim.length; slim.forEach((t, i) => Object.assign(ZONES[t], { x: x0 + i * (w + gap), y: y + h - sh, w, h: sh, slim: true })); }
    const w = full.length ? (right - x0 - gap * (full.length - 1)) / full.length : 0;
    full.forEach((t, i) => Object.assign(ZONES[t], { x: x0 + i * (w + gap), y, w, h, slim: false }));
  }
  function data() {
    const ns = [...nodes.values()].filter((n) => !hidden.has(n.type));
    layoutZones(); layoutSlots(ns);
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
    return `rgba(${rgb},${dim === 2 ? Math.min(1, a * 0.8) : a})`;
  };

  // ---------- forces ----------
  function slots() { // 2D: glide every node into its zone slot
    let ns = [];
    const f = () => {
      if (dim !== 2) return;
      for (const n of ns) { if (n.fx != null || n.tx == null) continue; n.vx += (n.tx - n.x) * 0.28; n.vy += (n.ty - n.y) * 0.28; }
    };
    f.initialize = (n) => { ns = n; };
    return f;
  }
  function shells() { // 3D "Sphere": Maya at the core, items on the inner shell, recalls/refunds/purchases mid, sources outside
    let ns = [];
    const f = (alpha) => {
      if (dim !== 3 || mode !== 'sphere') return;
      for (const n of ns) {
        if (n.fx != null) continue;
        if (n.type === 'user') { n.vx -= n.x * 0.3 * alpha; n.vy -= n.y * 0.3 * alpha; n.vz -= zOf(n) * 0.3 * alpha; continue; }
        const R = SHELL[n.type] * spread; const r = Math.hypot(n.x, n.y, zOf(n)) || 1e-3; const k = ((R - r) / r) * 0.22 * alpha;
        n.vx += n.x * k; n.vy += n.y * k; n.vz = (n.vz || 0) + zOf(n) * k;
      }
    };
    f.initialize = (n) => { ns = n; };
    return f;
  }
  function gravity() { // 3D Web: keeps unlinked sources from drifting away
    let ns = [];
    const f = (alpha) => { if (dim !== 3 || mode !== 'web') return; for (const n of ns) { const k = (n.type === 'src' ? 0.03 : 0.01) * alpha; n.vx -= n.x * k; n.vy -= n.y * k; n.vz = (n.vz || 0) - zOf(n) * k; } };
    f.initialize = (n) => { ns = n; };
    return f;
  }
  const LD = { wants: 46, owns: 46, checked: 110, published: 70, recalled: 36, cites: 34, 'refund requested': 32, 'sent to': 90, 'written by': 100, bought: 34, 'replaced by': 34, paid: 90, explained: 100, contained: 26, 'blocked by': 90 };
  const LS = { checked: 0.06, 'sent to': 0.1, 'written by': 0.06, paid: 0.1, explained: 0.06, 'blocked by': 0.1, published: 0.2 };
  function applyForces() {
    if (!fg) return;
    if (dim === 2) { // slots do the layout; links only draw
      fg.d3Force('charge').strength(0);
      fg.d3Force('link').distance(60).strength(0);
    } else {
      const web = mode === 'web' ? 1.35 : 1;
      fg.d3Force('charge').strength((n) => (n.type === 'user' ? -260 : n.type === 'src' ? -140 : n.type === 'recall' ? -110 : -70) * spread * web);
      fg.d3Force('link').distance((l) => (LD[l.kind] ?? 50) * spread * web).strength((l) => (mode === 'sphere' ? (LS[l.kind] ?? 0.5) * 0.6 : LS[l.kind] ?? 0.5));
    }
    fg.d3ReheatSimulation();
  }

  // ---------- zones (2D): bodies behind the canvas, clickable headers above it ----------
  const zBodies = document.createElement('div'); zBodies.className = 'gzones';
  const zHeads = document.createElement('div'); zHeads.className = 'gzheads';
  view.insertBefore(zBodies, view.firstChild);
  el.after(zHeads);
  const zEls = {};
  for (const [type, z] of Object.entries(ZONES)) {
    const b = document.createElement('div'); b.className = `gz gz-${type}`; b.style.setProperty('--c', z.c);
    b.innerHTML = '<span class="gz-empty"></span>';
    const h = document.createElement('button'); h.className = `gzh gzh-${type}`; h.style.setProperty('--c', z.c); h.dataset.type = type;
    h.title = 'Click to hide or show this category';
    h.innerHTML = `${window.ic ? window.ic(z.icon, 14) : '<i class="gzdot"></i>'}<span>${z.name}</span><b>0</b>`;
    zBodies.appendChild(b); zHeads.appendChild(h); zEls[type] = { b, h, count: h.querySelector('b'), empty: b.querySelector('.gz-empty') };
  }
  zHeads.addEventListener('click', (e) => { const h = e.target.closest('.gzh'); if (h) toggleType(h.dataset.type); });
  const EMPTY = { buy: 'No purchases yet', inj: 'No injections caught yet', recall: 'No recalls yet', claim: 'No refunds yet', wish: 'Empty', owned: 'Empty', src: '', user: '' };
  function drawZones() {
    const show = dim === 2 && !!fg;
    zBodies.hidden = !show; zHeads.hidden = !show;
    if (!show) return;
    const counts = {}; for (const n of nodes.values()) counts[n.type] = (counts[n.type] || 0) + 1;
    for (const [type, z] of Object.entries(ZONES)) {
      const a = fg.graph2ScreenCoords(z.x, z.y + z.h, 0), b = fg.graph2ScreenCoords(z.x + z.w, z.y, 0);
      const { b: body, h, count, empty } = zEls[type];
      const st = `left:${a.x.toFixed(1)}px;top:${a.y.toFixed(1)}px;width:${(b.x - a.x).toFixed(1)}px;height:${(b.y - a.y).toFixed(1)}px`;
      if (body.__st !== st) { body.style.cssText = `${st};--c:${z.c}`; body.__st = st; }
      const mid = type === 'src' || z.slim; const hy = mid ? a.y + (b.y - a.y) / 2 - 15 : a.y + 7;
      const hs = `left:${(a.x + 8).toFixed(1)}px;top:${hy.toFixed(1)}px;max-width:${Math.max(60, (type === 'src' ? 185 * ((b.x - a.x) / z.w) : b.x - a.x) - 10).toFixed(1)}px`;
      body.classList.toggle('slim', !!z.slim); h.classList.toggle('slim', !!z.slim);
      if (h.__st !== hs) { h.style.cssText = `${hs};--c:${z.c}`; h.__st = hs; }
      const c = String(counts[type] || 0); if (count.textContent !== c) count.textContent = c;
      const off = hidden.has(type); body.classList.toggle('off', off); h.classList.toggle('off', off);
      const et = z.slim ? '' : off ? 'Hidden · click the title to show' : counts[type] ? '' : EMPTY[type]; if (empty.textContent !== et) empty.textContent = et;
    }
  }

  // ---------- labels (crisp HTML over the canvas) ----------
  const spans = new Map();
  function span(n) {
    let s = spans.get(n.id);
    if (!s) { s = document.createElement('span'); spans.set(n.id, s); lab.appendChild(s); }
    return s;
  }
  function drawLabels() {
    if (!fg) return;
    const W = el.clientWidth, H = el.clientHeight; const seen = new Set();
    if (dim === 2) {
      const o = fg.graph2ScreenCoords(0, 0, 0), u = fg.graph2ScreenCoords(100, 0, 0); const scale = Math.max(0.05, (u.x - o.x) / 100);
      for (const n of nodes.values()) {
        if (!showLabels || hidden.has(n.type) || n.x == null) continue;
        const p = fg.graph2ScreenCoords(n.x, n.y, 0);
        if (p.x < -80 || p.y < -40 || p.x > W + 80 || p.y > H + 40) continue;
        const s = span(n); const r = Math.cbrt(VAL[n.type]) * REL2 * scale;
        s.className = `k-${n.type} ${n.lab === 'b' ? 'b' : 'r'}${n === sel || n === hover ? ' sel' : ''}`;
        const txt = n.type === 'src' ? SHORT[n.id] ?? n.label : n.label; if (s.textContent !== txt) s.textContent = txt;
        s.style.opacity = lit ? (hiNodes.has(n) ? 1 : 0.2) : 1;
        const maxW = Math.max(48, (n.slotW ?? 140) * scale - (n.lab === 'b' ? 6 : 13 * scale + r + 14));
        s.style.maxWidth = `${maxW.toFixed(0)}px`;
        if (n.lab === 'b') { s.style.left = `${p.x}px`; s.style.top = `${p.y + r + 6}px`; }
        else { s.style.left = `${p.x + r + 8}px`; s.style.top = `${p.y}px`; }
        seen.add(n.id);
      }
    } else {
      const cam = fg.camera(); const tgt = fg.controls().target;
      const fx = tgt.x - cam.position.x, fy = tgt.y - cam.position.y, fz = tgt.z - cam.position.z; const fl = Math.hypot(fx, fy, fz) || 1;
      for (const n of nodes.values()) {
        if (hidden.has(n.type) || n.x == null) continue;
        const near = Math.hypot(n.x - cam.position.x, n.y - cam.position.y, zOf(n) - cam.position.z);
        const front = ((n.x - cam.position.x) * fx + (n.y - cam.position.y) * fy + (zOf(n) - cam.position.z) * fz) / fl;
        const always = n.type === 'user' || n.type === 'src' || n.type === 'recall' || n.type === 'buy';
        const show = showLabels && front > 0 && (always || hiNodes.has(n) || near < fl * 0.6) && (!lit || hiNodes.has(n));
        if (!show) continue;
        const p = fg.graph2ScreenCoords(n.x, n.y, zOf(n));
        if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) continue;
        const s = span(n);
        s.className = `k-${n.type}${n === sel || n === hover ? ' sel' : ''}`;
        const txt = n.label.length > 30 ? n.label.slice(0, 28) + '…' : n.label;
        if (s.textContent !== txt) s.textContent = txt;
        s.style.maxWidth = '';
        const depth = Math.max(0.28, Math.min(1, 1.55 - near / (fl * 1.25)));
        s.style.opacity = lit ? 1 : depth.toFixed(2);
        const r = Math.cbrt(VAL[n.type]) * 4 * (fl / Math.max(near, 1)) * 1.1;
        s.style.left = `${p.x}px`; s.style.top = `${p.y + Math.min(26, 8 + r)}px`;
        seen.add(n.id);
      }
    }
    for (const [id, s] of spans) if (!seen.has(id)) { s.remove(); spans.delete(id); }
  }

  // ---------- animation loop: pop-in, recall pulse, glow, orbit, zones, labels ----------
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
    if (dim === 3 && spin && !hover && !lit && now > holdSpinUntil && !focusNode) {
      const cam = fg.camera(); const tgt = fg.controls().target;
      const dx = cam.position.x - tgt.x, dz = cam.position.z - tgt.z; const r = Math.hypot(dx, dz); const a = Math.atan2(dx, dz) + 0.0018;
      cam.position.x = tgt.x + r * Math.sin(a); cam.position.z = tgt.z + r * Math.cos(a); cam.lookAt(tgt);
    }
    drawZones();
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

  // ---------- camera ----------
  function fit2D(ms = 900) { // frame the whole zone grid inside the area the overlays leave free
    if (!fg) return;
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
    const lg = view.querySelector('.legend'); const tb = view.querySelector('.gtools');
    const padT = lg ? lg.offsetTop + lg.offsetHeight + 16 : 110; const padB = tb ? H - tb.offsetTop + 14 : 92; const padX = 30;
    const gw = GRID.x1 - GRID.x0, gh = GRID.y1 - GRID.y0;
    const scale = Math.max(0.1, Math.min((W - 2 * padX) / gw, (H - padT - padB) / gh)); // px per unit
    const fov = (fg.camera().fov || 40) * Math.PI / 180;
    const Z = H / (2 * Math.tan(fov / 2) * scale);
    const cx = (GRID.x0 + GRID.x1) / 2; const cy = (GRID.y0 + GRID.y1) / 2 + ((padT - padB) / 2) / scale;
    fg.camera().up.set(0, 1, 0);
    fg.cameraPosition({ x: cx, y: cy, z: Z }, { x: cx, y: cy, z: 0 }, ms);
  }
  function fit3D(tries = 0) { // wait until the layout has real size, else the camera dives into the cluster
    if (!fg) return; const b = fg.getGraphBbox();
    if ((!b || b.x[1] - b.x[0] < 140) && tries < 12) { setTimeout(() => fit3D(tries + 1), 500); return; }
    const size = Math.max(b.x[1] - b.x[0], b.y[1] - b.y[0], b.z[1] - b.z[0]); const c = fg.camera().position; const d = Math.hypot(c.x, c.y, c.z) || 1; const want = size * 1.28;
    fg.cameraPosition({ x: (c.x / d) * want, y: (c.y / d) * want, z: (c.z / d) * want }, { x: 0, y: 0, z: 0 }, 900);
  }
  const fit = () => (dim === 2 ? fit2D() : fit3D());
  function size() { if (fg && el.clientWidth) { fg.width(el.clientWidth).height(el.clientHeight); if (dim === 2 && !focusNode) fit2D(0); } }
  const matches = (n) => !!query && `${n.label} ${n.title ?? ''} ${n.id} ${KIND[n.type]}`.toLowerCase().includes(query);
  function setHi() { // one highlight path for hover, click selection and search
    hiNodes = new Set(); hiLinks = new Set();
    const seeds = hover ? [hover] : sel ? [sel] : query ? [...nodes.values()].filter((n) => !hidden.has(n.type) && matches(n)) : [];
    for (const n of seeds) { hiNodes.add(n); for (const l of links.values()) if (l.source === n || l.target === n) { hiLinks.add(l); hiNodes.add(l.source); hiNodes.add(l.target); } }
    lit = seeds.length > 0 || !!query; restyle();
  }
  function flyTo(n) {
    focusNode = n; sel = n; setHi(); card(n);
    if (!fg) return;
    if (dim === 2) { // pan + zoom in on the node, top-down
      const z = Math.max(260, fg.camera().position.z * 0.55);
      fg.cameraPosition({ x: n.x, y: n.y, z }, { x: n.x, y: n.y, z: 0 }, 900);
      return;
    }
    const d = Math.hypot(n.x, n.y, zOf(n));
    fg.cameraPosition(d < 1 ? { x: 0, y: 0, z: 150 } : { x: n.x * (1 + 90 / d), y: n.y * (1 + 90 / d), z: zOf(n) * (1 + 90 / d) }, n, 1100);
  }
  function restyle() { if (!fg) return; fg.nodeColor(fg.nodeColor()).linkVisibility(fg.linkVisibility()).linkColor(fg.linkColor()).linkWidth(fg.linkWidth()).linkDirectionalParticles(fg.linkDirectionalParticles()); }

  // ---------- 2D / 3D ----------
  const $ = (id) => document.getElementById(id);
  const tools = document.querySelector('.view.graph .gtools');
  const dimSeg = document.createElement('span'); dimSeg.className = 'gdim';
  dimSeg.innerHTML = `<button id="gDim2" class="on" title="Zones: every category in its own section">${window.ic ? window.ic('scan-eye', 15) : ''}2D</button><button id="gDim3" title="Free 3D web you can orbit">${window.ic ? window.ic('orbit', 15) : ''}3D</button>`;
  const dimSep = document.createElement('span'); dimSep.className = 'sep';
  tools.prepend(dimSep); tools.prepend(dimSeg);
  const threeOnly = () => [$('gSphere'), $('gWeb'), $('gSpread')?.closest('label'), $('gSpin'), $('gBurst'), ...[...tools.querySelectorAll(':scope > .sep')].filter((s) => s !== dimSep)].filter(Boolean);
  function setControls() {
    const ctl = fg?.controls();
    if (ctl) {
      ctl.noRotate = dim === 2;
      if (ctl.mouseButtons) ctl.mouseButtons.LEFT = dim === 2 ? 2 : 0; // 2D: left-drag pans (THREE.MOUSE.PAN = 2, ROTATE = 0)
    }
  }
  function setDim(d) {
    if (d === dim && fg) return;
    dim = d;
    $('gDim2').classList.toggle('on', d === 2); $('gDim3').classList.toggle('on', d === 3);
    view.classList.toggle('dim2', d === 2); view.classList.toggle('dim3', d === 3);
    for (const e of threeOnly()) e.hidden = d === 2;
    if (!fg) return;
    focusNode = null; sel = null; card(null); setHi();
    for (const n of nodes.values()) { n.fx = n.fy = n.fz = undefined; }
    if (d === 2) {
      for (const n of nodes.values()) { n.z = 0; n.vz = 0; }
      fg.numDimensions(2).nodeRelSize(REL2);
    } else {
      for (const n of nodes.values()) { n.z = (Math.random() - 0.5) * 80; n.vz = 0; }
      fg.numDimensions(3).nodeRelSize(REL);
    }
    setControls();
    fg.graphData(data());
    applyForces();
    if (d === 2) fit2D(1000);
    else { fitted = false; fg.camera().up.set(0, 1, 0); fg.cameraPosition({ x: 0, y: 70, z: 430 }, { x: 0, y: 0, z: 0 }, 1000); setTimeout(() => fit3D(), 1800); }
  }
  $('gDim2').onclick = () => setDim(2);
  $('gDim3').onclick = () => setDim(3);
  view.classList.add('dim2');
  for (const e of threeOnly()) e.hidden = true;

  // ---------- mount ----------
  function mount() {
    if (fg || typeof ForceGraph3D === 'undefined') return;
    build();
    fg = ForceGraph3D({ controlType: 'trackball', rendererConfig: { antialias: true, alpha: true } })(el)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .numDimensions(dim)
      .width(el.clientWidth).height(el.clientHeight)
      .graphData(data())
      .nodeId('id')
      .nodeRelSize(dim === 2 ? REL2 : REL)
      .nodeVal((n) => VAL[n.type])
      .nodeResolution(28)
      .nodeOpacity(0.96)
      .nodeColor(nColor)
      .nodeLabel(() => '')
      .linkColor(lColor)
      .linkOpacity(1)
      .linkWidth((l) => (hiLinks.has(l) ? 1.6 : 0.55))
      .linkCurvature(0.12)
      .linkVisibility((l) => dim === 3 || hiLinks.has(l))
      .linkDirectionalParticles((l) => (dim === 2 ? (flow && hiLinks.has(l) ? 2 : 0) : flow && FLOWING.has(l.kind) && !hidden.has('src') ? (S.busy ? 4 : 2) : 0))
      .linkDirectionalParticleSpeed(() => (S.busy ? 0.014 : 0.006))
      .linkDirectionalParticleWidth(2.2)
      .linkDirectionalParticleColor((l) => `rgb(${(LINK[l.kind] ?? ['200,210,225'])[0]})`)
      .d3VelocityDecay(0.3)
      .warmupTicks(40)
      .cooldownTicks(260)
      .onNodeHover((n) => { hover = n || null; setHi(); el.style.cursor = n ? 'pointer' : 'grab'; })
      .onNodeClick((n) => flyTo(n))
      .onBackgroundClick(() => { card(null); focusNode = null; sel = null; setHi(); })
      .onNodeDragEnd((n) => { n.fx = n.x; n.fy = n.y; if (dim === 3) n.fz = n.z; holdSpinUntil = performance.now() + 2500; })
      .onEngineStop(() => {
        if (dim === 2) { if (!fitted) { fitted = true; if (!focusNode) fit2D(); } return; }
        if (!fitted || nodes.size !== fitN) { fitted = true; fitN = nodes.size; if (!focusNode) fit3D(); }
      });
    fg.d3Force('slots', slots());
    fg.d3Force('shells', shells());
    fg.d3Force('gravity', gravity());
    fg.d3Force('center', null);
    setControls();
    applyForces();
    if (dim === 2) fit2D(0); else fg.cameraPosition({ x: 0, y: 70, z: 430 });
    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', () => { holdSpinUntil = performance.now() + 60000; });
    window.addEventListener('pointerup', () => { if (holdSpinUntil > performance.now() + 5000) holdSpinUntil = performance.now() + 2500; });
    el.addEventListener('wheel', () => { holdSpinUntil = performance.now() + 2500; }, { passive: true });
    if (window.ResizeObserver) { let t = null; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(size, 60); }).observe(el); }
    stats(); requestAnimationFrame(loop);
    SC.graph = () => fg;
  }

  // ---------- controls ----------
  function toggleType(t) {
    if (hidden.has(t)) hidden.delete(t); else hidden.add(t);
    document.querySelector(`#gkeys button[data-type="${t}"]`)?.classList.toggle('off', hidden.has(t));
    if (fg) fg.graphData(data());
  }
  const setMode = (m) => { mode = m; $('gSphere').classList.toggle('on', m === 'sphere'); $('gWeb').classList.toggle('on', m === 'web'); applyForces(); };
  $('gSphere').onclick = () => setMode('sphere');
  $('gWeb').onclick = () => setMode('web');
  $('gSpread').oninput = (e) => { spread = e.target.value / 100; applyForces(); };
  $('gSpin').onclick = (e) => { spin = !spin; focusNode = null; e.currentTarget.classList.toggle('on', spin); };
  $('gFlow').onclick = (e) => { flow = !flow; e.currentTarget.classList.toggle('on', flow); restyle(); };
  $('gLabels').onclick = (e) => { showLabels = !showLabels; e.currentTarget.classList.toggle('on', showLabels); };
  $('gBurst').onclick = () => {
    if (!fg || dim === 2) return;
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
  $('gkeys').onclick = (e) => { const b = e.target.closest('button[data-type]'); if (b) toggleType(b.dataset.type); };
  window.addEventListener('resize', size);

  SC.on((type) => {
    if (type === 'page') {
      if (S.page === 'graph') { mount(); fg?.resumeAnimation(); requestAnimationFrame(() => { size(); refresh(); }); setTimeout(() => { if (!focusNode) fit(); }, 1600); }
      else fg?.pauseAnimation();
    } else if (type === 'reset') { nodes.clear(); links.clear(); card(null); for (const s of spans.values()) s.remove(); spans.clear(); if (fg) fg.graphData(data()); }
    else refresh();
  });
})();
