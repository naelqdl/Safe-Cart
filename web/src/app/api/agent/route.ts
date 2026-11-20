import { runMockAgent } from "@/lib/agent/mock";

const MAX_QUERY = 2000;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const raw = (body as { query?: unknown } | null)?.query;
  const query = typeof raw === "string" ? raw.trim() : "";
  if (!query || query.length > MAX_QUERY) {
    return Response.json(
      { error: "query must be a non-empty string of at most 2000 characters" },
      { status: 400 },
    );
  }

  const upstream = process.env.AGENT_BACKEND_URL;
  if (upstream) {
    try {
      const r = await fetch(upstream + "/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
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

  const it = runMockAgent({ query });
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
