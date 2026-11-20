// Mock agent: deterministic scripted checks that emit the same events a real backend would.
// Triggers: a mission title containing "fail" → error event during its check; "decline" → its purchase fails.
import type { ActionRequest, ActionResult, AgentEvent, AuditStep, Candidate, TickRequest } from "./types";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const delay = () => sleep(250 + Math.floor(Math.random() * 201));
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function* runMockTick(req: TickRequest): AsyncGenerator<AgentEvent> {
  const { tick, missions, guardrails, spentToday } = req;
  if (missions.length === 0) {
    await delay();
    yield { type: "step", step: { id: `t${tick}-plan`, at: now(), kind: "plan", status: "ok", title: "Nothing to watch — add a mission" } };
    await delay();
    yield { type: "done" };
    return;
  }

  const m = missions[tick % missions.length];
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency });
  const fmt = (n: number) => money.format(n);
  const step = (name: string, s: Omit<AuditStep, "id" | "at" | "missionId">): AgentEvent => ({
    type: "step",
    step: { id: `t${tick}-${name}`, at: now(), missionId: m.id, ...s },
  });
  const lower = m.title.toLowerCase();

  await delay();
  yield step("check", { kind: "search", status: "running", title: `Checking 3 stores for "${m.title}"` });
  if (lower.includes("fail")) {
    await delay();
    yield { type: "error", message: `Mock failure while checking "${m.title}"` };
    return;
  }
  await delay();
  yield step("check", {
    kind: "search", status: "ok", title: `Checked 3 stores for "${m.title}"`,
    sources: [{ label: "Mock catalog" }, { label: "Mock price history" }],
  });

  const outcome = tick % 3;
  if (outcome === 0) {
    const best = round2(m.maxPrice * 1.15);
    await delay();
    yield step("compare", {
      kind: "compare", status: "ok",
      title: `Best price ${fmt(best)} is above your ${fmt(m.maxPrice)} max — keep watching`,
      sources: [{ label: "Mock catalog" }],
    });
    await delay();
    yield { type: "mission", missionId: m.id, status: "watching", note: "No qualifying offer yet" };
    await delay();
    yield { type: "done" };
    return;
  }

  const price = round2(m.maxPrice * (outcome === 1 ? 0.85 : 0.97));
  const listPrice = round2(m.maxPrice * 1.2);
  const saved = round2(listPrice - price);
  const candidate: Candidate = {
    id: `c-${m.id}-${tick}`, title: m.title + " (Mock Store B)", vendor: "Mock Store B", price, currency: m.currency,
    attributes: { Rating: "4.6 / 5", Delivery: "2 days", "List price": fmt(listPrice) },
    verdict: "selected", reason: `Lowest price under your ${fmt(m.maxPrice)} max`,
  };
  await delay();
  yield step("compare", {
    kind: "compare", status: "ok",
    title: `Found ${fmt(price)} (list ${fmt(listPrice)}), under your ${fmt(m.maxPrice)} max`,
    sources: [{ label: "Mock catalog" }],
  });

  const { autoBuyLimit, dailyBudget } = guardrails;
  if (price <= autoBuyLimit && spentToday + price <= dailyBudget) {
    await delay();
    yield step("decide", {
      kind: "decide", status: "ok", title: "Within guardrails — buying automatically",
      detail: `Auto-buy limit ${fmt(autoBuyLimit)}, spent today ${fmt(spentToday)} of ${fmt(dailyBudget)}`,
    });
    await delay();
    if (lower.includes("decline")) {
      yield step("act", { kind: "act", status: "fail", title: "Mock payment declined", sources: [{ label: "Mock checkout" }] });
      await delay();
      yield { type: "mission", missionId: m.id, status: "watching", note: "Payment declined; will retry" };
    } else {
      const reference = "MOCK-" + Date.now().toString(36).toUpperCase();
      yield step("act", {
        kind: "act", status: "ok", title: `Bought for ${fmt(price)} — ${reference}`, sources: [{ label: "Mock checkout" }],
      });
      await delay();
      yield {
        type: "receipt",
        receipt: {
          reference, missionId: m.id, candidateId: candidate.id, title: m.title,
          amount: price, currency: m.currency, saved, at: now(), auto: true,
        },
      };
      await delay();
      yield { type: "mission", missionId: m.id, status: "done", note: `Bought for ${fmt(price)}` };
    }
  } else {
    const reason = price > autoBuyLimit
      ? `${fmt(price)} is over your ${fmt(autoBuyLimit)} auto-buy limit`
      : `Would exceed today's ${fmt(dailyBudget)} budget`;
    await delay();
    yield step("decide", { kind: "decide", status: "warn", title: "Needs your approval", detail: reason });
    await delay();
    yield { type: "approval", approval: { id: `a-${m.id}-${tick}`, missionId: m.id, candidate, reason, at: now() } };
    await delay();
    yield { type: "mission", missionId: m.id, status: "waiting", note: "Waiting for your approval" };
  }
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
