'use strict';
// SafeShop: Amazon-style demo store. Node http, zero dependencies, no build step.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const art = require('./lib/art');

const ROOT = path.resolve(__dirname, '..', '..');
for (const f of [path.join(ROOT, '.env')]) {
  try { if (fs.existsSync(f)) process.loadEnvFile(f); } catch { /* ignore */ }
}
const PORT = Number(process.env.PORT) || 3300;
const DATA = path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const STATE_FILE = path.join(DATA, 'state.json');
const USER = 'maya';

// ---------- taxonomy ----------
const DEPARTMENTS = [
  { id: 'baby', name: 'Baby', categories: ['stroller', 'high_chair', 'car_seat', 'baby_monitor', 'bassinet', 'bottle_warmer', 'white_noise_machine', 'diapers', 'wipes', 'bottles', 'feeding', 'pacifiers', 'swaddles', 'diaper_bags', 'health', 'bath', 'play', 'car_accessories', 'bedding'] },
  { id: 'electronics', name: 'Electronics', categories: ['headphones', 'chargers', 'power_bank', 'speakers', 'smart_plugs'] },
  { id: 'home', name: 'Home & Kitchen', categories: ['blender', 'air_fryer', 'kettle', 'vacuum', 'space_heater'] },
  { id: 'toys', name: 'Toys', categories: ['toys'] },
];
const deptOf = (cat) => (DEPARTMENTS.find((d) => d.categories.includes(cat)) || { id: 'other' }).id;
const imgForCategory = { stroller: 'stroller', high_chair: 'high_chair', car_seat: 'car_seat', baby_monitor: 'monitor', bassinet: 'bassinet', bottle_warmer: 'bottle_warmer', white_noise_machine: 'white_noise', diapers: 'diapers', wipes: 'wipes', bottles: 'bottles', feeding: 'bib', pacifiers: 'pacifier', swaddles: 'swaddle', diaper_bags: 'bag', health: 'thermometer', bath: 'bath', play: 'playmat', car_accessories: 'shade', bedding: 'crib_sheets', headphones: 'headphones', chargers: 'charger', power_bank: 'powerbank', speakers: 'speaker', smart_plugs: 'smart_plug', blender: 'blender', air_fryer: 'air_fryer', kettle: 'kettle', vacuum: 'vacuum', space_heater: 'heater', toys: 'toy' };

// ---------- state ----------
const round2 = (n) => Math.round(n * 100) / 100;
const rnd = (a, b) => a + Math.random() * (b - a);
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

let sellers = [];
let products = new Map();
let cart = []; // {productId, qty}
let wishlist = []; // productIds
let orders = [];
let chats = {}; // sellerId -> messages
let claims = [];
let compatOrders = [];
let events = [];
let nextEventId = 1;

function seedHistory(p) {
  const pts = [];
  const now = Date.now();
  const n = 24;
  for (let i = n; i >= 1; i--) {
    const h = hash(p.id + ':' + i);
    const wiggle = 0.9 + ((h % 1000) / 1000) * 0.17; // 0.90..1.07 around list
    const price = round2(Math.min(p.listPrice * 1.02, Math.max(p.listPrice * 0.8, p.listPrice * wiggle)));
    pts.push({ at: new Date(now - i * 14 * 3600 * 1000).toISOString(), price });
  }
  pts.push({ at: new Date(now).toISOString(), price: p.price });
  return pts;
}

function loadSeed() {
  sellers = JSON.parse(fs.readFileSync(path.join(DATA, 'sellers.json'), 'utf8'));
  const cat = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8'));
  products = new Map();
  for (const c of cat) {
    const p = { ...c, price: round2(c.price), listPrice: round2(c.listPrice || c.price), isNew: false, created: false };
    p.history = seedHistory(p);
    products.set(p.id, p);
  }
  cart = []; wishlist = []; orders = []; chats = {}; claims = []; compatOrders = [];
}

function loadState() {
  loadSeed();
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    for (const p of s.created || []) products.set(p.id, p);
    for (const [id, price] of Object.entries(s.prices || {})) { const p = products.get(id); if (p) { p.price = price; p.history.push({ at: new Date().toISOString(), price }); } }
    cart = (s.cart || []).filter((c) => products.has(c.productId));
    wishlist = (s.wishlist || []).filter((id) => products.has(id));
    orders = s.orders || []; chats = s.chats || {}; claims = s.claims || [];
    events = s.events || []; nextEventId = s.nextEventId || (events.length ? events[events.length - 1].id + 1 : 1);
    console.log('[shop] restored state.json');
  } catch { /* no state yet */ }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const prices = {};
    for (const p of products.values()) if (!p.created) prices[p.id] = p.price;
    const s = { created: [...products.values()].filter((p) => p.created), prices, cart, wishlist, orders, chats, claims, events: events.slice(-500), nextEventId };
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(s), (e) => { if (!e) fs.rename(tmp, STATE_FILE, () => {}); });
  }, 400);
}

// ---------- views ----------
const sellerById = (id) => sellers.find((s) => s.id === id);
function pub(p) {
  const s = sellerById(p.sellerId);
  const out = {
    id: p.id, sku: p.id, title: p.title, brand: p.brand, model: p.model, category: p.category, department: deptOf(p.category),
    price: p.price, listPrice: p.listPrice, rating: p.rating, reviews: p.reviews,
    image: p.image || `/img/${p.imageType}.svg?c=${(p.color || '#4f7cac').replace('#', '')}`,
    sellerId: p.sellerId, sellerName: s ? s.name : p.sellerId, stock: p.stock, descr: p.descr, createdAt: p.createdAt,
  };
  if (p.upc) out.upc = p.upc;
  if (p.isNew) out.isNew = true;
  if (p.flash) out.flash = { pct: p.flash.pct, endsAt: new Date(p.flash.until).toISOString() };
  return out;
}
const cartView = () => {
  const items = cart.map((c) => ({ productId: c.productId, qty: c.qty, product: pub(products.get(c.productId)) }));
  return { items, total: round2(items.reduce((a, i) => a + i.product.price * i.qty, 0)) };
};
const wishView = () => ({ items: wishlist.map((id) => pub(products.get(id))) });
const normModel = (p) => `${p.brand}|${p.model}`.toLowerCase();

// ---------- events / SSE ----------
const sse = new Set();
function emit(ev) {
  const e = { id: nextEventId++, at: new Date().toISOString(), user: USER, ...ev };
  events.push(e);
  if (events.length > 2000) events = events.slice(-1500);
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of sse) { try { res.write(line); } catch { sse.delete(res); } }
  save();
  return e;
}
setInterval(() => { for (const res of sse) { try { res.write(': ping\n\n'); } catch { sse.delete(res); } } }, 15000).unref();

// ---------- price ticker ----------
function setPrice(p, price, extra) {
  price = round2(price);
  if (price === p.price) return false;
  const old = p.price;
  p.price = price;
  p.history.push({ at: new Date().toISOString(), price });
  if (p.history.length > 150) p.history.shift();
  emit({ type: 'price_change', productId: p.id, sellerId: p.sellerId, oldPrice: old, price, ...(extra ? { meta: extra } : {}) });
  return true;
}
function tick() {
  const all = [...products.values()].filter((p) => !p.flash);
  const n = 3 + Math.floor(Math.random() * 4);
  const changed = [];
  for (let i = 0; i < n && all.length; i++) {
    const p = all.splice(Math.floor(Math.random() * all.length), 1)[0];
    const f = 1 + rnd(-0.12, 0.08);
    const np = Math.min(p.listPrice * 1.15, Math.max(p.listPrice * 0.55, p.price * f));
    if (setPrice(p, np)) changed.push(p.id);
  }
  return changed;
}
function startFlash(p, pct) {
  if (p.flash) endFlash(p);
  pct = Math.max(1, Math.min(80, pct));
  const prev = p.price;
  p.flash = { pct, prev, until: Date.now() + 180000 };
  setPrice(p, Math.max(p.listPrice * 0.4, p.price * (1 - pct / 100)), { flash: true, pct });
  return p;
}
function endFlash(p) {
  if (!p.flash) return;
  const prev = p.flash.prev; p.flash = null;
  setPrice(p, prev, { flashEnded: true });
}
setInterval(tick, 15000).unref();
setInterval(() => {
  const c = [...products.values()].filter((p) => !p.flash && p.stock > 0);
  if (c.length) startFlash(c[Math.floor(Math.random() * c.length)], Math.round(rnd(20, 35)));
}, 120000).unref();
setInterval(() => { for (const p of products.values()) if (p.flash && p.flash.until <= Date.now()) endFlash(p); }, 5000).unref();

// ---------- payments ----------
async function pay(totalDollars, orderId) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (key.startsWith('sk_test_')) {
    try {
      const body = new URLSearchParams({
        amount: String(Math.round(totalDollars * 100)), currency: 'usd', confirm: 'true', payment_method: 'pm_card_visa',
        'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never',
        description: `SafeShop demo order ${orderId}`,
      });
      const r = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST', body, signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': 'safeshop-' + orderId },
      });
      const j = await r.json();
      if (r.ok && j.id) return { paymentRef: j.id, paymentMode: 'stripe_test', status: j.status };
      console.warn('[shop] stripe test payment failed:', j.error && j.error.message);
    } catch (e) { console.warn('[shop] stripe unreachable:', e.message); }
  }
  return { paymentRef: 'pay-SIM_' + crypto.randomBytes(5).toString('hex').toUpperCase(), paymentMode: 'simulated' };
}

// ---------- seller chat ----------
function sellerReply(seller, text) {
  const t = text.toLowerCase();
  const name = seller.name;
  if (/ship|deliver|arrive|when|tracking|how long/.test(t)) return pick([`Hi Maya! Orders placed before 2pm ship the same day from our warehouse. Standard delivery is 2-4 business days, and you'll get tracking by email.`, `Thanks for asking! We ship within 24 hours, and most orders arrive in 3 days. Expedited 1-2 day shipping is available at checkout.`]);
  if (/stock|available|inventory|have any|left/.test(t)) return pick([`Yes, we have it in stock right now and can ship today. Stock does move quickly though, so I would not wait too long.`, `We have a few units left in our warehouse. I'd order soon if you want it this week.`]);
  if (/price|discount|cheaper|deal|coupon|offer|lower|best/.test(t)) return pick([`Our prices change through the day with the marketplace. I can't go lower than the listed price, but watch for flash sales on the Deals page!`, `Thanks for asking about price. The listed price is already our best, and I can't offer extra coupons, but prices update live so it may drop soon.`]);
  if (/return|refund|warranty|exchange|broken|damag/.test(t)) return pick([`We offer 30-day returns on unused items, and manufacturer warranty applies. Just message us your order number and we'll send a prepaid label.`, `Returns are easy: within 30 days, original packaging, full refund once we receive it.`]);
  if (/recall|safe|safety|cpsc|standard|certif/.test(t)) return pick([`Thanks for checking. We source from the manufacturer's authorised distributors, but for safety notices please check the CPSC site with the brand and model number, and contact the manufacturer for official guidance.`, `We follow the manufacturer's documentation. For official safety or recall information, please check cpsc.gov using the model number on the product label.`]);
  if (/color|colour|size|dimension|fit|compatible|work with|spec/.test(t)) return pick([`The listing shows the specs we have. Colors and sizes may vary slightly by batch; if you tell me what you need I'll check with our warehouse team.`, `Good question! It's described in the listing, and I can check the exact spec with the manufacturer if you need a specific detail.`]);
  if (/hi|hello|hey|hola/.test(t)) return `Hi Maya, thanks for reaching out to ${name}! How can I help with your order today?`;
  return pick([`Thanks for your message! A team member from ${name} will follow up shortly, and meanwhile I'm happy to help with shipping, stock or returns.`, `Thanks for contacting ${name}. Could you tell me which product you're asking about? I can check availability and shipping right away.`]);
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function search(q) {
  const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (p) => {
    if (!toks.length) return true;
    const hay = `${p.title} ${p.brand} ${p.model} ${p.category.replace(/_/g, ' ')} ${deptOf(p.category)} ${p.descr}`.toLowerCase();
    return toks.every((t) => hay.includes(t) || hay.includes(t.replace(/s$/, '')));
  };
}
function listProducts(u) {
  const sp = u.searchParams;
  let list = [...products.values()].filter(search(sp.get('q')));
  const cat = sp.get('category');
  if (cat && cat !== 'all') list = list.filter((p) => p.category === cat || deptOf(p.category) === cat);
  if (sp.get('sellerId')) list = list.filter((p) => p.sellerId === sp.get('sellerId'));
  if (sp.get('minPrice')) list = list.filter((p) => p.price >= Number(sp.get('minPrice')));
  if (sp.get('maxPrice')) list = list.filter((p) => p.price <= Number(sp.get('maxPrice')));
  if (sp.get('minRating')) list = list.filter((p) => p.rating >= Number(sp.get('minRating')));
  const sort = sp.get('sort');
  if (sort === 'price') list.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  else if (sort === 'new') list.sort((a, b) => (b.created - a.created) || String(b.createdAt).localeCompare(a.createdAt));
  return list.map(pub);
}
function cleanText(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }

function doCheckout(items) {
  const orderId = 'SS-' + String(Math.floor(10000000 + Math.random() * 89999999));
  return { orderId, items };
}

// ---------- routing ----------
async function api(req, res, u) {
  const m = req.method;
  const p = u.pathname;
  let mt;

  if (p === '/api/health' && m === 'GET') return send(res, 200, { ok: true, products: products.size, sellers: sellers.length });
  if (p === '/api/categories' && m === 'GET') return send(res, 200, DEPARTMENTS);

  if (p === '/api/products') {
    if (m === 'GET') return send(res, 200, listProducts(u));
    if (m === 'POST') {
      const b = await readBody(req);
      const s = sellerById(b.sellerId);
      const price = Number(b.price);
      if (!s) return send(res, 400, { error: 'unknown sellerId' });
      if (!cleanText(b.title, 200) || !(price > 0)) return send(res, 400, { error: 'title and positive price required' });
      const category = cleanText(b.category || 'toys', 60).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'toys';
      const id = 'NEW-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      let image = cleanText(b.image, 200), imageType = imgForCategory[category] || 'toy';
      if (image && art.types.includes(image)) { imageType = image; image = ''; }
      else if (image && !image.startsWith('/img/')) image = '';
      const np = {
        id, title: cleanText(b.title, 200), brand: cleanText(b.brand, 80) || 'Generic', model: cleanText(b.model, 80) || id, category,
        price: round2(price), listPrice: round2(Number(b.listPrice) > 0 ? Number(b.listPrice) : price),
        descr: cleanText(b.descr, 2000), sellerId: s.id, imageType, image: image || undefined, color: ['#4f7cac', '#e07a5f', '#81b29a', '#8d6b94', '#f2a65a', '#5b8c85'][Math.floor(Math.random() * 6)],
        rating: 0, reviews: 0, stock: Number(b.stock) > 0 ? Math.floor(Number(b.stock)) : 25, createdAt: new Date().toISOString(), isNew: true, created: true,
      };
      if (b.upc) np.upc = cleanText(b.upc, 20);
      np.history = [{ at: np.createdAt, price: np.price }];
      products.set(id, np);
      emit({ type: 'product_created', productId: id, sellerId: s.id, price: np.price });
      return send(res, 201, pub(np));
    }
  }
  if ((mt = p.match(/^\/api\/products\/([^/]+)$/)) && m === 'GET') {
    const pr = products.get(decodeURIComponent(mt[1]));
    if (!pr) return send(res, 404, { error: 'not found' });
    const out = pub(pr);
    out.priceHistory = pr.history.slice(-60);
    out.sellers = [...products.values()].filter((o) => o.id !== pr.id && normModel(o) === normModel(pr)).map(pub);
    out.listingText = `${pr.title}\nBrand: ${pr.brand} | Model: ${pr.model}\nCategory: ${pr.category}\n${pr.descr}`;
    return send(res, 200, out);
  }

  if (p === '/api/sellers' && m === 'GET') return send(res, 200, sellers.map((s) => ({ ...s, productCount: [...products.values()].filter((x) => x.sellerId === s.id).length })));
  if ((mt = p.match(/^\/api\/sellers\/([^/]+)$/)) && m === 'GET') {
    const s = sellerById(decodeURIComponent(mt[1]));
    if (!s) return send(res, 404, { error: 'not found' });
    return send(res, 200, { ...s, products: [...products.values()].filter((x) => x.sellerId === s.id).map(pub) });
  }

  if (p === '/api/cart') {
    if (m === 'GET') return send(res, 200, cartView());
    if (m === 'POST') {
      const b = await readBody(req);
      const pr = products.get(b.productId);
      if (!pr) return send(res, 404, { error: 'unknown product' });
      if (pr.stock < 1) return send(res, 400, { error: 'out of stock' });
      const q = Math.trunc(Number(b.qty) || 1);
      const ex = cart.find((c) => c.productId === pr.id);
      if (b.set) { if (ex) ex.qty = q; else cart.push({ productId: pr.id, qty: q }); }
      else if (ex) ex.qty += q; else cart.push({ productId: pr.id, qty: q });
      cart = cart.filter((c) => c.qty > 0).map((c) => ({ ...c, qty: Math.min(c.qty, Math.max(1, products.get(c.productId).stock), 10) }));
      save();
      return send(res, 200, cartView());
    }
    if (m === 'DELETE') { cart = cart.filter((c) => c.productId !== u.searchParams.get('productId')); save(); return send(res, 200, cartView()); }
  }
  if (p === '/api/wishlist') {
    if (m === 'GET') return send(res, 200, wishView());
    if (m === 'POST') {
      const b = await readBody(req);
      if (!products.has(b.productId)) return send(res, 404, { error: 'unknown product' });
      if (!wishlist.includes(b.productId)) wishlist.push(b.productId);
      save();
      return send(res, 200, wishView());
    }
    if (m === 'DELETE') { wishlist = wishlist.filter((id) => id !== u.searchParams.get('productId')); save(); return send(res, 200, wishView()); }
  }

  if (p === '/api/checkout' && m === 'POST') {
    if (!cart.length) return send(res, 400, { error: 'cart is empty' });
    for (const c of cart) { const pr = products.get(c.productId); if (pr.stock < c.qty) return send(res, 409, { error: `only ${pr.stock} left of ${pr.title}` }); }
    const { orderId } = doCheckout();
    const items = cart.map((c) => { const pr = products.get(c.productId); const v = pub(pr); return { productId: pr.id, title: pr.title, price: pr.price, qty: c.qty, image: v.image, sellerName: v.sellerName, sellerId: pr.sellerId }; });
    const total = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    const pay_ = await pay(total, orderId);
    for (const c of cart) products.get(c.productId).stock -= c.qty;
    const order = { orderId, at: new Date().toISOString(), items, total, paymentRef: pay_.paymentRef, paymentMode: pay_.paymentMode };
    orders.unshift(order);
    cart = [];
    for (const i of items) emit({ type: 'purchase', productId: i.productId, sellerId: i.sellerId, price: i.price, qty: i.qty, orderId });
    save();
    return send(res, 200, { orderId, items, total, paymentRef: order.paymentRef, paymentMode: order.paymentMode });
  }
  if (p === '/api/orders') {
    if (m === 'GET') return send(res, 200, orders);
    if (m === 'POST') { // compat with cc's merchant sandbox: {sku, qty, paymentRef} -> {orderRef}
      const b = await readBody(req);
      const orderRef = 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      compatOrders.unshift({ orderRef, sku: b.sku || 'unknown', qty: Number(b.qty || 1), paymentRef: b.paymentRef || null, at: new Date().toISOString() });
      return send(res, 200, { orderRef });
    }
  }
  if (p === '/api/claims' && m === 'POST') {
    const b = await readBody(req);
    const claimRef = 'CLM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    claims.unshift({ claimRef, ...b, at: new Date().toISOString() });
    save();
    return send(res, 200, { claimRef, status: 'filed' });
  }

  if ((mt = p.match(/^\/api\/chats\/([^/]+)$/))) {
    const s = sellerById(decodeURIComponent(mt[1]));
    if (!s) return send(res, 404, { error: 'unknown seller' });
    chats[s.id] = chats[s.id] || [];
    if (m === 'GET') return send(res, 200, { messages: chats[s.id] });
    if (m === 'POST') {
      const b = await readBody(req);
      const text = cleanText(b.text, 1000);
      if (!text) return send(res, 400, { error: 'text required' });
      chats[s.id].push({ from: 'user', text, at: new Date().toISOString() });
      save();
      setTimeout(() => { chats[s.id].push({ from: 'seller', text: sellerReply(s, text), at: new Date().toISOString() }); save(); }, 1000);
      return send(res, 200, { messages: chats[s.id] });
    }
  }

  if (p === '/api/track' && m === 'POST') {
    const b = await readBody(req);
    const allowed = ['view', 'search', 'add_to_cart', 'remove_from_cart', 'wishlist_add', 'wishlist_remove', 'chat'];
    if (!allowed.includes(b.type)) return send(res, 400, { error: 'bad type' });
    const ev = { type: b.type };
    const pr = b.productId && products.get(b.productId);
    if (pr) { ev.productId = pr.id; ev.price = pr.price; ev.sellerId = pr.sellerId; }
    if (b.sellerId) ev.sellerId = String(b.sellerId);
    if (b.query != null) ev.query = cleanText(b.query, 200);
    if (b.qty != null) ev.qty = Number(b.qty);
    if (b.meta && typeof b.meta === 'object') ev.meta = b.meta;
    emit(ev);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/events' && m === 'GET') {
    const since = Number(u.searchParams.get('since'));
    return send(res, 200, Number.isFinite(since) && u.searchParams.has('since') ? events.filter((e) => e.id > since) : events.slice(-200));
  }
  if (p === '/api/events/stream' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    sse.add(res);
    req.on('close', () => sse.delete(res));
    return;
  }

  if (p === '/api/admin/tick' && m === 'POST') return send(res, 200, { ok: true, changed: tick() });
  if (p === '/api/admin/flash' && m === 'POST') {
    const b = await readBody(req);
    const pr = products.get(b.productId || b.sku);
    if (!pr) return send(res, 404, { error: 'unknown product' });
    startFlash(pr, Number(b.pct) || 25);
    return send(res, 200, { ok: true, product: pub(pr) });
  }
  if (p === '/api/admin/sale' && m === 'POST') { // compat: price = listPrice * (1 - pct/100)
    const b = await readBody(req);
    const pr = products.get(b.sku || b.productId);
    if (!pr) return send(res, 404, { error: 'Product not found', sku: b.sku });
    if (pr.flash) pr.flash = null;
    setPrice(pr, pr.listPrice * (1 - (Number(b.pct) || 0) / 100));
    return send(res, 200, { ok: true, sku: pr.id, price: pr.price, listPrice: pr.listPrice });
  }
  if (p === '/api/admin/reset' && m === 'POST') {
    loadSeed();
    try { fs.unlinkSync(STATE_FILE); } catch { /* none */ }
    save();
    return send(res, 200, { ok: true, message: 'Store reset to seed data', products: products.size });
  }
  return send(res, 404, { error: 'not found' });
}

function serveStatic(req, res, u) {
  let rel = decodeURIComponent(u.pathname);
  if (rel.startsWith('/img/') && rel.endsWith('.svg')) {
    const type = rel.slice(5, -4);
    if (art.types.includes(type)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
      return res.end(art.svg(type, u.searchParams.get('c') || ''));
    }
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    return res.end();
  }
  try {
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    serveStatic(req, res, u);
  } catch (e) {
    console.error('[shop] error', e);
    if (!res.headersSent) send(res, 500, { error: String(e.message || e) });
  }
});

loadState();
server.listen(PORT, () => console.log(`[shop] SafeShop running at http://localhost:${PORT} (${products.size} products, ${sellers.length} sellers, stripe=${(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_') ? 'test' : 'simulated'})`));
