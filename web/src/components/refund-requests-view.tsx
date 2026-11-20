"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";

type Claim = {
  claimRef: string;
  itemTitle: string;
  orderRef: string | null;
  recallId: string | null;
  status: string;
  at: string;
  message: string | null;
  reply: { at: string; text: string } | null;
};

// Refund requests SafeCart sent to the store, and the store's replies. Shown in the Refunds tab and at /refunds.
export function RefundRequestsView() {
  const [data, setData] = useState<{ claims?: Claim[]; note?: string; error?: string }>();

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/refunds", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => live && setData(d))
        .catch(() => live && setData({ error: "Could not load refund requests." }));
    load();
    const t = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const claims = data?.claims ?? [];
  const replied = claims.filter((c) => c.reply).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Refund requests</h1>
          <p className="text-sm text-muted-foreground">What SafeCart sent the store for Maya&apos;s recalled items, and what the store replied.</p>
        </div>
        <div className="flex gap-1">
          <Badge variant="secondary">{claims.length} sent</Badge>
          <Badge variant={replied > 0 ? "success" : "secondary"}>{replied} replied</Badge>
        </div>
      </header>

      {!data && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data?.error && <p role="alert" className="text-sm text-destructive">{data.error}</p>}
      {data?.note && <p className="text-sm text-muted-foreground">{data.note}</p>}
      {data && !data.error && !data.note && claims.length === 0 && (
        <p className="text-sm text-muted-foreground">No refund requests yet. When a recall hits something Maya owns, SafeCart writes to the store and the request appears here.</p>
      )}

      {claims.map((c) => (
        <Card key={c.claimRef}>
          <CardHeader>
            <CardTitle>{c.itemTitle}</CardTitle>
            <CardAction className="flex gap-1">
              <Badge variant="outline" className="font-mono">{c.claimRef}</Badge>
              <Badge variant={c.reply ? "success" : "warning"}>{c.reply ? "Refund approved" : "Waiting for reply"}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <section className="flex flex-col gap-1.5">
              <h2 className="text-xs font-medium text-muted-foreground tabular-nums">
                Sent to Demo Baby Store · {c.orderRef ? `order ${c.orderRef} · ` : ""}CPSC recall {c.recallId ?? "?"} · <time dateTime={c.at}>{formatTime(c.at)}</time>
              </h2>
              <blockquote className="rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                {c.message ?? "Letter not recorded for this request."}
              </blockquote>
            </section>
            <section className="flex flex-col gap-1.5">
              <h2 className="text-xs font-medium text-muted-foreground tabular-nums">
                Store reply{c.reply && <> · <time dateTime={c.reply.at}>{formatTime(c.reply.at)}</time></>}
              </h2>
              {c.reply ? (
                <blockquote className="rounded-md border bg-card px-3 py-2 text-sm whitespace-pre-wrap">{c.reply.text}</blockquote>
              ) : (
                <p className="text-sm text-muted-foreground">No reply yet.</p>
              )}
            </section>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">The store is simulated: its replies are automatic. Updates every 3 seconds.</p>
    </div>
  );
}
