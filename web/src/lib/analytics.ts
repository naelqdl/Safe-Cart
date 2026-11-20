import * as amplitude from "@amplitude/analytics-browser";
import type { AgentEvent } from "@/lib/agent/types";

// Amplitude (sponsor). No-op without NEXT_PUBLIC_AMPLITUDE_API_KEY or outside the browser.
const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
let started = false;

export function track(name: string, props?: Record<string, unknown>) {
  if (!key || typeof window === "undefined") return;
  if (!started) {
    amplitude.init(key, { autocapture: false });
    started = true;
  }
  amplitude.track(name, props);
}

// Recall alerts are upserted (same id re-sent with more detail); count each id+action once.
const seenRecalls = new Set<string>();

/** Agent outcomes → Amplitude. Funnel: sale_detected → safety_check → purchase_auto. No personal data. */
export function trackAgentEvent(e: AgentEvent) {
  switch (e.type) {
    case "step":
      if (e.step.status !== "running" && /on sale/i.test(e.step.title)) track("sale_detected");
      return;
    case "receipt": {
      const safety = e.receipt.safety?.status ?? "none";
      track("safety_check", { status: safety });
      if (e.receipt.auto) track("purchase_auto", { amount: e.receipt.amount, safety });
      return;
    }
    case "approval":
      track("approval_requested", { amount: e.approval.candidate.price });
      return;
    case "recall": {
      const id = e.alert.id + ":" + e.alert.action;
      if (seenRecalls.has(id)) return;
      seenRecalls.add(id);
      track("recall_alert", { itemKind: e.alert.itemKind, action: e.alert.action });
      if (e.alert.action === "purchase_skipped") track("safety_check", { status: "recalled" });
      return;
    }
  }
}
