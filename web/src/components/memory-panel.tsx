"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileApi } from "@/hooks/use-profile";
import { formatPrice } from "@/lib/format";
import type { RecallAlert, SafetyCheck } from "@/lib/agent/types";

const cur = "USD";

function SafetyBadge({ safety, url }: { safety?: SafetyCheck; url?: string }) {
  if (!safety) return null;
  if (safety.status === "recalled") {
    const badge = <Badge variant="destructive">RECALLED</Badge>;
    return url ? <a href={url} target="_blank" rel="noreferrer" title="Open the recall notice">{badge}</a> : badge;
  }
  if (safety.status === "unknown") return <Badge variant="outline">Safety unknown</Badge>;
  return <Badge variant="secondary">Safe</Badge>;
}

// Data comes from useProfile() (called once in the dashboard and shared with the demo bar).
export function MemoryPanel({ api, recalls }: { api: ProfileApi; recalls: RecallAlert[] }) {
  const { profile, error, reload } = api;
  // RECALLED badges link to the notice from the matching recall alert, else the CPSC recalls page.
  const recallUrl = (s?: SafetyCheck) => recalls.find((a) => a.recallId === s?.recallId)?.url ?? "https://www.cpsc.gov/Recalls";
  return (
    <Card>
      <CardHeader>
        <CardTitle>What SafeCart knows about {profile?.name.split(" ")[0] ?? "you"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && !profile ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-destructive">{error}</span>
            <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
          </div>
        ) : !profile ? (
          <p className="text-sm text-muted-foreground">Loading memory…</p>
        ) : (
          <>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preferences</h3>
              <ul className="flex flex-wrap gap-1.5">
                {profile.preferences.map((p) => (
                  <li key={p.label}>
                    <Badge variant="outline">
                      {p.label}
                      {p.source === "memory" && <span className="text-muted-foreground">· memory</span>}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Wishlist</h3>
              <ul className="flex flex-col divide-y">
                {profile.wishlist.map((w) => (
                  <li key={w.id} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={w.title}>{w.title}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatPrice(w.price, cur)} · target {formatPrice(w.targetPrice, cur)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {w.onSale && w.listPrice > w.price && (
                        <Badge>On sale −{Math.round((1 - w.price / w.listPrice) * 100)}%</Badge>
                      )}
                      <SafetyBadge safety={w.safety} url={recallUrl(w.safety)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Owned</h3>
              <ul className="flex flex-col divide-y">
                {profile.owned.map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={o.title}>{o.title}</p>
                      <p className="text-xs text-muted-foreground">Model {o.model} · {o.merchant}</p>
                    </div>
                    <SafetyBadge safety={o.safety} url={recallUrl(o.safety)} />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
