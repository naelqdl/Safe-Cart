import type { AgentEvent, DashboardState, Mission } from "./types";

const MAX_EVENTS = 500;
const MAX_STEPS = 300;

export function initialDashboardState(missions: Mission[]): DashboardState {
  return {
    missions: missions.map((m) => ({ ...m, status: "watching" })),
    steps: [], events: [], approvals: [], approvalStates: {}, receipts: [], runs: [],
    checks: 0, ticking: false,
  };
}

// Pure: returns a new state, never mutates the input.
export function applyEvent(state: DashboardState, event: AgentEvent): DashboardState {
  const next: DashboardState = { ...state, events: [...state.events, event].slice(-MAX_EVENTS) };
  switch (event.type) {
    case "step": {
      const i = state.steps.findIndex((s) => s.id === event.step.id);
      if (i === -1) return { ...next, steps: [...state.steps, event.step].slice(-MAX_STEPS) };
      const steps = state.steps.slice();
      steps[i] = event.step;
      return { ...next, steps };
    }
    case "mission": {
      const at = new Date().toISOString();
      return {
        ...next,
        missions: state.missions.map((m) =>
          m.id === event.missionId ? { ...m, status: event.status, note: event.note, lastChecked: at } : m,
        ),
      };
    }
    case "approval":
      if (state.approvals.some((a) => a.id === event.approval.id)) return next;
      return {
        ...next,
        approvals: [...state.approvals, event.approval],
        approvalStates: { ...state.approvalStates, [event.approval.id]: { status: "idle" } },
      };
    case "receipt":
      return { ...next, receipts: [...state.receipts, event.receipt] };
    case "run": {
      const i = state.runs.findIndex((r) => r.id === event.run.id);
      if (i === -1) return { ...next, runs: [...state.runs, event.run] };
      const runs = state.runs.slice();
      runs[i] = event.run;
      return { ...next, runs };
    }
    case "error":
      return { ...next, error: event.message };
    case "done":
      return next;
  }
}
