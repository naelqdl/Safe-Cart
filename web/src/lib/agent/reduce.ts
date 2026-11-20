import type { AgentEvent, RunState } from "./types";

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

// Pure: returns a new state, never mutates the input.
export function applyEvent(state: RunState, event: AgentEvent): RunState {
  const next: RunState = { ...state, events: [...state.events, event] };
  switch (event.type) {
    case "step":
      return { ...next, steps: upsert(state.steps, event.step) };
    case "candidate":
      return { ...next, candidates: upsert(state.candidates, event.candidate) };
    case "decision":
      return { ...next, decision: event.decision };
    case "error":
      return { ...next, status: "error", error: event.message };
    case "done":
      return { ...next, status: "done" };
  }
}
