// Edit this file to re-skin the app. Theme colors live in src/app/globals.css (--primary).
import type { Guardrails, Mission } from "@/lib/agent/types";

export interface Sponsor {
  name: string;
  url?: string;
  logo?: string; // path under /public, e.g. "/sponsors/acme.svg"
}

export const appConfig = {
  // App name in the header and browser tab
  name: "SafeCart",
  // One-line pitch under the name and in the page description
  tagline: "Every shopping agent finds you a deal. Ours checks it's safe first, and keeps protecting what you already own.",
  // Default currency code for price formatting
  currency: "USD",
  // Seconds between proactive checks while Autopilot is on
  checkIntervalSeconds: 12,
  // Seed the Runs panel with the two K-trail demo runs (happy path + injection attack); set false once a backend emits real runs
  showDemoRuns: false,
  // SafeCart demo bar (sale / recall / reset buttons). Ids must match the backend seed (data/**) once AGENT_BACKEND_URL is set.
  showDemoControls: true,
  // Placeholders: set NEXT_PUBLIC_DEMO_SALE_SKU / NEXT_PUBLIC_DEMO_RECALL_ID on the presenter PC to the seeded ids (rebuild after changing).
  demo: { saleSku: process.env.NEXT_PUBLIC_DEMO_SALE_SKU || "SKU-STROLLER", salePct: 30, recallId: process.env.NEXT_PUBLIC_DEMO_RECALL_ID || "MOCK-HIGHCHAIR" },
  // What the agent may do without asking
  guardrails: { autoBuyLimit: 150, dailyBudget: 500 } as Guardrails,
  // Starting missions the agent watches (users can add more on the dashboard).
  // Demo triggers: a title containing "fail" makes its check error; "decline" makes its purchase fail.
  // SafeCart: Maya's wishlist (title + target price). A title containing "stroller" takes the mock's recall branch.
  missions: [
    { id: "m-monitor", title: "Video baby monitor", maxPrice: 120, currency: "USD" },
    { id: "m-noise", title: "White-noise machine", maxPrice: 40, currency: "USD" },
    { id: "m-warmer", title: "Bottle warmer", maxPrice: 35, currency: "USD" },
    { id: "m-stroller", title: "AeroLite travel stroller", maxPrice: 180, currency: "USD" },
  ] as Mission[],
  // "Powered by" strip: add { name, url, logo: "/sponsors/<file>.svg" }; logos go in web/public/sponsors/; empty array hides the strip
  sponsors: [{ name: "SingleStore" }, { name: "Senso" }, { name: "Superlinked" }, { name: "Statsig" }, { name: "Amplitude" }] as Sponsor[],
  // Small print in the footer
  footerNote: "Store and shopper are simulated. Recall data is real (CPSC). Payments are Stripe TEST mode.",
};
