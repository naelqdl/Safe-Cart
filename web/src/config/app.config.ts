// Edit this file to re-skin the app. Theme colors live in src/app/globals.css (--primary).
import type { Guardrails, Mission } from "@/lib/agent/types";

export interface Sponsor {
  name: string;
  url?: string;
  logo?: string; // path under /public, e.g. "/sponsors/acme.svg"
}

export const appConfig = {
  // App name in the header and browser tab
  name: "ShopAgent",
  // One-line pitch under the name and in the page description
  tagline: "Your shopping agent works on its own, and shows a receipt for every decision.",
  // Default currency code for price formatting
  currency: "USD",
  // Seconds between proactive checks while Autopilot is on
  checkIntervalSeconds: 12,
  // What the agent may do without asking
  guardrails: { autoBuyLimit: 50, dailyBudget: 300 } as Guardrails,
  // Starting missions the agent watches (users can add more on the dashboard).
  // Demo triggers: a title containing "fail" makes its check error; "decline" makes its purchase fail.
  missions: [
    { id: "m-charger", title: "USB-C laptop charger", maxPrice: 40, currency: "USD" },
    { id: "m-coffee", title: "Coffee beans, 1 kg", maxPrice: 30, currency: "USD" },
    { id: "m-headphones", title: "Noise-cancelling headphones", maxPrice: 250, currency: "USD" },
  ] as Mission[],
  // "Powered by" strip: add { name, url, logo: "/sponsors/<file>.svg" }; logos go in web/public/sponsors/; empty array hides the strip
  sponsors: [] as Sponsor[],
  // Small print in the footer
  footerNote: "Demo build: mock agent data until a backend is connected. No real purchases are made.",
};
