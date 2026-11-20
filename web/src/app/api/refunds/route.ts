import { connection } from "next/server";

const noStore = { "cache-control": "no-store" };

// GET /api/refunds: refund claims the agent filed at the store (merchant /api/admin/log), with the store's replies.
export async function GET(req: Request) {
  await connection(); // per-request: claims change while the demo runs
  const backend = process.env.AGENT_BACKEND_URL;
  if (!backend) return Response.json({ claims: [], note: "Mock mode: no store is connected, so no refund requests are sent." }, { headers: noStore });
  const merchant = process.env.MERCHANT_URL || "http://localhost:3100";
  try {
    const [log, profile] = await Promise.all([
      fetch(merchant + "/api/admin/log", { signal: req.signal, cache: "no-store" }).then((r) => r.json()),
      fetch(backend + "/profile", { signal: req.signal, cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const titles = new Map<string, string>((profile?.owned ?? []).map((o: { id: string; title: string }) => [o.id, o.title]));
    const claims = (log.claims ?? []).map((c: { ownedItemId: string | null }) => ({ ...c, itemTitle: (c.ownedItemId && titles.get(c.ownedItemId)) || c.ownedItemId || "Unknown item" }));
    return Response.json({ claims }, { headers: noStore });
  } catch {
    return Response.json({ error: "Store unreachable (merchant on " + merchant + ")" }, { status: 502, headers: noStore });
  }
}
