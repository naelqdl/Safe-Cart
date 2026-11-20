"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyEvent } from "@/lib/agent/reduce";
import { initialRunState } from "@/lib/agent/types";
import type { ActionResult, ActionState, AgentEvent, RunState } from "@/lib/agent/types";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

export function useAgentRun(): {
  state: RunState;
  action: ActionState;
  run(query: string): void;
  reset(): void;
  approve(): void;
} {
  const [state, setState] = useState<RunState>(initialRunState);
  const [action, setAction] = useState<ActionState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Abort the in-flight run on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const fail = useCallback((message: string) => {
    setState((s) => ({ ...s, status: "error", error: message }));
  }, []);

  const run = useCallback(
    (input: string) => {
      const query = input.trim();
      if (!query) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ ...initialRunState, status: "running", query, startedAt: new Date().toISOString() });
      setAction({ status: "idle" });

      void (async () => {
        try {
          const res = await fetch("/api/agent", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query }),
            signal: controller.signal,
          });
          if (!res.ok) {
            fail(await errorMessage(res, `Agent request failed (${res.status})`));
            return;
          }
          if (!res.body) {
            fail("Agent returned no data");
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let terminal = false;

          // Returns false when the line is malformed and the run was aborted.
          const handle = (line: string): boolean => {
            if (!line.trim()) return true;
            let ev: AgentEvent;
            try {
              ev = JSON.parse(line) as AgentEvent;
            } catch {
              fail("Malformed event from agent");
              controller.abort();
              return false;
            }
            setState((s) => applyEvent(s, ev));
            if (ev.type === "done" || ev.type === "error") terminal = true;
            return true;
          };

          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) if (!handle(line)) return;
          }
          buffer += decoder.decode();
          if (!handle(buffer)) return;
          if (!terminal) fail("Agent stream ended unexpectedly");
        } catch {
          if (controller.signal.aborted) return;
          fail("Could not reach the agent");
        }
      })();
    },
    [fail],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initialRunState);
    setAction({ status: "idle" });
  }, []);

  const approve = useCallback(() => {
    const { decision, query } = stateRef.current;
    if (!decision) return;
    setAction({ status: "pending" });

    void (async () => {
      try {
        const res = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId: decision.candidateId, query }),
        });
        if (!res.ok) {
          setAction({ status: "error", message: await errorMessage(res, `Action failed (${res.status})`) });
          return;
        }
        const result = (await res.json()) as ActionResult;
        // Appends the action as an audit step; run status stays "done".
        setState((s) => applyEvent(s, { type: "step", step: result.step }));
        setAction(result.ok ? { status: "success", result } : { status: "error", message: result.message });
      } catch {
        setAction({ status: "error", message: "Could not reach the action endpoint" });
      }
    })();
  }, []);

  return { state, action, run, reset, approve };
}
