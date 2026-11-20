// SafeShop bridge: the agent listens to the shop's live event stream (browser-view/shop, :3300) and acts on what
// Maya does there. add_to_cart -> recall check (recall table + live CPSC + Senso); recalled -> taken out of the cart.
// wishlist_add -> recall check; recalled -> removed, else watched. purchase -> protected as owned; recalled -> refund
// claim filed with the shop. Every action is an audited Run; the dashboard reads GET /shop/activity.
import { checkSafety } from './safety.ts';
import { state } from './state.ts';
import { Recorder } from './trail.ts';

const SHOP = (process.env.SHOP_URL ?? 'http://localhost:3300').replace(/\/$/, '');
export type ShopAction = 'checking' | 'safe' | 'watching' | 'protected' | 'removed_from_cart' | 'removed_from_wishlist' | 'claim_filed' | 'unverified';
export interface ShopActivity {
  id: string; at: string; type: string; productId: string; title: string; brand?: string; model?: string; price?: number; image?: string; seller?: string;
  verdict: 'checking' | 'clear' | 'recalled' | 'unknown'; action: ShopAction; note: string;
  recallId?: string; recallTitle?: string; hazard?: string; url?: string; claimRef?: string; sources?: string[]; runId?: string;
}
export const shopActivity: ShopActivity[] = [];
let connected = false; let lastEventAt = 0;
export const shopStatus = () => ({ shopUrl: SHOP, connected, lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : null });
export function resetShopActivity() { shopActivity.length = 0; }

const VERB: Record<string, string> = { add_to_cart: 'added to cart', wishlist_add: 'saved to wishlist', purchase: 'bought' };
const call = (path: string, init?: RequestInit) => fetch(`${SHOP}${path}`, { ...init, signal: AbortSignal.timeout(5000) });

async function handle(ev: any) {
  if (!VERB[ev.type] || !ev.productId) return;
  const r = await call(`/api/products/${encodeURIComponent(ev.productId)}`);
  if (!r.ok) return;
  const p = await r.json();
  const a: ShopActivity = {
    id: `shop_${ev.id ?? Date.now()}`, at: ev.at ?? new Date().toISOString(), type: ev.type, productId: p.id, title: p.title, brand: p.brand, model: p.model,
    price: p.price, image: p.image ? (String(p.image).startsWith('http') ? p.image : `${SHOP}${p.image}`) : undefined, seller: p.sellerName,
    verdict: 'checking', action: 'checking', note: 'Checking U.S. recalls…',
  };
  shopActivity.unshift(a); if (shopActivity.length > 50) shopActivity.length = 50;

  const rec = new Recorder(() => {}, undefined, `Maya ${VERB[ev.type]} ${p.title} on SafeShop`, Number(p.price) || 0, ['never buy or keep a recalled product']);
  a.runId = rec.run.id;
  rec.step('retrieve', `SafeShop: Maya ${VERB[ev.type]} ${p.title} · $${Number(p.price).toFixed(2)}`, { tool: 'safeshop.events', detail: `${p.brand} ${p.model} · sold by ${p.sellerName ?? p.sellerId}` });
  const s = await checkSafety({ key: p.id, brand: p.brand ?? '', model: p.model ?? '', title: p.title, category: p.category }, rec);
  a.sources = s.check.sources.map((x) => x.label);

  if (s.check.status === 'recalled') {
    Object.assign(a, { verdict: 'recalled', recallId: s.check.recallId ?? s.recall?.recallId, recallTitle: s.recall?.title, hazard: s.recall?.hazard, url: s.recall?.url });
    if (ev.type === 'add_to_cart') {
      await call(`/api/cart?productId=${encodeURIComponent(p.id)}`, { method: 'DELETE' }).catch(() => null);
      rec.step('act', `Removed ${p.title} from Maya's SafeShop cart (CPSC ${a.recallId})`, { tool: 'safeshop.cart', status: 'blocked', flags: ['recall_blocked'] as any });
      Object.assign(a, { action: 'removed_from_cart', note: `Recalled · CPSC ${a.recallId} · taken out of the cart` });
    } else if (ev.type === 'wishlist_add') {
      await call(`/api/wishlist?productId=${encodeURIComponent(p.id)}`, { method: 'DELETE' }).catch(() => null);
      rec.step('act', `Removed ${p.title} from Maya's SafeShop wishlist (CPSC ${a.recallId})`, { tool: 'safeshop.wishlist', status: 'blocked' });
      Object.assign(a, { action: 'removed_from_wishlist', note: `Recalled · CPSC ${a.recallId} · won't be bought` });
    } else {
      const c = await call('/api/claims', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: p.id, orderId: ev.orderId, recallId: a.recallId, kind: 'refund', message: `Refund requested on behalf of Maya Chen: ${p.title} is under CPSC recall ${a.recallId}.` }) }).then((x) => x.json()).catch(() => null);
      a.claimRef = c?.claimRef;
      rec.step('act', `Filed refund claim ${a.claimRef ?? '(store offline)'} with SafeShop for ${p.title}`, { tool: 'safeshop.claims', status: 'warn' });
      Object.assign(a, { action: 'claim_filed', note: `Recalled · CPSC ${a.recallId} · refund requested${a.claimRef ? ` (${a.claimRef})` : ''}` });
    }
    rec.finish('blocked');
  } else if (s.check.status === 'clear') {
    a.verdict = 'clear';
    const map = { add_to_cart: ['safe', `No recalls across ${a.sources.length} sources · safe to buy`], wishlist_add: ['watching', 'No recalls · watching the price'], purchase: ['protected', "Added to Maya's protected items · re-checked when recalls publish"] } as const;
    const [action, note] = map[ev.type as keyof typeof map];
    rec.step('decide', note, { status: 'ok' });
    Object.assign(a, { action, note });
    rec.finish('done');
  } else {
    Object.assign(a, { verdict: 'unknown', action: 'unverified', note: "Couldn't verify recalls right now · SafeCart won't buy it automatically" });
    rec.step('policy', 'Safety unknown: every source failed · never auto-buy on unknown', { status: 'warn' });
    rec.finish('done');
  }
}

/** Connect to the shop's SSE stream and keep reconnecting; safe to call once at boot. */
export async function startShopWatch() {
  for (;;) {
    try {
      const r = await fetch(`${SHOP}/api/events/stream`);
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      if (!connected) console.log(`[safecart] SafeShop events: connected (${SHOP})`);
      connected = true;
      const dec = new TextDecoder(); let buf = '';
      for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const data = buf.slice(0, i).split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          buf = buf.slice(i + 2);
          if (!data) continue;
          try { const ev = JSON.parse(data); lastEventAt = Date.now(); handle(ev).catch((e) => console.warn('[safecart] shopwatch:', e.message)); } catch { /* not JSON */ }
        }
      }
    } catch { /* shop offline: retry */ }
    connected = false;
    await new Promise((res) => setTimeout(res, 3000));
  }
}
export const shopRun = (id?: string) => (id ? state.runs.get(id) : undefined);
