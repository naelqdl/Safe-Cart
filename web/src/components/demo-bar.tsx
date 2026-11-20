"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app.config";
import type { Profile } from "@/lib/agent/types";
import { formatPrice } from "@/lib/format";

type DemoAction = "sale" | "recall" | "reset";

// Stage controls: each button POSTs /api/demo/<action>, then runs a check so the effect shows at once.
export function DemoBar({ profile, onApplied }: { profile: Profile | null; onApplied(): void }) {
  const [busy, setBusy] = useState<DemoAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { saleSku, salePct, recallId } = appConfig.demo;

  async function send(action: DemoAction, body: object) {
    setBusy(action);
    setError(null);
    try {
      const r = await fetch(`/api/demo/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Demo ${action} failed (${r.status})`);
      if (action === "reset") window.location.reload(); // client state (receipts, alerts) lives in the page
      else onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo request failed");
    } finally {
      setBusy(null);
    }
  }

  const p = profile?.policy;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-2 sm:px-6">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Demo</span>
      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => send("sale", { sku: saleSku, pct: salePct })}>
        Put stroller on sale −{salePct}%
      </Button>
      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => send("recall", { recallId })}>
        Publish recall
      </Button>
      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => send("reset", {})}>
        Reset demo
      </Button>
      {p && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">auto-buy ≤ {formatPrice(p.autoBuyLimit, appConfig.currency)}</Badge>
          <Badge variant="outline">autonomy: {p.autonomy}</Badge>
          <Badge variant={p.recallGuard ? "secondary" : "destructive"}>
            recall guard: {p.recallGuard ? "ON" : "OFF (naive)"} ({p.source === "statsig" ? "Statsig" : "default"})
          </Badge>
        </div>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
