import { mockDemo, resetMockDemo } from "@/lib/agent/profile-mock";

// POST /api/demo/sale {sku, pct} | /api/demo/recall {recallId} | /api/demo/reset {}
// Forwards to AGENT_BACKEND_URL/demo/<action>, or flips the mock's demo state so the next tick shows the effect.
const ACTIONS = ["sale", "recall", "reset"] as const;
type Action = (typeof ACTIONS)[number];
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function parseBody(action: Action, b: Record<string, unknown>): Record<string, unknown> | string {
  if (action === "sale") {
    const pct = b.pct;
    if (!isText(b.sku) || typeof pct !== "number" || !(pct > 0 && pct < 100)) return "Body must be { sku: string, pct: number between 0 and 100 }";
    return { sku: b.sku, pct };
  }
  if (action === "recall") return isText(b.recallId) ? { recallId: b.recallId } : "Body must be { recallId: string }";
  return {};
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.includes(action as Action)) return Response.json({ error: "Unknown demo action" }, { status: 404 });
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return Response.json({ error: "Body must be JSON" }, { status: 400 });
    }
  }
  if (!raw || typeof raw !== "object") return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  const body = parseBody(action as Action, raw as Record<string, unknown>);
  if (typeof body === "string") return Response.json({ error: body }, { status: 400 });

  const upstream = process.env.AGENT_BACKEND_URL;
  if (upstream) {
    try {
      const r = await fetch(`${upstream}/demo/${action}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: req.signal,
      });
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
    } catch {
      return Response.json({ error: "Agent backend unreachable" }, { status: 502 });
    }
  }

  const demo = mockDemo();
  if (action === "sale") demo.sale = { sku: body.sku as string, pct: body.pct as number, ticked: false };
  else if (action === "recall") demo.recall = { recallId: body.recallId as string, handled: false };
  else resetMockDemo();
  return Response.json({ ok: true });
}
