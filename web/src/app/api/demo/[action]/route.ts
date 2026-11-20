import { appConfig } from "@/config/app.config";
import { mockDemo, resetMockDemo } from "@/lib/agent/profile-mock";

// POST /api/demo/sale {sku, pct} | /recall {recallId} | /guard {on} | /inject {sku?, text?} | /bigbuy {} | /verify {outcome} | /reset {}
// (bigbuy: put the $199 car seat on the wishlist → over-limit approval; verify: pass/fail the SIMULATED Persona check; real backend only)
// (server/ supports guard as a local stand-in for the Statsig recall_guard flip, and inject defaults to wishlist item 2)
// Forwards to AGENT_BACKEND_URL/demo/<action>, or flips the mock's demo state so the next tick shows the effect.
const ACTIONS = ["sale", "recall", "guard", "inject", "bigbuy", "verify", "reset"] as const;
type Action = (typeof ACTIONS)[number];
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

const parseOutcome = (b: Record<string, unknown>) =>
  b.outcome === "approved" || b.outcome === "declined" ? { outcome: b.outcome } : "Body must be { outcome: \"approved\" | \"declined\" }";

function parseBody(action: Action, b: Record<string, unknown>): Record<string, unknown> | string {
  if (action === "sale") {
    const pct = b.pct;
    if (!isText(b.sku) || typeof pct !== "number" || !(pct > 0 && pct < 100)) return "Body must be { sku: string, pct: number between 0 and 100 }";
    return { sku: b.sku, pct };
  }
  if (action === "recall") return isText(b.recallId) ? { recallId: b.recallId } : "Body must be { recallId: string }";
  if (action === "verify") return parseOutcome(b);
  if (action === "guard") return typeof b.on === "boolean" ? { on: b.on } : "Body must be { on: boolean }";
  if (action === "inject") return { ...(isText(b.sku) ? { sku: b.sku } : {}), ...(isText(b.text) ? { text: b.text } : {}) };
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
      // server/ only plants the text; the agent reads a listing only when its item is on sale, so put that sku on sale too.
      if (action === "inject" && r.ok) {
        const planted = (await r.json()) as { ok: boolean; sku?: string };
        if (!planted.sku) return Response.json(planted);
        const s = await fetch(`${upstream}/demo/sale`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku: planted.sku, pct: appConfig.demo.salePct }), signal: req.signal,
        });
        return Response.json(s.ok ? { ...planted, sale: true } : { error: `Injection planted on ${planted.sku}, but putting it on sale failed (${s.status})` }, { status: s.ok ? 200 : 502 });
      }
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
    } catch {
      return Response.json({ error: "Agent backend unreachable" }, { status: 502 });
    }
  }

  if (action === "bigbuy" || action === "verify") return Response.json({ error: "Big purchase and Persona need the real backend (AGENT_BACKEND_URL)" }, { status: 501 });
  const demo = mockDemo();
  if (action === "sale") demo.sale = { sku: body.sku as string, pct: body.pct as number, ticked: false };
  else if (action === "guard") demo.guardOff = !body.on;
  else if (action === "inject") demo.inject = { ticked: false };
  else if (action === "recall") demo.recall = { recallId: body.recallId as string, handled: false };
  else resetMockDemo();
  return Response.json({ ok: true });
}
