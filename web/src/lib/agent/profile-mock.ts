// Mock SafeCart profile + demo state for the built-in mock agent (stage fallback when AGENT_BACKEND_URL is unset).
// Recalls here are placeholders labelled "(mock)": real recalls come from CPSC via the backend (ch seeds them). Never present these as real.
import type { Profile, SafetyCheck } from "./types";

export interface MockDemo {
  sale?: { sku: string; pct: number; ticked: boolean }; // ticked: the next tick already checked the sale item
  recall?: { recallId: string; handled: boolean };      // handled: the owned-items sweep already ran
  guardOff?: boolean;                                   // naive agent: recall guard OFF
}
// globalThis so every route bundle in the same server process sees one demo state.
const g = globalThis as { __safecartDemo?: MockDemo };
export const mockDemo = (): MockDemo => (g.__safecartDemo ??= {});
export const resetMockDemo = () => void (g.__safecartDemo = {});

export const MOCK_RECALLS = {
  "MOCK-HIGHCHAIR": {
    recallTitle: "FoldEasy HC-200 high chair recall (mock placeholder)", hazard: "fall hazard: the seat can detach",
    remedy: "Full refund from the retailer", url: "https://www.cpsc.gov/Recalls",
  },
  "MOCK-STROLLER": {
    recallTitle: "AeroLite travel stroller recall (mock placeholder)", hazard: "fingertip amputation hazard at the fold hinge",
    remedy: "Stop using; free repair kit or refund", url: "https://www.cpsc.gov/Recalls",
  },
} as const;
export type MockRecallId = keyof typeof MOCK_RECALLS;

export const STROLLER_SKU = "SKU-STROLLER";
const at = () => new Date().toISOString();
export const mockSafety = (status: SafetyCheck["status"] = "clear", recallId?: string): SafetyCheck => ({
  status, sources: [{ label: "CPSC (mock)", url: "https://www.cpsc.gov/Recalls" }], checkedAt: at(), ...(recallId ? { recallId } : {}),
});

export function mockProfile(): Profile {
  const demo = mockDemo();
  const salePct = demo.sale?.sku === STROLLER_SKU ? demo.sale.pct : 0;
  const strollerPrice = Math.round(199 * (1 - salePct / 100) * 100) / 100;
  return {
    name: "Maya Chen",
    preferences: [
      { label: "Auto-buy up to $150", source: "user" },
      { label: "Avoids Graco", source: "user" },
      { label: "Prefers lightweight", source: "user" },
      { label: "Must fit a narrow car", source: "user" },
    ],
    wishlist: [
      { id: "w1", sku: STROLLER_SKU, title: "AeroLite travel stroller", targetPrice: 180, price: strollerPrice, listPrice: 199, onSale: salePct > 0,
        safety: mockSafety("recalled", "MOCK-STROLLER") },
      { id: "w2", sku: "SKU-MONITOR", title: "Video baby monitor", targetPrice: 120, price: 149, listPrice: 149, onSale: false, safety: mockSafety() },
      { id: "w3", sku: "SKU-NOISE", title: "White-noise machine", targetPrice: 40, price: 59, listPrice: 59, onSale: false, safety: mockSafety() },
      { id: "w4", sku: "SKU-WARMER", title: "Bottle warmer", targetPrice: 35, price: 45, listPrice: 45, onSale: false, safety: mockSafety() },
    ],
    owned: [
      { id: "o1", title: "FoldEasy high chair", model: "HC-200", purchasedAt: "2026-06-14", merchant: "Sandbox Baby Store",
        safety: demo.recall ? mockSafety("recalled", demo.recall.recallId) : mockSafety() },
      { id: "o2", title: "Infant car seat", model: "CS-10", purchasedAt: "2026-05-02", merchant: "Sandbox Baby Store", safety: mockSafety() },
      { id: "o3", title: "Crib mattress", model: "CM-3", purchasedAt: "2026-05-20", merchant: "Sandbox Baby Store", safety: mockSafety() },
      { id: "o4", title: "Baby bouncer", model: "BB-7", purchasedAt: "2026-07-01", merchant: "Sandbox Baby Store", safety: mockSafety() },
      { id: "o5", title: "Diaper pail", model: "DP-1", purchasedAt: "2026-07-09", merchant: "Sandbox Baby Store", safety: mockSafety() },
      { id: "o6", title: "Swaddle set (3)", model: "SW-3", purchasedAt: "2026-08-22", merchant: "Sandbox Baby Store", safety: mockSafety() },
    ],
    policy: { autoBuyLimit: 150, minDiscountPct: 20, autonomy: "auto", recallGuard: !demo.guardOff, source: "default" },
  };
}
