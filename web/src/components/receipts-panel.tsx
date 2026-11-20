import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatTime } from "@/lib/format";
import type { Receipt, SafetyCheck } from "@/lib/agent/types";

// Every receipt shows its safety check; no sources means the agent bought without one (NAIVE mode).
function SafetyLine({ safety }: { safety?: SafetyCheck }) {
  if (!safety || safety.sources.length === 0) {
    return <p className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive"><ShieldAlert className="size-3.5 shrink-0" aria-hidden />Bought in NAIVE mode: no safety check</p>;
  }
  const clear = safety.status === "clear";
  const label = clear ? "passed" : safety.status === "recalled" ? "RECALLED" : "unknown";
  const Icon = clear ? ShieldCheck : ShieldAlert;
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      <p className={clear ? "flex items-center gap-1 font-medium text-success" : "flex items-center gap-1 font-medium text-destructive"}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        Safety check {label}
      </p>
      <p className="text-muted-foreground">
        <time dateTime={safety.checkedAt} className="tabular-nums">{formatTime(safety.checkedAt)}</time> · {safety.sources.map((s) => s.label).join(" · ")}
      </p>
    </div>
  );
}

export function ReceiptsPanel({ receipts }: { receipts: Receipt[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipts</CardTitle>
      </CardHeader>
      <CardContent>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Purchases the agent makes will appear here.</p>
        ) : (
          <ul className="divide-y">
            {[...receipts].reverse().map((r) => (
              <li key={r.reference} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={r.title}>{r.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <time dateTime={r.at}>{formatTime(r.at)}</time> · <span className="font-mono">{r.reference}</span>
                  </p>
                  <SafetyLine safety={r.safety} />
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatPrice(r.amount, r.currency)}</p>
                  {r.saved > 0 && <p className="text-xs font-medium text-success tabular-nums">saved {formatPrice(r.saved, r.currency)}</p>}
                  <Badge className="mt-1" variant={r.auto ? "secondary" : "outline"}>{r.auto ? "Auto" : "Approved"}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
