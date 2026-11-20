"use client";

import { useEffect, useRef } from "react";
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
import { cn } from "@/lib/utils";
import type { ActionState, AuditStep, RunState, StepKind, StepStatus } from "@/lib/agent/types";

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

function exportAudit(state: RunState, action: ActionState) {
  const payload = {
    query: state.query,
    startedAt: state.startedAt,
    exportedAt: new Date().toISOString(),
    events: state.events,
    action,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-${new Date().toISOString().replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditTrail({ state, action }: { state: RunState; action: ActionState }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [state.steps.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit trail</CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={state.events.length === 0}
            onClick={() => exportAudit(state, action)}
          >
            <Download />
            Export JSON
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96 lg:h-[calc(100vh-12rem)]">
          <div className="flex flex-col gap-4 pr-3">
            {state.steps.length === 0 && state.status === "idle" && (
              <p className="text-sm text-muted-foreground">
                Every step the agent takes, and the source it used, is logged here.
              </p>
            )}

            {/* always mounted so screen readers announce the first step */}
            <ol aria-live="polite" className={cn("flex flex-col gap-5", state.steps.length > 0 && "ml-3 border-l pl-5")}>
              {state.steps.map((step) => (
                <StepItem key={step.id} step={step} />
              ))}
            </ol>

            {state.status === "running" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Agent is working…
              </p>
            )}
            {state.status === "error" && (
              <Alert variant="destructive">
                <AlertTitle>Run stopped</AlertTitle>
                <AlertDescription>{state.error ?? "The agent stopped unexpectedly."}</AlertDescription>
              </Alert>
            )}
            {state.status === "done" && (
              <p className="text-sm text-muted-foreground">{state.steps.length} steps logged</p>
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function StepItem({ step }: { step: AuditStep }) {
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
      <time dateTime={step.at} className="text-xs text-muted-foreground tabular-nums">
        {new Date(step.at).toLocaleTimeString()}
      </time>
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
