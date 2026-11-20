// Mock agent: a scripted scenario that emits the same events a real backend would.
// Triggers: query containing "fail" → error event after search; "decline" → action returns ok:false.
import type { ActionRequest, ActionResult, AgentEvent, AgentRequest, Candidate } from "./types";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const delay = () => sleep(350 + Math.floor(Math.random() * 351));
const now = () => new Date().toISOString();

export async function* runMockAgent(req: AgentRequest): AsyncGenerator<AgentEvent> {
  const subject = req.query.trim().slice(0, 40);

  await delay();
  yield {
    type: "step",
    step: {
      id: "s-plan", at: now(), kind: "plan", status: "ok",
      title: `Understand request: "${subject}"`,
      detail: "Extracted needs: budget, quality, delivery time (mock assumptions).",
    },
  };

  await delay();
  yield {
    type: "step",
    step: {
      id: "s-search", at: now(), kind: "search", status: "ok", title: "Search catalog",
      sources: [{ label: "Mock catalog" }], detail: "Found 3 candidates.",
    },
  };

  if (req.query.toLowerCase().includes("fail")) {
    await delay();
    yield { type: "error", message: 'Mock failure triggered (query contains "fail").' };
    return;
  }

  const c1: Candidate = {
    id: "c1", title: `${subject} (Value pick)`, vendor: "Mock Store A", price: 19.99, currency: "USD",
    attributes: { Rating: "3.9 / 5", Delivery: "5–7 days" }, verdict: "considering",
  };
  const c2: Candidate = {
    id: "c2", title: `${subject} (Best match)`, vendor: "Mock Store B", price: 34.99, currency: "USD",
    attributes: { Rating: "4.6 / 5", Delivery: "2 days" }, verdict: "considering",
  };
  const c3: Candidate = {
    id: "c3", title: `${subject} (Premium)`, vendor: "Mock Store C", price: 89.0, currency: "USD",
    attributes: { Rating: "4.8 / 5", Delivery: "Next day" }, verdict: "considering",
  };
  for (const candidate of [c1, c2, c3]) {
    await delay();
    yield { type: "candidate", candidate };
  }

  const fetchStep = {
    id: "s-fetch", kind: "fetch", title: "Read spec sheets and reviews",
  } as const;
  await delay();
  yield { type: "step", step: { ...fetchStep, at: now(), status: "running" } };
  await delay();
  yield {
    type: "step",
    step: {
      ...fetchStep, at: now(), status: "ok",
      sources: [{ label: "Mock spec sheet" }, { label: "Mock reviews" }],
    },
  };

  await delay();
  yield {
    type: "step",
    step: {
      id: "s-compare", at: now(), kind: "compare", status: "warn", title: "Compare against requirements",
      detail: "2 of 3 candidates fail a requirement.",
    },
  };
  const verdicts: Candidate[] = [
    { ...c1, verdict: "rejected", reason: "Rating 3.9 is below the 4.0 minimum." },
    { ...c3, verdict: "rejected", reason: "$89.00 is over the assumed $50 budget." },
    { ...c2, verdict: "selected", reason: "Meets every requirement at the lowest qualifying price." },
  ];
  for (const candidate of verdicts) {
    await delay();
    yield { type: "candidate", candidate };
  }

  await delay();
  yield { type: "step", step: { id: "s-decide", at: now(), kind: "decide", status: "ok", title: "Choose Mock Store B" } };

  await delay();
  yield {
    type: "decision",
    decision: {
      candidateId: "c2",
      summary: `Best match for "${subject}": meets rating, budget and delivery requirements. All data is mock.`,
    },
  };

  await delay();
  yield { type: "done" };
}

export function runMockAction(req: ActionRequest): ActionResult {
  const reference = "MOCK-" + Date.now().toString(36).toUpperCase();
  const base = { id: `s-act-${Date.now()}`, at: now(), kind: "act" as const, sources: [{ label: "Mock checkout" }] };
  if (req.query.toLowerCase().includes("decline")) {
    return {
      ok: false,
      message: 'Mock payment declined (query contains "decline").',
      step: { ...base, title: "Order attempt declined", status: "fail" },
    };
  }
  return {
    ok: true,
    reference,
    message: "Mock order placed. No real purchase was made.",
    step: { ...base, title: `Placed mock order ${reference}`, status: "ok" },
  };
}
