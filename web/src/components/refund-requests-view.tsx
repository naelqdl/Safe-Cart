"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sampleRefunds } from "@/lib/agent/sample-refunds";

export type RefundClaim = {
  claimRef: string;
  itemTitle: string;
  to?: string;
  orderRef: string | null;
  recallId: string | null;
  recallTitle?: string;
  hazard?: string;
  remedy?: string;
  url?: string;
  status: string;
  at: string;
  message: string | null;
  reply: { at: string; text: string } | null;
  sample?: boolean;
};

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "outline" }> = {
  refund_approved: { label: "Refund approved", variant: "success" },
  info_requested: { label: "Store needs info", variant: "outline" },
};
const status = (c: RefundClaim) => STATUS[c.status] ?? { label: "Waiting for reply", variant: "warning" as const };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Refund requests SafeCart sent to the store, and the store's replies. Shown in the Refunds tab and at /refunds.
// Live requests come from the merchant; sample ones (real CPSC recalls, made-up emails) fill the list for the demo.
export function RefundRequestsView() {
  const [data, setData] = useState<{ claims?: RefundClaim[]; note?: string; error?: string }>();
  const [openRef, setOpenRef] = useState<string | null>(null);

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

  const claims = [...(data?.claims ?? []), ...sampleRefunds];
  const replied = claims.filter((c) => c.reply).length;
  const open = claims.find((c) => c.claimRef === openRef);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Refund requests</h1>
          <p className="text-sm text-muted-foreground">What SafeCart sent for Maya&apos;s recalled items, and what came back. Click one to read the emails.</p>
        </div>
        <div className="flex gap-1">
          <Badge variant="secondary">{claims.length} sent</Badge>
          <Badge variant={replied > 0 ? "success" : "secondary"}>{replied} replied</Badge>
        </div>
      </header>

      {data?.error && <p role="alert" className="text-sm text-destructive">{data.error}</p>}
      {data?.note && <p className="text-sm text-muted-foreground">{data.note}</p>}

      <Card className="py-0">
        <CardContent className="px-0">
          <ul className="divide-y">
            {claims.map((c) => {
              const s = status(c);
              return (
                <li key={c.claimRef}>
                  <button
                    type="button"
                    onClick={() => setOpenRef(c.claimRef)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 gap-3">
                      <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.itemTitle}</span>
                        <span className="block truncate text-xs text-muted-foreground tabular-nums">
                          To {c.to ?? "Demo Baby Store"} · CPSC recall {c.recallId ?? "?"} · {when(c.at)}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {c.sample && <Badge variant="secondary">Sample</Badge>}
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Sample requests use real CPSC recalls from November 2026; their emails and replies are made up for the demo. The store is simulated and replies automatically.
      </p>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenRef(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>Refund request: {open.itemTitle}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono">{open.claimRef}</span>
                  <Badge variant={status(open).variant}>{status(open).label}</Badge>
                  {open.sample && <Badge variant="secondary">Sample</Badge>}
                </DialogDescription>
              </DialogHeader>

              <Email from="SafeCart, for Maya Chen" to={open.to ?? "Demo Baby Store"} at={open.at} body={open.message ?? "Letter not recorded for this request."} />

              {open.reply ? (
                <Email from={open.to ?? "Demo Baby Store"} to="SafeCart, for Maya Chen" at={open.reply.at} body={open.reply.text} />
              ) : (
                <p className="text-sm text-muted-foreground">No reply yet.</p>
              )}

              {(open.hazard || open.url) && (
                <section className="flex flex-col gap-1 text-sm">
                  <h3 className="text-xs font-medium text-muted-foreground">CPSC recall {open.recallId}</h3>
                  {open.recallTitle && <p className="font-medium">{open.recallTitle}</p>}
                  {open.hazard && <p><span className="text-muted-foreground">Hazard: </span>{open.hazard}</p>}
                  {open.remedy && <p><span className="text-muted-foreground">Remedy: </span>{open.remedy}</p>}
                  {open.url && (
                    <a href={open.url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-primary hover:underline">
                      Recall notice on cpsc.gov <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Email({ from, to, at, body }: { from: string; to: string; at: string; body: string }) {
  return (
    <article className="rounded-md border">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b bg-muted/40 px-3 py-2 text-xs">
        <dt className="text-muted-foreground">From</dt>
        <dd>{from}</dd>
        <dt className="text-muted-foreground">To</dt>
        <dd>{to}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd className="tabular-nums">
          <time dateTime={at}>{when(at)}</time>
        </dd>
      </dl>
      <p className="px-3 py-3 text-sm whitespace-pre-wrap">{body}</p>
    </article>
  );
}
