"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appConfig } from "@/config/app.config";
import { formatPrice, formatTime } from "@/lib/format";
import type { MissionState, MissionStatus } from "@/lib/agent/types";

const statusBadge: Record<MissionStatus, { label: string; variant: "secondary" | "warning" | "success" }> = {
  watching: { label: "Watching", variant: "secondary" },
  waiting: { label: "Needs you", variant: "warning" },
  done: { label: "Done", variant: "success" },
};

export function MissionsPanel({ missions, onAdd }: { missions: MissionState[]; onAdd(title: string, maxPrice: number): void }) {
  const [title, setTitle] = useState("");
  const [max, setMax] = useState("");
  const maxPrice = Number(max);
  const valid = title.trim() !== "" && max !== "" && maxPrice > 0;
  const { autoBuyLimit, dailyBudget } = appConfig.guardrails;
  const cur = appConfig.currency;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Missions</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {missions.map((m) => {
            const badge = statusBadge[m.status];
            return (
              <li key={m.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{m.title}</span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">Max {formatPrice(m.maxPrice, m.currency)}</span>
                {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                {m.lastChecked && (
                  <time dateTime={m.lastChecked} className="text-xs text-muted-foreground tabular-nums">
                    Checked {formatTime(m.lastChecked)}
                  </time>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onAdd(title.trim(), maxPrice);
            setTitle("");
            setMax("");
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="mission-title" className="sr-only">Item to watch</Label>
            <Input id="mission-title" placeholder="Item to watch" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex w-24 flex-col gap-1.5">
            <Label htmlFor="mission-max" className="sr-only">Max price ({cur})</Label>
            <Input
              id="mission-max"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Max"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!valid}>Add</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Auto-buy up to {formatPrice(autoBuyLimit, cur)} · Daily budget {formatPrice(dailyBudget, cur)} · Checks every{" "}
          {appConfig.checkIntervalSeconds}s
        </p>
      </CardFooter>
    </Card>
  );
}
