// Merchant sandbox client (ag's store on :3100, S-J3). UNTRUSTED source. If the store is offline the
// catalog seed stands in and every result carries source:'catalog-fallback' (labelled in the trail).
import { bySku, seed } from '../data.ts';
import { nextId, state } from '../state.ts';

const BASE = () => (process.env.MERCHANT_URL ?? 'http://localhost:3100').replace(/\/$/, '');
export const VENDOR = 'Demo Baby Store (SIMULATED)';

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    method: init?.method ?? 'GET', signal: AbortSignal.timeout(3000),
    headers: { 'content-type': 'application/json' }, body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`merchant ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface Listing { sku: string; title: string; price: number; listPrice: number; listingText: string; source: 'merchant' | 'catalog-fallback' }

export function localPrice(sku: string) {
  const c = bySku(sku);
  return state.prices.get(sku) ?? { price: c?.price ?? 0, listPrice: c?.listPrice ?? c?.price ?? 0 };
}

export async function getListing(sku: string): Promise<Listing> {
  const l = await getListingRaw(sku);
  const planted = state.injections.get(sku);
  return planted ? { ...l, listingText: `${l.listingText}\n${planted}` } : l;
}

async function getListingRaw(sku: string): Promise<Listing> {
  try {
    const p = await call<any>(`/api/products/${encodeURIComponent(sku)}`);
    return { sku, title: p.title, price: Number(p.price), listPrice: Number(p.listPrice ?? p.price), listingText: String(p.listingText ?? p.descr ?? ''), source: 'merchant' };
  } catch {
    const c = bySku(sku);
    const { price, listPrice } = localPrice(sku);
    return { sku, title: c?.title ?? sku, price, listPrice, listingText: `${c?.title ?? ''}\n${c?.descr ?? ''}`, source: 'catalog-fallback' };
  }
}

export async function setSale(sku: string, pct: number) {
  const c = bySku(sku);
  if (c) state.prices.set(sku, { price: Math.round(c.listPrice * (1 - pct / 100) * 100) / 100, listPrice: c.listPrice });
  try { await call('/api/admin/sale', { method: 'POST', body: { sku, pct } }); return 'merchant'; } catch { return 'local'; }
}

export async function resetStore() {
  try { await call('/api/admin/reset', { method: 'POST', body: {} }); return 'merchant'; } catch { return 'local'; }
}

export async function placeOrder(sku: string, paymentRef: string): Promise<{ orderRef: string; simulated: boolean }> {
  try { const r = await call<any>('/api/orders', { method: 'POST', body: { sku, qty: 1, paymentRef } }); return { orderRef: r.orderRef, simulated: false }; }
  catch { return { orderRef: nextId('ORD-SIM'), simulated: true }; }
}

export async function fileClaim(ownedItemId: string, recallId: string, orderRef?: string): Promise<{ claimRef: string; simulated: boolean }> {
  try { const r = await call<any>('/api/claims', { method: 'POST', body: { ownedItemId, orderRef, recallId, kind: 'refund' } }); return { claimRef: r.claimRef, simulated: false }; }
  catch { return { claimRef: nextId('CLM-SIM'), simulated: true }; }
}

export async function merchantUp(): Promise<boolean> {
  try { await call('/api/products'); return true; } catch { return false; }
}
export const catalogSize = () => seed.catalog.length;
