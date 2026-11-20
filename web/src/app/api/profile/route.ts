import { connection } from "next/server";
import { mockProfile } from "@/lib/agent/profile-mock";

// GET /api/profile: SafeCart profile from AGENT_BACKEND_URL/profile, or the built-in mock.
export async function GET(req: Request) {
  await connection(); // per-request: the mock profile changes with the demo controls
  const upstream = process.env.AGENT_BACKEND_URL;
  if (!upstream) return Response.json(mockProfile(), { headers: { "cache-control": "no-store" } });
  try {
    const r = await fetch(upstream + "/profile", { signal: req.signal, cache: "no-store" });
    return new Response(r.body, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Agent backend unreachable" }, { status: 502 });
  }
}
