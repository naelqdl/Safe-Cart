// Edit this file to re-skin the app. Theme colors live in src/app/globals.css (--primary).

export interface Sponsor {
  name: string;
  url?: string;
  logo?: string; // path under /public, e.g. "/sponsors/acme.svg"
}

export const appConfig = {
  // App name in the header and browser tab
  name: "ShopAgent",
  // One-line pitch under the name and in the page description
  tagline: "Your shopping agent, with receipts for every decision.",
  // Label above the request box
  requestLabel: "What do you need to buy?",
  // Placeholder text inside the request box
  requestPlaceholder: "e.g. A USB-C charger for my laptop under $40 that ships by Friday",
  // Clickable example requests under the request box
  examplePrompts: ["A USB-C charger under $40", "Running shoes for flat feet, size 10", "A gift for a coffee lover under $50"],
  // Action button label when the agent's decision has no actionLabel
  actionLabel: "Place order",
  // Default currency code for price formatting
  currency: "USD",
  // "Powered by" strip: add { name, url, logo: "/sponsors/<file>.svg" }; logos go in web/public/sponsors/; empty array hides the strip
  sponsors: [] as Sponsor[],
  // Small print in the footer
  footerNote: "Demo build: mock agent data until a backend is connected.",
};
