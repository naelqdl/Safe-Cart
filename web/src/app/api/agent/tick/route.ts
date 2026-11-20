import { runMockTick } from "@/lib/agent/mock";
import type { Mission, TickRequest } from "@/lib/agent/types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function isMission(v: unknown): v is Mission {
  const m = v as Partial<Mission> | null;
  return !!m && isText(m.id) && isText(m.title) && isNum(m.maxPrice) && m.maxPrice > 0
    && typeof m.currency === "string" && /^[A-Za-z]{3}$/.test(m.currency);
}

function parseTick(body: unknown): TickRequest | null {
  const b = body as Partial<TickRequest> | null;
  if (!b || !Number.isInteger(b.tick) || (b.tick as number) < 0) return null;
  if (!Array.isArray(b.missions) || !b.missions.every(isMission)) return null;
  if (!b.guardrails || !isNum(b.guardrails.autoBuyLimit) || !isNum(b.guardrails.dailyBudget)) return null;
  if (!isNum(b.spentToday)) return null;
  const { tick, missions, guardrails, spentToday } = b as TickRequest;
  return {
    tick,
    missions: missions.map(({ id, title, maxPrice, currency }) => ({ id, title, maxPrice, currency })),
    guardrails: { autoBuyLimit: guardrails.autoBuyLimit, dailyBudget: guardrails.dailyBudget },
    spentToday,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const tick = parseTick(body);
  if (!tick) {
    return Response.json(
      {
        error:
          "Body must be { tick: integer >= 0, missions: [{ id, title, maxPrice > 0, currency }], guardrails: { autoBuyLimit, dailyBudget }, spentToday: number }",
      },
      { status: 400 },
    );
  }

  const upstream = process.env.AGENT_BACKEND_URL;
  if (upstream) {
    try {
      const r = await fetch(upstream + "/tick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tick),
        signal: req.signal,
      });
      return new Response(r.body, {
        status: r.status,
        headers: {
          "content-type": r.headers.get("content-type") ?? "application/x-ndjson",
          "cache-control": "no-store",
        },
      });
    } catch {
      return Response.json({ error: "Agent backend unreachable" }, { status: 502 });
    }
  }

  const it = runMockTick(tick);
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const { value, done } = await it.next();
        if (done) c.close();
        else c.enqueue(enc.encode(JSON.stringify(value) + "\n"));
      } catch {
        c.enqueue(enc.encode(JSON.stringify({ type: "error", message: "Mock agent crashed" }) + "\n"));
        c.close();
      }
    },
    cancel() {
      void it.return(undefined);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
