import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import type { Run } from "@/lib/agent/trail";
import type { RecallAlert } from "@/lib/agent/types";

// Refund requests SafeCart sent on Maya's behalf. The claim comes from the owned-item recall alert;
// the letter is the "Drafted refund claim letter" step of that item's run (written by Claude, or a labelled template).
export function RefundRequestsPanel({ recalls, runs }: { recalls: RecallAlert[]; runs: Run[] }) {
  const requests = recalls
    .filter((a) => a.itemKind === "owned" && a.claimRef)
    .map((a) => {
      const run = [...runs].reverse().find((r) => r.mandate.goal === `Protect owned item: ${a.itemTitle}`);
      const letter = run?.steps.find((s) => s.title.startsWith("Drafted refund claim letter"));
      const filed = run?.steps.find((s) => s.title.startsWith(`Refund claim ${a.claimRef}`));
      return { a, letter, simulated: !!filed?.title.includes("SIMULATED") };
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Refund requests sent</CardTitle>
        <CardAction className="flex items-center gap-2">
          <a href="/refunds" target="_blank" className="text-xs font-medium text-primary hover:underline">
            Sent and replies
          </a>
          <Badge variant={requests.length > 0 ? "default" : "secondary"}>{requests.length} sent</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            When a recall hits something Maya owns, SafeCart writes to the store and asks for the refund. Each request appears here.
          </p>
        ) : (
          <ul className="divide-y">
            {requests.map(({ a, letter, simulated }) => {
              const template = !letter?.model;
              return (
                <li key={a.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.itemTitle}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        To Demo Baby Store · CPSC recall {a.recallId} · <time dateTime={a.at}>{formatTime(a.at)}</time>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <Badge variant="outline" className="font-mono">{a.claimRef}</Badge>
                      <Badge variant={simulated ? "warning" : "success"}>{simulated ? "Filed (simulated)" : "Filed"}</Badge>
                    </div>
                  </div>
                  {letter?.detail ? (
                    <blockquote className="rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                      {letter.detail}
                    </blockquote>
                  ) : (
                    <p className="text-xs text-muted-foreground">Letter not available for this request.</p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    {template ? (
                      <span className="text-warning">Template letter (Claude unavailable)</span>
                    ) : (
                      <span>
                        Written by <span className="font-mono">{letter?.model}</span>
                        {letter?.costUsd != null && <> · ${letter.costUsd.toFixed(4)}</>}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
