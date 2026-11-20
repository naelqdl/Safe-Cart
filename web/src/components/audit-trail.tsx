"use client";

import {
  CircleCheck,
  Download,
  FileText,
  ListChecks,
  Loader2,
  Scale,
  Search,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentEvent, AuditStep, MissionState, Receipt, StepKind, StepStatus } from "@/lib/agent/types";

const kindIcon: Record<StepKind, LucideIcon> = {
  plan: ListChecks,
  search: Search,
  fetch: FileText,
  compare: Scale,
  decide: CircleCheck,
  act: ShoppingCart,
};

const statusBadge: Record<StepStatus, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  running: { label: "Running", variant: "secondary" },
  ok: { label: "OK", variant: "outline" },
  warn: { label: "Check", variant: "secondary" },
  fail: { label: "Failed", variant: "destructive" },
};

function exportAudit(payload: { missions: MissionState[]; receipts: Receipt[]; events: AgentEvent[] }) {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...payload }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-${new Date().toISOString().replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditTrail({
  steps,
  events,
  receipts,
  missions,
  ticking,
  error,
}: {
  steps: AuditStep[];
  events: AgentEvent[];
  receipts: Receipt[];
  missions: MissionState[];
  ticking: boolean;
  error?: string;
}) {
  const missionTitle = new Map(missions.map((m) => [m.id, m.title]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity & audit trail</CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={events.length === 0}
            onClick={() => exportAudit({ missions, receipts, events })}
          >
            <Download />
            Export JSON
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96 lg:h-[36rem]">
          <div className="flex flex-col gap-4 pr-3">
            {ticking && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking missions…
              </p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Last check failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {steps.length === 0 && !ticking && (
              <p className="text-sm text-muted-foreground">
                Turn on Autopilot or press Check now. Every check, decision and purchase is logged here.
              </p>
            )}

            {/* always mounted so screen readers announce new steps; newest first */}
            <ol aria-live="polite" className={cn("flex flex-col gap-5", steps.length > 0 && "ml-3 border-l pl-5")}>
              {[...steps].reverse().map((step) => (
                <StepItem key={step.id} step={step} mission={step.missionId ? missionTitle.get(step.missionId) : undefined} />
              ))}
            </ol>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function StepItem({ step, mission }: { step: AuditStep; mission?: string }) {
  const Icon = kindIcon[step.kind];
  const badge = statusBadge[step.status];
  return (
    <li className="relative flex flex-col gap-1">
      <span className="absolute top-0 -left-[33px] flex size-6 items-center justify-center rounded-full border bg-background">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{step.title}</span>
        <Badge variant={badge.variant}>
          {step.status === "running" && <Loader2 className="animate-spin" aria-hidden />}
          {badge.label}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={step.at} className="tabular-nums">
          {formatTime(step.at)}
        </time>
        {mission && <span className="rounded-md bg-muted px-1.5 py-0.5">{mission}</span>}
      </div>
      {step.detail && <p className="text-sm text-muted-foreground">{step.detail}</p>}
      {step.sources && step.sources.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Sources">
          {step.sources.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-md border px-1.5 py-0.5 text-xs underline-offset-2 hover:bg-muted hover:underline"
                >
                  {s.label}
                </a>
              ) : (
                <span className="inline-flex rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
                  {s.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
