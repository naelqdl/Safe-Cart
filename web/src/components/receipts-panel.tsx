import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatTime } from "@/lib/format";
import type { Receipt } from "@/lib/agent/types";

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
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium tabular-nums">{formatPrice(r.amount, r.currency)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">saved {formatPrice(r.saved, r.currency)}</p>
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
