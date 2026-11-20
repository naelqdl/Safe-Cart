"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hasInjection, RunView } from "@/components/run-view";
import { formatTime } from "@/lib/format";
import type { Run } from "@/lib/agent/trail";

export function RunsPanel({ runs }: { runs: Run[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = runs.find((r) => r.id === openId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Each autonomous run will appear here with its claims, decision and receipt.</p>
        ) : (
          <ul className="divide-y">
            {[...runs].reverse().map((r) => (
              <li key={r.id} className="first:pt-0 last:pb-0">
                <button
                  type="button" onClick={() => setOpenId(r.id)}
                  className="flex w-full flex-col gap-1 rounded-md py-3 text-left outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 first:pt-0"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium" title={r.mandate.goal}>{r.mandate.goal}</span>
                    <Badge variant={r.status === "done" ? "success" : r.status === "running" ? "outline" : "destructive"}>{r.status}</Badge>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    {/* server and browser time zones can differ (seeded demo runs render on the server) */}
                  <time dateTime={r.startedAt} suppressHydrationWarning>{formatTime(r.startedAt)}</time>
                    <span>{r.steps.length} steps</span>
                    <span>${r.cost.usd.toFixed(4)}</span>
                    {hasInjection(r) && <Badge variant="destructive">injection blocked</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Run details</DialogTitle>
            <DialogDescription>Audit trail: what the agent did, what it believed, why it chose, what it spent.</DialogDescription>
          </DialogHeader>
          {open && <RunView run={open} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
