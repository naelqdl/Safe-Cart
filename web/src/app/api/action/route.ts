import { runMockAction } from "@/lib/agent/mock";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const { candidateId, query } = (body ?? {}) as { candidateId?: unknown; query?: unknown };
  if (typeof candidateId !== "string" || !candidateId.trim() || typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "candidateId and query are required" }, { status: 400 });
  }

  const upstream = process.env.AGENT_BACKEND_URL;
  if (upstream) {
    try {
      const r = await fetch(upstream + "/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId, query }),
      });
      return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
    } catch {
      return Response.json({ error: "Agent backend unreachable" }, { status: 502 });
    }
  }

  return Response.json(runMockAction({ candidateId, query }));
}
