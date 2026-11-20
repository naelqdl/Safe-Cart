import { runMockChat } from "@/lib/agent/chat-mock";
import type { ChatRequest } from "@/lib/agent/types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseChat(body: unknown): ChatRequest | null {
  const b = body as Partial<ChatRequest> | null;
  if (!b || typeof b.message !== "string") return null;
  const message = b.message.trim();
  if (!message || message.length > 1000) return null;
  const c = b.context;
  if (!c || typeof c !== "object") return null;
  if (![c.missions, c.approvals, c.receipts, c.recentSteps].every(Array.isArray)) return null;
  if (!c.guardrails || !isNum(c.guardrails.autoBuyLimit) || !isNum(c.guardrails.dailyBudget)) return null;
  return { message, context: c };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const chat = parseChat(body);
  if (!chat) {
    return Response.json(
      { error: "Body must be { message: non-empty string (max 1000 chars), context: { missions, approvals, receipts, recentSteps: arrays, guardrails: { autoBuyLimit, dailyBudget } } }" },
      { status: 400 },
    );
  }

  const upstream = process.env.AGENT_BACKEND_URL;
  if (!upstream) return Response.json(runMockChat(chat));
  try {
    const r = await fetch(upstream + "/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(chat),
      signal: req.signal,
    });
    return new Response(r.body, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Agent backend unreachable" }, { status: 502 });
  }
}
