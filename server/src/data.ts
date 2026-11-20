// Seed data loader (S-J1 files in <repo>/data). Read-only; reloaded on /demo/reset.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA = join(REPO, 'data');

export interface CatalogItem {
  sku: string; title: string; brand: string; model: string; upc?: string; category: string;
  price: number; listPrice: number; descr: string; attrs: Record<string, string>;
}
export interface WishItem { id: string; sku: string; title?: string; targetPrice: number; priority?: number; secondChoiceSku?: string }
export interface OwnedItem {
  id: string; sku?: string; title: string; brand?: string; model: string; upc?: string; category?: string;
  purchasedAt: string; merchant: string; orderRef?: string;
}
export interface Recall {
  recallId: string; recallNumber?: string; title: string; brands: string[]; models: string[]; upcs: string[];
  hazard: string; remedy: string; url: string; publishedAt: string; productName?: string; category?: string;
}
export interface User {
  name: string; city?: string; preferences: string[]; avoidBrands: string[];
  policyDefaults?: { autoBuyLimit?: number; minDiscountPct?: number; dailyBudget?: number };
}

export interface Seed { catalog: CatalogItem[]; wishlist: WishItem[]; owned: OwnedItem[]; recalls: Recall[]; user: User; loaded: boolean; missing: string[] }

function readJson<T>(file: string, fallback: T, missing: string[]): T {
  const p = join(DATA, file);
  if (!existsSync(p)) { missing.push(file); return fallback; }
  const raw = readFileSync(p, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw) as T;
}

/** Turn a raw saferproducts.gov record into our normalized shape (never alters facts). */
export function normalizeRawRecall(r: any): Recall {
  const models = (r.Products ?? []).flatMap((p: any) => String(p.Model ?? '').split(/[,;]/)).map((s: string) => s.trim()).filter(Boolean);
  return {
    recallId: String(r.RecallID), recallNumber: r.RecallNumber, title: r.Title ?? '',
    brands: (r.Manufacturers ?? []).map((m: any) => m.Name).filter(Boolean),
    models, upcs: (r.ProductUPCs ?? []).map((u: any) => u.UPC).filter(Boolean),
    hazard: r.Hazards?.[0]?.Name ?? '', remedy: r.Remedies?.[0]?.Name ?? '', url: r.URL ?? '',
    publishedAt: r.RecallDate ?? '', productName: r.Products?.[0]?.Name,
  };
}

function loadRecalls(missing: string[]): Recall[] {
  const dir = join(DATA, 'recalls');
  if (!existsSync(dir)) { missing.push('recalls/'); return []; }
  const out = new Map<string, Recall>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json'))) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const r: Recall = j.recallId ? { brands: [], models: [], upcs: [], ...j, recallId: String(j.recallId) } : normalizeRawRecall(j);
    out.set(r.recallId, r);
  }
  return [...out.values()];
}

export let seed: Seed = { catalog: [], wishlist: [], owned: [], recalls: [], user: { name: '', preferences: [], avoidBrands: [] }, loaded: false, missing: [] };

export function loadSeed(): Seed {
  const missing: string[] = [];
  const user = readJson<User>('user.json', { name: 'Demo user', preferences: [], avoidBrands: [] }, missing);
  user.preferences = (user.preferences ?? []).map((p: any) => (typeof p === 'string' ? p : p.label));
  user.avoidBrands ??= [];
  const s: Seed = {
    catalog: readJson<CatalogItem[]>('catalog.json', [], missing).map((c) => ({ ...c, attrs: c.attrs ?? {}, descr: c.descr ?? '', price: Number(c.price), listPrice: Number(c.listPrice ?? c.price) })),
    wishlist: readJson<WishItem[]>('wishlist.json', [], missing).map((w, i) => ({ ...w, id: w.id ?? `w${i + 1}` })),
    owned: readJson<OwnedItem[]>('owned.json', [], missing),
    recalls: loadRecalls(missing),
    user, missing, loaded: missing.length === 0,
  };
  seed = s;
  return s;
}

loadSeed();

export const bySku = (sku: string) => seed.catalog.find((c) => c.sku === sku);
