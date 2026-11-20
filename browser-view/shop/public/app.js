'use strict';
// SafeShop SPA: vanilla JS, hash routing, live prices via SSE, every action tracked via /api/track.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const api = async (path, opts = {}) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
};
const track = (type, extra = {}) => { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }), keepalive: true }).catch(() => {}); };
const hash32 = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const S = { products: new Map(), cart: { items: [], total: 0 }, wish: new Set(), depts: [], sellers: [], lastSearchKey: null };
const IMG_TYPES = ['stroller', 'high_chair', 'car_seat', 'monitor', 'bassinet', 'bottle_warmer', 'white_noise', 'crib_sheets', 'headphones', 'charger', 'powerbank', 'speaker', 'smart_plug', 'blender', 'air_fryer', 'kettle', 'vacuum', 'heater', 'toy', 'diapers', 'bag', 'bib'];

// ---------- helpers ----------
const catName = (c) => String(c).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const pctOff = (p) => (p.listPrice > p.price ? Math.round((1 - p.price / p.listPrice) * 100) : 0);
const stars = (r) => `<span class="stars" style="--r:${r || 0}" title="${r} out of 5"></span>`;
function priceBlock(p, big) {
  const [w, f] = p.price.toFixed(2).split('.');
  const off = pctOff(p);
  return `<span class="price"><span class="sym">$</span><span class="whole">${Number(w).toLocaleString()}</span><span class="frac">${f}</span></span>` +
    (off >= 1 ? `<span class="list">${money(p.listPrice)}</span><span class="off">-${off}%</span>` : '');
}
const pblock = (p, big) => `<div class="pblock ${big ? 'big' : ''} ${pctOff(p) >= 20 ? 'red' : ''}" data-pid="${esc(p.id)}" data-big="${big ? 1 : 0}">${priceBlock(p, big)}</div>`;
const imgUrl = (p) => p.image;

function card(p) {
  const wished = S.wish.has(p.id);
  const tag = p.isNew ? '<span class="tag new">New</span>' : p.flash || pctOff(p) >= 25 ? '<span class="tag deal">Limited time deal</span>' : '';
  return `<div class="pc" data-card="${esc(p.id)}">${tag}
<button class="heart ${wished ? 'on' : ''}" data-act="wish" data-id="${esc(p.id)}" title="Add to wishlist" aria-label="Wishlist">${wished ? '&#9829;' : '&#9825;'}</button>
<a class="im" href="#/product/${encodeURIComponent(p.id)}"><img loading="lazy" src="${esc(imgUrl(p))}" alt="${esc(p.title)}"></a>
<a class="tt" href="#/product/${encodeURIComponent(p.id)}" title="${esc(p.title)}">${esc(p.title)}</a>
<div class="rt">${p.reviews ? `${stars(p.rating)} <span class="rcount">${p.reviews.toLocaleString()}</span>` : '<span class="muted">No reviews yet</span>'}</div>
${pblock(p)}
<div class="by">Sold by <a href="#/seller/${esc(p.sellerId)}">${esc(p.sellerName)}</a></div>
<div class="stk">${p.stock <= 5 ? `Only ${p.stock} left in stock` : '&nbsp;'}</div>
<button class="btn y" data-act="add" data-id="${esc(p.id)}">Add to cart</button></div>`;
}
const grid = (list) => `<div class="grid">${list.map(card).join('')}</div>`;

function toast(html, cls = '', ms = 4200) {
  const t = document.createElement('div');
  t.className = 'toast ' + cls; t.innerHTML = html;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- data ----------
async function loadAll() {
  const [prods, cats, sell, cart, wish] = await Promise.all([api('/api/products'), api('/api/categories'), api('/api/sellers'), api('/api/cart'), api('/api/wishlist')]);
  S.products = new Map(prods.map((p) => [p.id, p]));
  S.depts = cats; S.sellers = sell;
  setCart(cart); S.wish = new Set(wish.items.map((p) => p.id)); updateCounts();
}
function setCart(c) { S.cart = c; for (const i of c.items) S.products.set(i.productId, { ...S.products.get(i.productId), ...i.product }); updateCounts(); }
function updateCounts() {
  $('#cartCount').textContent = S.cart.items.reduce((a, i) => a + i.qty, 0);
  $('#wishCount').textContent = S.wish.size;
}
const all = () => [...S.products.values()];

// ---------- actions ----------
async function addToCart(id, qty = 1, quiet) {
  try {
    const c = await api('/api/cart', { method: 'POST', body: { productId: id, qty } });
    setCart(c);
    track(qty > 0 ? 'add_to_cart' : 'remove_from_cart', { productId: id, qty: Math.abs(qty) });
    const p = S.products.get(id);
    if (!quiet) toast(`<b>Added to cart</b><br>${esc(p.title)}<br><a href="#/cart">Go to cart</a>`, 'green');
    return true;
  } catch (e) { toast(esc(e.message), 'red'); return false; }
}
async function removeFromCart(id) {
  const it = S.cart.items.find((i) => i.productId === id);
  setCart(await api('/api/cart?productId=' + encodeURIComponent(id), { method: 'DELETE' }));
  track('remove_from_cart', { productId: id, qty: it ? it.qty : 1 });
}
async function toggleWish(id) {
  const p = S.products.get(id);
  if (S.wish.has(id)) {
    await api('/api/wishlist?productId=' + encodeURIComponent(id), { method: 'DELETE' }); S.wish.delete(id); track('wishlist_remove', { productId: id });
    toast('Removed from wishlist');
  } else {
    await api('/api/wishlist', { method: 'POST', body: { productId: id } }); S.wish.add(id); track('wishlist_add', { productId: id });
    toast(`<b>Added to wishlist</b><br>${esc(p.title)}`, 'green');
  }
  updateCounts();
  $$(`[data-act="wish"][data-id="${CSS.escape(id)}"]`).forEach((b) => { const on = S.wish.has(id); b.classList.toggle('on', on); if (b.classList.contains('heart')) b.innerHTML = on ? '&#9829;' : '&#9825;'; else b.textContent = on ? 'Remove from wishlist' : 'Add to wishlist'; });
  if (location.hash.startsWith('#/wishlist')) route();
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  if (act === 'add') { e.preventDefault(); const q = Number($('#qtySel') && b.dataset.from === 'pp' ? $('#qtySel').value : 1); await addToCart(id, q); }
  else if (act === 'buynow') { const q = Number($('#qtySel').value); if (await addToCart(id, q, true)) location.hash = '#/cart'; }
  else if (act === 'wish') { e.preventDefault(); await toggleWish(id); }
  else if (act === 'inc') { await addToCart(id, 1, true); renderCart(); }
  else if (act === 'dec') { const it = S.cart.items.find((i) => i.productId === id); if (it && it.qty > 1) { await addToCart(id, -1, true); renderCart(); } else { await removeFromCart(id); renderCart(); } }
  else if (act === 'rm') { await removeFromCart(id); renderCart(); }
  else if (act === 'chat') { location.hash = '#/chat/' + id; }
});

// ---------- router ----------
const routes = [
  [/^#?\/?$/, home], [/^#\/deals$/, deals], [/^#\/search/, searchPage], [/^#\/product\/(.+)$/, productPage], [/^#\/cart$/, renderCart],
  [/^#\/wishlist$/, wishlistPage], [/^#\/orders$/, ordersPage], [/^#\/order\/(.+)$/, orderPage], [/^#\/seller\/([^/]+)$/, sellerPage],
  [/^#\/chat\/([^/]+)$/, chatPage], [/^#\/sell$/, sellPage],
];
let chatTimer = null;
async function route() {
  clearInterval(chatTimer);
  const h = location.hash || '#/';
  const path = h.split('?')[0];
  if (!path.startsWith('#/search')) S.lastSearchKey = null;
  for (const [re, fn] of routes) { const m = path.match(re); if (m) { try { await fn(...m.slice(1).map(decodeURIComponent)); } catch (e) { console.error(e); $('#app').innerHTML = `<div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a href="#/">Back to home</a></div>`; } window.scrollTo(0, 0); markNav(); return; }
  }
  $('#app').innerHTML = '<div class="empty"><h2>Page not found</h2><a href="#/">Back to home</a></div>';
}
window.addEventListener('hashchange', route);
const params = () => new URLSearchParams((location.hash.split('?')[1]) || '');
const app = () => $('#app');

function buildNav() {
  $('#searchCat').innerHTML = `<option value="all">All</option>` + S.depts.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  $('#mainNav').innerHTML = `<a href="#/search?cat=all">&#9776; All</a><a href="#/deals">Today's Deals</a>` +
    S.depts.map((d) => `<a href="#/search?cat=${d.id}" data-cat="${d.id}">${esc(d.name)}</a>`).join('') +
    `<a href="#/orders">Your Orders</a><a href="#/sell">Sell on SafeShop</a><span class="sp"></span><a href="#/deals" class="live">Prices update live</a>`;
}
function markNav() {
  const p = params();
  $$('#mainNav a').forEach((a) => a.classList.toggle('on', a.dataset.cat && location.hash.startsWith('#/search') && p.get('cat') === a.dataset.cat));
}
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#searchInput').value.trim(), cat = $('#searchCat').value;
  const target = '#/search?' + new URLSearchParams({ ...(q ? { q } : {}), cat }).toString();
  S.lastSearchKey = null;
  if (location.hash === target) route(); else location.hash = target;
});

// ---------- pages ----------
function departmentRow(d, n = 8) {
  const list = all().filter((p) => p.department === d.id).sort((a, b) => b.reviews * b.rating - a.reviews * a.rating).slice(0, n);
  return `<section class="sec card"><div class="sec-h"><h2>${esc(d.name)}</h2><a href="#/search?cat=${d.id}">See all</a></div><div class="hscroll">${list.map(card).join('')}</div></section>`;
}
function dealsList() {
  return all().filter((p) => p.stock > 0 && (p.flash || pctOff(p) >= 20)).sort((a, b) => pctOff(b) - pctOff(a));
}
function recommended() {
  let seen = []; try { seen = JSON.parse(localStorage.getItem('ss_seen') || '[]'); } catch { /* */ }
  const cats = new Set(seen.map((id) => (S.products.get(id) || {}).category));
  const wishCats = new Set([...S.wish].map((id) => (S.products.get(id) || {}).category));
  return all().filter((p) => p.reviews > 0).map((p) => ({ p, s: p.rating + (cats.has(p.category) ? 1.5 : 0) + (wishCats.has(p.category) ? 1 : 0) + (p.department === 'baby' ? 0.4 : 0) + (hash32(p.id + 'r') % 100) / 150 }))
    .sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.p);
}
function home() {
  const d = dealsList().slice(0, 12);
  const dept = (id) => all().filter((p) => p.department === id).slice(0, 4);
  const q = (dd) => `<div class="qcard"><h3>${esc(dd.name)}</h3><div class="qgrid">${dept(dd.id).map((p) => `<a href="#/product/${encodeURIComponent(p.id)}"><img src="${esc(p.image)}" alt=""><span>${esc(catName(p.category))}</span></a>`).join('')}</div><a href="#/search?cat=${dd.id}">Shop ${esc(dd.name)}</a></div>`;
  const hero = ['stroller', 'bassinet', 'monitor'].map((t) => `<img src="/img/${t}.svg?c=${['e07a5f', '4f7cac', '81b29a'][['stroller', 'bassinet', 'monitor'].indexOf(t)]}" alt="">`).join('');
  app().innerHTML = `<div class="hero"><div><h1>Everything for baby, home &amp; tech</h1><p>Compare sellers, watch prices move in real time and shop with confidence on SafeShop.</p><a class="cta" href="#/search?cat=baby">Shop baby essentials</a></div><div class="art">${hero}</div></div>
<div class="quad">${S.depts.map(q).join('')}</div>
<section class="sec card"><div class="sec-h"><h2>Deals right now</h2><span class="live">Live flash sales</span><a href="#/deals">See all deals</a></div><div class="hscroll" id="dealRow">${d.map(card).join('')}</div></section>
<section class="sec card"><div class="sec-h"><h2>Recommended for you</h2><span class="muted">Based on your browsing</span></div>${grid(recommended())}</section>
${S.depts.map((x) => departmentRow(x)).join('')}`;
}
function deals() {
  const d = dealsList();
  app().innerHTML = `<div class="crumbs">Today's Deals <span class="live">Prices update live</span></div><div class="card"><h2>Today's Deals (${d.length})</h2>${d.length ? grid(d) : '<p class="muted">No deals right now. Check back in a minute!</p>'}</div>`;
}

async function searchPage() {
  const p = params();
  const q = (p.get('q') || '').trim(), cat = p.get('cat') || 'all', min = p.get('min'), max = p.get('max'), minR = p.get('rating'), sort = p.get('sort') || 'rel';
  $('#searchInput').value = q; $('#searchCat').value = S.depts.some((d) => d.id === cat) ? cat : 'all';
  const key = q + '|' + cat;
  if (q && S.lastSearchKey !== key) { track('search', { query: q, meta: { category: cat } }); }
  S.lastSearchKey = key;
  const qs = new URLSearchParams(); if (q) qs.set('q', q);
  const base = await api('/api/products?' + qs);
  const inCat = (x) => cat === 'all' || x.department === cat || x.category === cat;
  let list = base.filter(inCat);
  const catCounts = {};
  for (const x of base.filter((y) => cat === 'all' || y.department === cat || y.category === cat)) catCounts[x.category] = (catCounts[x.category] || 0) + 1;
  list = list.filter((x) => (!min || x.price >= +min) && (!max || x.price <= +max) && (!minR || x.rating >= +minR));
  if (sort === 'price') list.sort((a, b) => a.price - b.price); else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating); else if (sort === 'new') list.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || String(b.createdAt).localeCompare(a.createdAt));
  const link = (over) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(over)) { if (v == null || v === '') n.delete(k); else n.set(k, v); } return '#/search?' + n; };
  const title = q ? `Results for "${esc(q)}"` : esc((S.depts.find((d) => d.id === cat) || { name: 'All products' }).name);
  const fac = `<aside class="facets"><div class="f"><h4>Department</h4><a class="${cat === 'all' ? 'on' : ''}" href="${link({ cat: 'all' })}">Any department</a>${S.depts.map((d) => `<a class="${cat === d.id ? 'on' : ''}" href="${link({ cat: d.id })}">${esc(d.name)}</a>`).join('')}</div>
<div class="f"><h4>Category</h4>${Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<a class="${cat === c ? 'on' : ''}" href="${link({ cat: c })}">${esc(catName(c))} <span class="muted">(${n})</span></a>`).join('') || '<span class="muted">None</span>'}</div>
<div class="f"><h4>Customer Reviews</h4>${[4, 3, 2].map((r) => `<a class="${minR == r ? 'on' : ''}" href="${link({ rating: minR == r ? '' : r })}">${stars(r)} &amp; Up</a>`).join('')}</div>
<div class="f"><h4>Price</h4>${[['Under $25', '', 25], ['$25 to $50', 25, 50], ['$50 to $100', 50, 100], ['$100 to $200', 100, 200], ['$200 &amp; Above', 200, '']].map(([l, a, b]) => `<a href="${link({ min: a, max: b })}">${l}</a>`).join('')}
<form class="pr" id="prForm"><input name="min" placeholder="Min" value="${esc(min || '')}" inputmode="decimal"> - <input name="max" placeholder="Max" value="${esc(max || '')}" inputmode="decimal"><button class="btn w sm">Go</button></form>${min || max || minR ? `<a href="${link({ min: '', max: '', rating: '' })}">Clear filters</a>` : ''}</div></aside>`;
  app().innerHTML = `<div class="srp">${fac}<div><div class="srp-top"><div><b>${list.length}</b> results ${q ? 'for <b>' + esc(q) + '</b>' : ''}</div><label>Sort by: <select id="sortSel">${[['rel', 'Featured'], ['price', 'Price: Low to High'], ['price_desc', 'Price: High to Low'], ['rating', 'Avg. Customer Review'], ['new', 'Newest Arrivals']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
${list.length ? grid(list) : `<div class="empty"><h2>No results found${q ? ' for "' + esc(q) + '"' : ''}</h2><p class="muted">Try checking your spelling or using fewer filters.</p></div>`}</div></div>`;
  $('#sortSel').onchange = (e) => { location.hash = link({ sort: e.target.value }); };
  $('#prForm').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); location.hash = link({ min: f.get('min'), max: f.get('max') }); };
}

function fakeReviews(p) {
  const names = ['Jordan P.', 'Sam K.', 'Priya R.', 'Alex T.', 'Chris L.', 'Dana W.', 'Morgan B.', 'Taylor S.'];
  const good = [['Exactly what I needed', 'Arrived quickly and works as described. Setup was simple and the build feels sturdy for the price.'], ['Great value', 'Honestly better than I expected. We have used it daily for a few weeks with no issues.'], ['Would buy again', 'Good quality and packaging. Customer service answered my question within a day.']];
  const mid = [['Decent but not perfect', 'Does the job. Instructions could be clearer and one small part was a bit flimsy.'], ['Okay for the price', 'Works fine overall. Not the most premium feel but nothing to complain about.']];
  const bad = [['Mixed feelings', 'It works, but it did not quite match the photos and took longer to arrive than promised.']];
  const out = []; const h = hash32(p.id);
  for (let i = 0; i < 4; i++) {
    const r = p.rating >= 4.2 ? (i === 3 ? 4 : 5) : p.rating >= 3.7 ? [5, 4, 4, 3][i] : [4, 3, 3, 2][i];
    const pool = r >= 4 ? good : r === 3 ? mid : bad;
    const t = pool[(h + i) % pool.length];
    out.push({ name: names[(h + i * 3) % names.length], r, title: t[0], text: t[1], date: new Date(Date.now() - (((h >> i) % 90) + 5) * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) });
  }
  return out;
}
function sparkline(hist) {
  if (!hist || hist.length < 2) return '<p class="muted">Not enough price history yet.</p>';
  const w = 560, h = 110, pad = 6, ps = hist.map((x) => x.price), mn = Math.min(...ps), mx = Math.max(...ps), rng = mx - mn || 1;
  const pts = hist.map((x, i) => [pad + (i / (hist.length - 1)) * (w - pad * 2), pad + (1 - (x.price - mn) / rng) * (h - pad * 2 - 8) + 4]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const down = ps[ps.length - 1] <= ps[0];
  const col = down ? '#007600' : '#b12704';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d} L${w - pad} ${h} L${pad} ${h}Z" fill="${col}" opacity=".08"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.200" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="${col}"/></svg><div style="display:flex;justify-content:space-between;font-size:12px;color:#565959"><span>Low ${money(mn)}</span><span>Now ${money(ps[ps.length - 1])}</span><span>High ${money(mx)}</span></div>`;
}
function descrHtml(text) { // escape everything; HTML comments stay as text in the DOM but are visually hidden
  return String(text).split(/(<!--[\s\S]*?-->)/g).map((seg) => (seg.startsWith('<!--') ? `<span class="vh">${esc(seg)}</span>` : esc(seg))).join('');
}
let currentPid = null;
async function productPage(id) {
  const p = await api('/api/products/' + encodeURIComponent(id)).catch(() => null);
  if (!p) { app().innerHTML = '<div class="empty"><h2>Product not found</h2><a href="#/">Back to home</a></div>'; return; }
  S.products.set(p.id, { ...S.products.get(p.id), ...p });
  currentPid = p.id;
  track('view', { productId: p.id });
  try { const seen = JSON.parse(localStorage.getItem('ss_seen') || '[]').filter((x) => x !== p.id); seen.unshift(p.id); localStorage.setItem('ss_seen', JSON.stringify(seen.slice(0, 12))); } catch { /* */ }
  const off = pctOff(p), wished = S.wish.has(p.id);
  const dep = S.depts.find((d) => d.id === p.department);
  const revs = fakeReviews(p);
  const maxQty = Math.max(1, Math.min(p.stock, 10));
  const stockHtml = p.stock <= 0 ? '<div class="lowstock">Currently unavailable</div>' : p.stock <= 5 ? `<div class="lowstock">Only ${p.stock} left in stock - order soon.</div>` : '<div class="instock">In Stock</div>';
  const eta = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const others = p.sellers || [];
  const offers = [p, ...others].sort((a, b) => a.price - b.price);
  app().innerHTML = `<div class="crumbs"><a href="#/search?cat=${esc(p.department)}">${esc(dep ? dep.name : 'Shop')}</a> &rsaquo; <a href="#/search?cat=${esc(p.category)}">${esc(catName(p.category))}</a></div>
<div class="pp"><div class="big-img">${p.isNew ? '<span class="tag new">New</span>' : ''}<img src="${esc(p.image)}" alt="${esc(p.title)}"></div>
<div><h1>${esc(p.title)}</h1><div class="brand">Brand: <a href="#/search?q=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a> &middot; Model: <b>${esc(p.model)}</b></div>
<div class="rt">${p.reviews ? `<b>${p.rating}</b> ${stars(p.rating)} <a href="#reviews" onclick="document.getElementById('reviews').scrollIntoView({behavior:'smooth'});return false">${p.reviews.toLocaleString()} ratings</a>` : '<span class="muted">No reviews yet</span>'}</div>
<hr><div id="ppPrice" data-pp="${esc(p.id)}">${ppPrice(p)}</div>
<div class="kv"><span>Category</span><span>${esc(catName(p.category))}</span><span>Sold by</span><span><a href="#/seller/${esc(p.sellerId)}">${esc(p.sellerName)}</a></span><span>Item ID</span><span>${esc(p.id)}</span></div>
<hr><h3 style="font-size:16px;margin-bottom:6px">About this item</h3><p style="margin:0;font-size:14px;line-height:1.5">${descrHtml(p.descr)}</p>
<div class="card" style="margin-top:18px"><h2 style="font-size:17px">Price history</h2><div id="sparkBox">${sparkline(p.priceHistory)}</div></div></div>
<aside class="buybox"><div id="bbPrice">${pblock(p, true)}</div><div style="font-size:13px;margin-top:6px">FREE delivery <b>${eta}</b></div>${stockHtml}
${p.stock > 0 ? `<label style="font-size:13px">Quantity: <select id="qtySel">${Array.from({ length: maxQty }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
<button class="btn y" data-act="add" data-from="pp" data-id="${esc(p.id)}">Add to Cart</button><button class="btn o" data-act="buynow" data-id="${esc(p.id)}">Buy Now</button>` : ''}
<button class="btn w" data-act="wish" data-id="${esc(p.id)}">${wished ? 'Remove from wishlist' : 'Add to wishlist'}</button>
<div class="sellbox"><div class="kv" style="grid-template-columns:70px 1fr;margin-top:0"><span>Ships from</span><span>${esc(p.sellerName)}</span><span>Sold by</span><span><a href="#/seller/${esc(p.sellerId)}">${esc(p.sellerName)}</a></span><span>Returns</span><span>30-day refund</span></div>
<div style="margin-top:10px">${sellerStars(p.sellerId)}</div><button class="btn w" style="margin-top:10px" data-act="chat" data-id="${esc(p.sellerId)}">Chat with seller</button></div></aside></div>
${others.length ? `<div class="card sec"><h2>Other sellers for this model (${others.length + 1})</h2><table class="cmp"><tr><th>Seller</th><th>Price</th><th>Seller rating</th><th>Stock</th><th></th></tr>${offers.map((o) => { const s = S.sellers.find((x) => x.id === o.sellerId) || {}; return `<tr ${o.id === p.id ? 'style="background:#fffbe6"' : ''}><td><a href="#/seller/${esc(o.sellerId)}">${esc(o.sellerName)}</a>${o.id === p.id ? ' <span class="muted">(this listing)</span>' : ''}</td><td data-offer="${esc(o.id)}"><b>${money(o.price)}</b></td><td>${stars(s.rating || 4)} ${s.rating || ''}</td><td>${o.stock}</td><td>${o.id === p.id ? '' : `<a class="btn w sm" href="#/product/${encodeURIComponent(o.id)}">View offer</a>`} <button class="btn y sm" data-act="add" data-id="${esc(o.id)}">Add to cart</button></td></tr>`; }).join('')}</table></div>` : ''}
<div class="card sec" id="reviews"><h2>Customer reviews</h2>${p.reviews ? `<div style="font-size:17px">${stars(p.rating)} <b>${p.rating} out of 5</b> <span class="muted">(${p.reviews.toLocaleString()} global ratings)</span></div>` : '<p class="muted">Be the first to review this new listing.</p>'}
${p.reviews ? revs.map((r) => `<div class="rev"><div class="who"><span class="av">${esc(r.name[0])}</span>${esc(r.name)}</div><div>${stars(r.r)} <b>${esc(r.title)}</b></div><div class="muted" style="font-size:12px">Reviewed on ${esc(r.date)} &middot; <b style="color:#c45500">Verified Purchase</b></div><p style="margin:4px 0 0">${esc(r.text)}</p></div>`).join('') : ''}</div>`;
}
function ppPrice(p) {
  const off = pctOff(p);
  return `<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">${off >= 1 ? `<span style="color:#cc1c39;font-size:26px">-${off}%</span>` : ''}${pblock(p, true).replace('class="pblock', 'class="pblock pp-live')}</div>${p.listPrice > p.price ? `<div class="muted" style="font-size:13px">List Price: <s>${money(p.listPrice)}</s> &middot; <span class="save">You save ${money(p.listPrice - p.price)}</span></div>` : ''}${p.flash ? '<div style="margin-top:6px"><span class="tag deal" style="position:static;display:inline-block">Limited time deal</span></div>' : ''}`;
}
function sellerStars(sid) { const s = S.sellers.find((x) => x.id === sid); return s ? `<a href="#/seller/${esc(sid)}">${stars(s.rating)}</a> <span class="muted">${s.rating} seller rating</span>` : ''; }

function renderCart() {
  const c = S.cart;
  if (!location.hash.startsWith('#/cart')) return;
  const n = c.items.reduce((a, i) => a + i.qty, 0);
  app().innerHTML = `<div class="cartwrap"><div class="card"><h1 style="font-size:28px;font-weight:500;margin-bottom:4px">Shopping Cart</h1><div class="muted" style="border-bottom:1px solid #e7e7e7;padding-bottom:8px;text-align:right">Price</div>
${c.items.length ? c.items.map((i) => { const p = i.product; return `<div class="crow"><a href="#/product/${encodeURIComponent(p.id)}"><img src="${esc(p.image)}" alt=""></a><div><a class="tt" href="#/product/${encodeURIComponent(p.id)}">${esc(p.title)}</a><div style="color:#007600;font-size:12px;margin-top:3px">${p.stock <= 5 ? 'Only ' + p.stock + ' left in stock' : 'In Stock'}</div><div class="muted" style="font-size:12px;margin-top:3px">Sold by <a href="#/seller/${esc(p.sellerId)}">${esc(p.sellerName)}</a></div>
<div class="qty"><button data-act="dec" data-id="${esc(p.id)}" aria-label="Decrease">${i.qty > 1 ? '&minus;' : '&#128465;'}</button><span>${i.qty}</span><button data-act="inc" data-id="${esc(p.id)}" aria-label="Increase">+</button></div> <button class="linkbtn" data-act="rm" data-id="${esc(p.id)}">Delete</button><button class="linkbtn" data-act="wish" data-id="${esc(p.id)}">${S.wish.has(p.id) ? 'Remove from wishlist' : 'Save to wishlist'}</button></div>
<div style="text-align:right">${pblock(p)}</div></div>`; }).join('') : `<div style="padding:30px 0"><h2>Your SafeShop Cart is empty</h2><p><a href="#/deals">Shop today's deals</a></p></div>`}
<div class="sub" style="text-align:right;padding-top:10px">Subtotal (${n} item${n === 1 ? '' : 's'}): <b id="cartTotal">${money(c.total)}</b></div></div>
<div class="card"><div class="sub">Subtotal (${n} item${n === 1 ? '' : 's'}): <b>${money(c.total)}</b></div><div style="color:#007600;font-size:13px;margin:6px 0 10px">Your order qualifies for FREE delivery.</div><button class="btn y" id="checkoutBtn" ${c.items.length ? '' : 'disabled'}>Proceed to checkout</button><p class="muted" style="font-size:12px">Demo store: payments use a test card, no real money moves.</p></div></div>`;
  const btn = $('#checkoutBtn');
  if (btn) btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Placing your order...';
    try { const o = await api('/api/checkout', { method: 'POST', body: {} }); setCart({ items: [], total: 0 }); location.hash = '#/order/' + o.orderId; }
    catch (e) { toast(esc(e.message), 'red'); btn.disabled = false; btn.textContent = 'Proceed to checkout'; }
  };
}
async function refreshCartThenRender() { setCart(await api('/api/cart')); renderCart(); }

async function wishlistPage() {
  const w = await api('/api/wishlist'); S.wish = new Set(w.items.map((p) => p.id)); w.items.forEach((p) => S.products.set(p.id, p)); updateCounts();
  app().innerHTML = `<div class="crumbs">Your Wishlist</div><div class="card"><h2>Your Wishlist (${w.items.length})</h2>${w.items.length ? grid(w.items) : '<p class="muted">Nothing saved yet. Tap the heart on any product.</p>'}</div>`;
}
async function ordersPage() {
  const os = await api('/api/orders');
  app().innerHTML = `<div class="crumbs">Your Account &rsaquo; Orders</div><h1 style="font-size:28px;font-weight:500;margin:6px 0 14px">Your Orders</h1>${os.length ? os.map(orderHtml).join('') : '<div class="empty"><h2>No orders yet</h2><a href="#/">Start shopping</a></div>'}`;
}
function orderHtml(o) {
  return `<div class="ord"><div class="ord-h"><div>ORDER PLACED<b>${new Date(o.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</b></div><div>TOTAL<b>${money(o.total)}</b></div><div>SHIP TO<b>Maya Chen</b></div><div style="margin-left:auto;text-align:right">ORDER # ${esc(o.orderId)}<b style="font-size:11px">Payment ${esc(o.paymentRef)}</b></div></div>
${o.items.map((i) => `<div class="ord-i"><a href="#/product/${encodeURIComponent(i.productId)}"><img src="${esc(i.image)}" alt=""></a><div class="t"><a href="#/product/${encodeURIComponent(i.productId)}"><b>${esc(i.title)}</b></a><div class="muted" style="font-size:12.5px">Sold by ${esc(i.sellerName)} &middot; Qty ${i.qty} &middot; ${money(i.price)} each</div><div style="color:#007600;font-size:13px;margin-top:3px">Delivered soon</div></div><div style="width:190px"><a class="btn w" href="#/product/${encodeURIComponent(i.productId)}">View your item</a><button class="btn y" style="margin-top:6px" data-act="add" data-id="${esc(i.productId)}">Buy it again</button></div></div>`).join('')}</div>`;
}
async function orderPage(id) {
  const os = await api('/api/orders'); const o = os.find((x) => x.orderId === id);
  if (!o) { app().innerHTML = '<div class="empty"><h2>Order not found</h2><a href="#/orders">Your orders</a></div>'; return; }
  const sim = o.paymentMode !== 'stripe_test';
  app().innerHTML = `<div class="okbox"><h1>&#10003; Order placed, thank you!</h1><p>Confirmation sent to maya@example.com. Order <b>${esc(o.orderId)}</b> &middot; Total <b>${money(o.total)}</b></p>
<span class="paynote ${sim ? 'sim' : ''}">${sim ? 'Simulated payment' : 'Stripe TEST payment (pm_card_visa)'} &middot; ref ${esc(o.paymentRef)}</span></div><div style="margin-top:16px">${orderHtml(o)}</div><p><a class="btn y sm" href="#/">Continue shopping</a> <a class="btn w sm" href="#/orders">View all orders</a></p>`;
}
async function sellerPage(id) {
  const s = await api('/api/sellers/' + encodeURIComponent(id)).catch(() => null);
  if (!s) { app().innerHTML = '<div class="empty"><h2>Seller not found</h2></div>'; return; }
  s.products.forEach((p) => S.products.set(p.id, p));
  app().innerHTML = `<div class="shead"><div class="logo-c">${esc(s.name[0])}</div><div><h1 style="font-size:26px">${esc(s.name)}</h1><div>${stars(s.rating)} <b>${s.rating}</b> seller rating &middot; On SafeShop since ${new Date(s.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div><div style="color:#ddd;margin-top:4px">${esc(s.about || '')}</div></div><button class="btn y" data-act="chat" data-id="${esc(s.id)}">Chat with seller</button></div>
<div class="card sec"><h2>Products from ${esc(s.name)} (${s.products.length})</h2>${grid(s.products)}</div>`;
}
async function chatPage(sid) {
  const s = S.sellers.find((x) => x.id === sid) || await api('/api/sellers/' + sid).catch(() => null);
  if (!s) { app().innerHTML = '<div class="empty"><h2>Seller not found</h2></div>'; return; }
  app().innerHTML = `<div class="chat"><div class="chat-h"><div class="av" style="background:#ff9900;color:#131921;width:38px;height:38px">${esc(s.name[0])}</div><div><b>${esc(s.name)}</b><div style="font-size:12px;color:#ddd">${stars(s.rating)} &middot <a href="#/seller/${esc(s.id)}">Visit store</a></div></div></div><div class="msgs" id="msgs"></div><form id="chatForm"><input id="chatIn" placeholder="Ask about shipping, stock or price..." autocomplete="off"><button class="btn y">Send</button></form></div>`;
  let waiting = false, lastCount = -1;
  const draw = (msgs) => {
    const box = $('#msgs'); if (!box) return;
    if (msgs.length === lastCount && !waiting) return; lastCount = msgs.length;
    box.innerHTML = (msgs.length ? '' : `<div class="muted" style="text-align:center;margin:auto">Start a conversation with ${esc(s.name)}</div>`) + msgs.map((m) => `<div class="bub ${m.from}">${esc(m.text)}<small>${new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>`).join('') + (waiting ? '<div class="typing">Seller is typing...</div>' : '');
    box.scrollTop = box.scrollHeight;
  };
  const poll = async () => { try { const r = await api('/api/chats/' + sid); if (waiting && r.messages.length && r.messages[r.messages.length - 1].from === 'seller') waiting = false; draw(r.messages); } catch { /* */ } };
  await poll(); chatTimer = setInterval(poll, 900);
  $('#chatForm').onsubmit = async (e) => {
    e.preventDefault(); const t = $('#chatIn').value.trim(); if (!t) return; $('#chatIn').value = '';
    waiting = true; lastCount = -1;
    track('chat', { sellerId: sid, meta: { text: t } });
    try { const r = await api('/api/chats/' + sid, { method: 'POST', body: { text: t } }); draw(r.messages); } catch (err) { toast(esc(err.message), 'red'); waiting = false; }
  };
  $('#chatIn').focus();
}
function sellPage() {
  const cats = S.depts.flatMap((d) => d.categories);
  app().innerHTML = `<form class="form" id="sellForm"><h1 style="font-size:26px;font-weight:500">Sell on SafeShop</h1><p class="muted">Create a new product listing. It appears in the store immediately. <a href="#" id="sampleLink">Fill a sample listing</a></p>
<label>Seller account</label><select name="sellerId">${S.sellers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>
<label>Product title</label><input name="title" required maxlength="200">
<div class="two"><div><label>Brand</label><input name="brand" required></div><div><label>Model number</label><input name="model" required></div></div>
<div class="two"><div><label>Category</label><select name="category">${cats.map((c) => `<option value="${c}">${esc(catName(c))}</option>`).join('')}</select></div><div><label>Image type</label><select name="image">${IMG_TYPES.map((c) => `<option value="${c}">${esc(catName(c))}</option>`).join('')}</select></div></div>
<div class="two"><div><label>Price (USD)</label><input name="price" type="number" step="0.01" min="0.01" required></div><div><label>List price (optional)</label><input name="listPrice" type="number" step="0.01" min="0"></div></div>
<label>Description</label><textarea name="descr" required></textarea><button class="btn y" style="margin-top:18px" id="sellBtn">List product</button></form>`;
  const f = $('#sellForm');
  $('#sampleLink').onclick = (e) => { e.preventDefault(); const set = (k, v) => { f.elements[k].value = v; }; set('title', 'TinyTots Premium Baby Carrier'); set('brand', 'TinyTots'); set('model', 'TT-BC1'); set('price', '39.99'); set('listPrice', '69.99'); set('category', 'diaper_bags'); set('image', 'bag'); set('descr', 'Ergonomic baby carrier with padded straps. Fits newborns to toddlers.'); };
  f.onsubmit = async (e) => {
    e.preventDefault(); const b = Object.fromEntries(new FormData(f)); b.price = Number(b.price); b.listPrice = b.listPrice ? Number(b.listPrice) : undefined;
    $('#sellBtn').disabled = true;
    try { const p = await api('/api/products', { method: 'POST', body: b }); S.products.set(p.id, p); toast(`<b>Listed!</b><br>${esc(p.title)}`, 'green'); location.hash = '#/product/' + encodeURIComponent(p.id); }
    catch (err) { toast(esc(err.message), 'red'); $('#sellBtn').disabled = false; }
  };
}

// ---------- live prices ----------
function applyPrice(id, oldPrice) {
  const p = S.products.get(id); if (!p) return;
  $$(`.pblock[data-pid="${CSS.escape(id)}"]`).forEach((el) => {
    const big = el.dataset.big === '1';
    el.innerHTML = priceBlock(p, big);
    el.classList.toggle('red', pctOff(p) >= 20);
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth;
    el.classList.add(p.price < oldPrice ? 'flash-down' : 'flash-up');
    setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 1900);
  });
  $$(`[data-offer="${CSS.escape(id)}"]`).forEach((el) => { el.innerHTML = `<b>${money(p.price)}</b>`; });
  if (currentPid === id && location.hash.startsWith('#/product/')) api('/api/products/' + encodeURIComponent(id)).then((d) => { const sb = $('#sparkBox'); if (sb) sb.innerHTML = sparkline(d.priceHistory); const pp = $('#ppPrice'); if (pp) pp.innerHTML = ppPrice({ ...p, ...d }); }).catch(() => {});
}
function startStream() {
  const es = new EventSource('/api/events/stream');
  es.onmessage = (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch { return; }
    if (ev.type === 'price_change') {
      const p = S.products.get(ev.productId); if (!p) return;
      p.price = ev.price;
      if (ev.meta && ev.meta.flash) p.flash = { pct: ev.meta.pct }; else if (ev.meta && ev.meta.flashEnded) delete p.flash;
      applyPrice(ev.productId, ev.oldPrice);
      const inCart = S.cart.items.find((i) => i.productId === ev.productId);
      if (inCart) { inCart.product.price = ev.price; S.cart.total = Math.round(S.cart.items.reduce((a, i) => a + i.product.price * i.qty, 0) * 100) / 100; const t = $('#cartTotal'); if (t) t.textContent = money(S.cart.total); }
      if ((inCart || S.wish.has(ev.productId)) && ev.price < ev.oldPrice) toast(`<b>Price drop</b><br>${esc(p.title)} is now ${money(ev.price)} (was ${money(ev.oldPrice)})`, 'green', 5500);
    } else if (ev.type === 'product_created') {
      api('/api/products/' + encodeURIComponent(ev.productId)).then((p) => S.products.set(p.id, p)).catch(() => {});
    }
  };
}

(async function init() {
  try { await loadAll(); } catch (e) { app().innerHTML = '<div class="empty"><h2>Could not reach the store</h2></div>'; return; }
  buildNav(); startStream(); route();
})();
