"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { appConfig } from "@/config/app.config";
import { readNdjson } from "@/lib/agent/ndjson";
import { applyEvent, initialDashboardState } from "@/lib/agent/reduce";
import { demoRuns } from "@/lib/agent/trail-demo";
import type { ActionResult, AgentEvent, AutopilotApi, DashboardState, TickRequest } from "@/lib/agent/types";

const STORAGE_KEY = "autopilot";
const INTERVAL = appConfig.checkIntervalSeconds;

// "enabled" lives in localStorage; the server snapshot (false) keeps hydration consistent.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const readEnabled = () => localStorage.getItem(STORAGE_KEY) === "on";
const serverEnabled = () => false;

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

export function useAutopilot(): AutopilotApi {
  const [state, setState] = useState<DashboardState>(() => ({
    ...initialDashboardState(appConfig.missions),
    runs: appConfig.showDemoRuns ? demoRuns : [],
  }));
  const enabled = useSyncExternalStore(subscribe, readEnabled, serverEnabled);
  const [secondsToNextCheck, setSeconds] = useState(INTERVAL);
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);
  const tickingRef = useRef(false);
  const countdownRef = useRef(INTERVAL);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const apply = useCallback((e: AgentEvent) => setState((s) => applyEvent(s, e)), []);

  const setEnabled = useCallback((on: boolean) => {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    listeners.forEach((l) => l());
    const at = new Date().toISOString();
    apply({ type: "step", step: { id: `autopilot-${at}`, at, kind: "plan", status: "ok", title: `You turned Autopilot ${on ? "on" : "off"}` } });
  }, [apply]);

  const tick = useCallback(async (manual = false) => {
    if (tickingRef.current) return;
    // Scheduled checks stay quiet when nothing is left to watch; "Check now" still reports it.
    if (!manual && !stateRef.current.missions.some((m) => m.status === "watching")) return;
    tickingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const s = stateRef.current;
    const body: TickRequest = {
      tick: s.checks,
      missions: s.missions
        .filter((m) => m.status === "watching")
        .map(({ id, title, maxPrice, currency }) => ({ id, title, maxPrice, currency })),
      guardrails: appConfig.guardrails,
      // shortcut: every receipt counts as "today" (state is per page load); track dates if sessions persist.
      spentToday: s.receipts.reduce((sum, r) => sum + r.amount, 0),
    };
    setState((prev) => ({ ...prev, ticking: true, error: undefined }));

    let error: string | undefined;
    try {
      const res = await fetch("/api/agent/tick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) error = await errorMessage(res, `Agent request failed (${res.status})`);
      else if (!(await readNdjson(res, apply))) error = "Agent stream ended unexpectedly";
    } catch (e) {
      error = e instanceof Error && e.message === "Malformed event from agent" ? e.message : "Could not reach the agent";
    }
    // An aborted tick was already cleaned up by stop(); a newer tick may own the refs now.
    if (controller.signal.aborted) return;
    abortRef.current = null;
    tickingRef.current = false;
    setState((prev) => ({
      ...prev,
      ticking: false,
      checks: prev.checks + 1,
      lastTickAt: new Date().toISOString(),
      error: error ?? prev.error,
    }));
  }, [apply]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    tickingRef.current = false;
    setState((prev) => (prev.ticking ? { ...prev, ticking: false } : prev));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    countdownRef.current = INTERVAL;
    void tick();
    const id = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        countdownRef.current = INTERVAL;
        void tick();
      }
      setSeconds(countdownRef.current);
    }, 1000);
    return () => {
      clearInterval(id);
      stop();
      countdownRef.current = INTERVAL;
      setSeconds(INTERVAL);
    };
  }, [enabled, tick, stop]);

  const runNow = useCallback(() => {
    if (tickingRef.current) return;
    countdownRef.current = INTERVAL;
    setSeconds(INTERVAL);
    void tick(true);
  }, [tick]);

  // Manual checks (Autopilot off) are not covered by the effect cleanup above.
  useEffect(() => stop, [stop]);

  const setApprovalState = (id: string, ui: DashboardState["approvalStates"][string]) =>
    setState((s) => ({ ...s, approvalStates: { ...s.approvalStates, [id]: ui } }));

  const approve = useCallback(
    (approvalId: string) => {
      const s = stateRef.current;
      const approval = s.approvals.find((a) => a.id === approvalId);
      if (!approval || s.approvalStates[approvalId]?.status === "pending") return;
      const { candidate, missionId } = approval;
      const title = s.missions.find((m) => m.id === missionId)?.title ?? candidate.title;
      const spent = s.receipts.reduce((sum, r) => sum + r.amount, 0);
      const { dailyBudget } = appConfig.guardrails;
      // Approval overrides the auto-buy limit, never the daily budget.
      if (spent + candidate.price > dailyBudget) {
        const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: candidate.currency }).format(n);
        setApprovalState(approvalId, { status: "error", message: `Would exceed today's ${fmt(dailyBudget)} budget (spent ${fmt(spent)}). Decline it or raise dailyBudget in app.config.ts.` });
        return;
      }
      setApprovalState(approvalId, { status: "pending" });

      void (async () => {
        try {
          const res = await fetch("/api/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ candidateId: candidate.id, query: title }),
          });
          if (!res.ok) {
            setApprovalState(approvalId, { status: "error", message: await errorMessage(res, `Action failed (${res.status})`) });
            return;
          }
          const result = (await res.json()) as ActionResult;
          apply({ type: "step", step: { ...result.step, missionId } });
          if (!result.ok) {
            setApprovalState(approvalId, { status: "error", message: result.message });
            return;
          }
          const listPrice = Number(candidate.attributes["List price"]?.replace(/[^0-9.]/g, ""));
          const saved = listPrice > candidate.price ? Math.round((listPrice - candidate.price) * 100) / 100 : 0;
          apply({
            type: "receipt",
            receipt: {
              reference: result.reference ?? "", missionId, candidateId: candidate.id, title,
              amount: candidate.price, currency: candidate.currency, saved, at: new Date().toISOString(), auto: false,
            },
          });
          apply({ type: "mission", missionId, status: "done", note: "Approved and bought" });
          setState((st) => ({ ...st, approvals: st.approvals.filter((a) => a.id !== approvalId) }));
        } catch {
          setApprovalState(approvalId, { status: "error", message: "Could not reach the action endpoint" });
        }
      })();
    },
    [apply],
  );

  const decline = useCallback(
    (approvalId: string) => {
      const approval = stateRef.current.approvals.find((a) => a.id === approvalId);
      if (!approval) return;
      const { candidate, missionId } = approval;
      setState((s) => ({ ...s, approvals: s.approvals.filter((a) => a.id !== approvalId) }));
      apply({ type: "mission", missionId, status: "watching", note: "You declined — still watching" });
      apply({
        type: "step",
        step: {
          id: `decline-${approvalId}`, at: new Date().toISOString(), kind: "decide", status: "ok",
          title: `You declined ${candidate.title}`, missionId,
        },
      });
    },
    [apply],
  );

  const addMission = useCallback((rawTitle: string, maxPrice: number) => {
    const title = rawTitle.trim();
    if (!title || !(maxPrice > 0)) return;
    const id = "m-" + Date.now().toString(36);
    setState((s) => ({
      ...s,
      missions: [...s.missions, { id, title, maxPrice, currency: appConfig.currency, status: "watching" }],
    }));
  }, []);

  return { state, enabled, setEnabled, secondsToNextCheck, runNow, approve, decline, addMission };
}
