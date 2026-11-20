// Content pages ported from the team dashboard (web/): Recalls, Refunds, Memory, Approvals, Activity, Runs, Missions.
// Same data as the live stage (window.SC.S, fed by /tick events) + GET /profile and GET /refunds on the agent.
(() => {
  const { S, esc, money } = window.SC;
  const $ = (id) => document.getElementById(id);
  const head = (title, sub, right = '') => `<div class="pg-head"><div><h2>${title}</h2><p>${sub}</p></div>${right}</div>`;
  const empty = (t) => `<div class="pg-card"><p style="color:var(--muted)">${t}</p></div>`;
  const ago = (iso) => { const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };
  const ACT = { purchase_skipped: ['Skipped the purchase', 'warn'], refund_claim_filed: ['Refund claim filed', 'steel'], replacement_bought: ['Safe replacement bought', 'ok'], needs_you: ['Needs Maya', 'bad'] };
  let refunds = { claims: [] };
  const localMissions = [];

  function recalls() {
    const list = [...S.recalls.values()].reverse();
    $('ctRecalls').hidden = !list.length; $('ctRecalls').textContent = new Set(list.map((a) => a.recallId)).size;
    $('pgRecalls').innerHTML = head('Recalls', 'Every recall that touched something Maya owns or wants, and what the agent did about it.') +
      (list.length ? list.map((a) => `<div class="pg-card bad">
        <div class="chips"><span class="badge bad">CPSC ${esc(a.recallId)}</span><span class="badge idle">${a.itemKind}</span><span class="badge ${ACT[a.action]?.[1] ?? 'idle'}">${ACT[a.action]?.[0] ?? a.action}</span><span class="meta">${ago(a.at)}</span></div>
        <h3>${esc(a.itemTitle)}</h3>
        <p><b>Hazard.</b> ${esc(a.hazard)}</p><p><b>Remedy.</b> ${esc(a.remedy)}</p>
        <div class="chips">${a.claimRef ? `<span class="chip">Refund claim ${esc(a.claimRef)}</span>` : ''}${a.replacementTitle ? `<span class="chip">Replacement: ${esc(a.replacementTitle)}</span>` : ''}<a class="chip" href="${esc(a.url)}" target="_blank">CPSC notice ↗</a></div>
      </div>`).join('') : empty('No recalls affect Maya’s items yet. Press 2 to publish one.'));
  }

  async function loadRefunds() { try { refunds = await (await SC.api('/refunds')).json(); } catch (e) { refunds = { claims: [], error: e.message }; } refundsPage(); }
  function refundsPage() {
    const el = $('pgRefunds'); if (!el) return;
    el.innerHTML = head('Refunds', `When a recall hits something Maya owns, SafeCart writes to the store and asks for the refund. Source: ${esc(refunds.source ?? '—')}.`, '<button class="btn ghost" id="rfReload">Refresh</button>') +
      (refunds.claims?.length ? [...refunds.claims].reverse().map((c) => `<div class="pg-card">
        <div class="chips"><span class="badge steel">${esc(c.claimRef)}</span><span class="badge ${/filed|approved|paid/i.test(c.storeStatus) ? 'ok' : 'warn'}">Store: ${esc(c.storeStatus ?? c.status ?? 'filed')}</span><span class="badge idle">CPSC ${esc(c.recallId)}</span>${c.at ? `<span class="meta">${ago(c.at)}</span>` : ''}</div>
        <h3>${esc(c.itemTitle)}</h3>
        ${c.letter ? `<div class="meta">Letter${c.letterModel && c.letterModel !== 'template' ? ` written by ${esc(c.letterModel)}` : ' (template)'}</div><p style="white-space:pre-wrap">${esc(c.letter)}</p>` : ''}
        ${c.storeReply ? `<div class="meta">Store reply</div><p>${esc(c.storeReply)}</p>` : ''}
      </div>`).join('') : empty(refunds.error ? `Couldn't load refunds: ${esc(refunds.error)}` : 'No refund requests yet. They appear when a recall hits an owned item.'));
    const b = $('rfReload'); if (b) b.onclick = loadRefunds;
  }

  function memory() {
    const p = S.profile; if (!p) return;
    const safety = (s) => (!s ? '<span class="badge idle">Not checked</span>' : s.status === 'recalled' ? `<span class="badge bad">Recalled · CPSC ${esc(s.recallId)}</span>` : s.status === 'clear' ? '<span class="badge ok">Safe</span>' : '<span class="badge warn">Safety unknown</span>');
    $('pgMemory').innerHTML = head('Memory', 'What SafeCart knows about Maya. Preferences rank alternatives, and the inventory is what it protects.') +
      `<div class="pg-card"><div class="meta">PREFERENCES</div><div class="chips">${p.preferences.map((x) => `<span class="chip ${x.source === 'memory' ? 'mem' : ''}">${esc(x.label)}${x.source === 'memory' ? ' · learned' : ''}</span>`).join('')}</div></div>
       <div class="meta" style="margin-top:6px">WISHLIST</div><div class="pg-grid">${p.wishlist.map((w) => `<div class="pg-card"><h3>${esc(w.title)}</h3><div class="chips">${safety(w.safety)}${w.onSale ? `<span class="badge warn">On sale −${Math.round((1 - w.price / w.listPrice) * 100)}%</span>` : ''}</div><div class="meta">${money(w.price)} · target ${money(w.targetPrice)}</div></div>`).join('')}</div>
       <div class="meta" style="margin-top:6px">OWNED</div><div class="pg-grid">${p.owned.map((o) => `<div class="pg-card ${o.safety?.status === 'recalled' ? 'bad' : ''}"><h3>${esc(o.title)}</h3>${safety(o.safety)}<div class="meta">Model ${esc(o.model)} · ${esc(o.merchant)} · ${esc(o.purchasedAt)}</div></div>`).join('')}</div>`;
  }

  function approvals() {
    const list = [...S.approvals.values()];
    $('ctApprovals').hidden = !list.length; $('ctApprovals').textContent = list.length;
    $('pgApprovals').innerHTML = head('Approvals', 'Purchases above Maya’s auto-buy limit wait here. Approving re-runs the safety check before paying.') +
      (list.length ? list.map((a) => `<div class="pg-card"><div class="chips"><span class="badge warn">Waiting</span><span class="meta">${ago(a.at)}</span></div>
        <h3>${esc(a.candidate.title)} · ${money(a.candidate.price)}</h3><p>${esc(a.reason)}</p>
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
    const rows = [...p.wishlist.map((w) => ({ title: w.title, max: w.targetPrice, status: bought.has(w.id) ? 'done' : w.safety?.status === 'recalled' ? 'recalled' : w.onSale ? 'on sale' : 'watching', note: bought.get(w.id) ? `bought ${bought.get(w.id).title}` : '' })), ...localMissions];
    $('pgMissions').innerHTML = head('Missions', 'What the agent is watching for Maya. Wishlist items come from her profile.') +
      `<div class="pg-card"><form class="form" id="mForm"><input id="mTitle" placeholder="Item to watch"><input id="mMax" placeholder="Max price" style="flex:0 0 120px"><button class="btn">Add</button></form><div class="meta">Local only in this prototype: the agent watches the profile wishlist.</div></div>` +
      rows.map((m) => `<div class="pg-card"><div class="chips"><span class="badge ${m.status === 'done' ? 'ok' : m.status === 'recalled' ? 'bad' : m.status === 'on sale' ? 'warn' : 'idle'}">${esc(m.status)}</span></div><h3>${esc(m.title)}</h3><div class="meta">max ${money(m.max)}${m.note ? ` · ${esc(m.note)}` : ''}</div></div>`).join('');
    $('mForm').onsubmit = (e) => { e.preventDefault(); const t = $('mTitle').value.trim(), mx = parseFloat($('mMax').value); if (!t) return; localMissions.push({ title: t, max: isFinite(mx) ? mx : 0, status: 'watching (local)', note: '' }); missions(); };
  }

  function renderAll() { recalls(); memory(); approvals(); activity(); runs(); missions(); refundsPage(); }
  document.addEventListener('click', (e) => {
    const ap = e.target.closest('[data-ap]'); if (ap) SC.approve(ap.dataset.ap, true);
    const de = e.target.closest('[data-de]'); if (de) SC.approve(de.dataset.de, false);
    const rn = e.target.closest('.view.page [data-run]'); if (rn) SC.openRun(+rn.dataset.run);
  });
  let t = null;
  SC.on((type) => {
    clearTimeout(t);
    t = setTimeout(() => { renderAll(); if (type === 'tickdone' || (type === 'page' && S.page === 'refunds')) loadRefunds(); }, 80);
  });
})();
