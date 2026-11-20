"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appConfig } from "@/config/app.config";
import { formatPrice } from "@/lib/format";
import type { AutopilotApi, ChatAction, ChatContext, ChatMessage, ChatReply, ChatRequest } from "@/lib/agent/types";

const MAX = 100;
const GREETING = "Hi! I watch your missions and buy within your guardrails. Try “watch AirPods under $150”, “pause”, or “what did you buy?”";

export function useChat(api: AutopilotApi): { messages: ChatMessage[]; sending: boolean; send(text: string): void } {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const apiRef = useRef(api);
  const sendingRef = useRef(false);
  const counter = useRef(0);
  const greeted = useRef(false); // effect can re-run (Strict Mode, hot reload); greet once
  // What was already announced, so nothing repeats.
  const seen = useRef({ receipts: new Set<string>(), approvals: new Set<string>(), error: undefined as string | undefined });

  useEffect(() => {
    apiRef.current = api;
  });

  const push = useCallback((role: ChatMessage["role"], text: string, approvalId?: string) => {
    const msg: ChatMessage = { id: `c${++counter.current}`, role, text, at: new Date().toISOString(), approvalId };
    setMessages((m) => [...m, msg].slice(-MAX));
  }, []);

  // Declared before the announce effect so mount state is marked seen first; only the greeting covers it.
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    const { state } = apiRef.current;
    state.receipts.forEach((r) => seen.current.receipts.add(r.reference));
    state.approvals.forEach((a) => seen.current.approvals.add(a.id));
    seen.current.error = state.error || undefined;
    push("agent", GREETING);
  }, [push]);

  const { receipts, approvals, error } = api.state;
  useEffect(() => {
    const s = seen.current;
    const { autoBuyLimit } = appConfig.guardrails;
    for (const r of receipts) {
      if (s.receipts.has(r.reference)) continue;
      s.receipts.add(r.reference);
      const amount = formatPrice(r.amount, r.currency);
      push("agent", r.auto
        ? `I bought ${r.title} for ${amount} — within your ${formatPrice(autoBuyLimit, r.currency)} auto-buy limit. Ref ${r.reference}.`
        : `Done — bought ${r.title} for ${amount} after your OK. Ref ${r.reference}.`);
    }
    for (const a of approvals) {
      if (s.approvals.has(a.id)) continue;
      s.approvals.add(a.id);
      push("agent", `I found ${a.candidate.title} for ${formatPrice(a.candidate.price, a.candidate.currency)}, but ${a.reason}. Want me to buy it?`, a.id);
    }
    if (error && error !== s.error) {
      s.error = error;
      push("agent", `Last check failed: ${error}`);
    }
  }, [receipts, approvals, error, push]);

  const run = (a: ChatAction) => {
    const cur = apiRef.current;
    if (a.type === "add_mission") cur.addMission(a.title, a.maxPrice);
    else if (a.type === "set_autopilot") cur.setEnabled(a.on);
    else if (a.type === "approve") cur.approve(a.approvalId);
    else if (a.type === "decline") cur.decline(a.approvalId);
    else if (a.type === "check_now") cur.runNow();
  };

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    push("user", text);
    const { state, enabled } = apiRef.current;
    const context: ChatContext = {
      autopilot: enabled,
      guardrails: appConfig.guardrails,
      currency: appConfig.currency,
      missions: state.missions,
      approvals: state.approvals,
      receipts: state.receipts,
      recentSteps: state.steps.slice(-20).reverse(), // reducer stores oldest first; context wants newest first
    };
    const body: ChatRequest = { message: text, context };
    void (async () => {
      try {
        const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(String(res.status));
        const out = (await res.json()) as ChatReply;
        if (typeof out.reply !== "string") throw new Error("bad reply");
        push("agent", out.reply);
        (Array.isArray(out.actions) ? out.actions : []).forEach(run);
      } catch {
        push("agent", "Sorry, I couldn't reach the agent.");
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    })();
  }, [push]);

  return { messages, sending, send };
}
