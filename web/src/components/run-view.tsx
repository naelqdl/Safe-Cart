"use client";

import { useState } from "react";
import {
  ChevronDown, ClipboardCheck, CreditCard, FileText, Gavel, Search, ShieldAlert, ShieldCheck, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatTime } from "@/lib/format";
import type { Claim, Run, Step } from "@/lib/agent/trail";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<Step["kind"], LucideIcon> = {
  retrieve: Search, extract: FileText, verify: ShieldCheck, policy: ClipboardCheck, decide: Gavel, guard: ShieldAlert, act: CreditCard,
};
const STATUS_COLOR: Record<Step["status"], string> = {
  ok: "text-emerald-600 dark:text-emerald-400", warn: "text-amber-600 dark:text-amber-400",
  blocked: "text-destructive", error: "text-destructive",
};
const VERDICT_COLOR: Record<Claim["verdict"], string> = {
  verified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  conflict: "bg-destructive/10 text-destructive",
  unsupported: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  not_verifiable: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
};
const MODE_COLOR = { real: "bg-destructive text-white", test: "bg-amber-500 text-black", simulated: "bg-sky-600 text-white" } as const;
const usd = (n: number) => formatPrice(n, "USD");
const label = (s: string) => s.replace(/_/g, " ");

export const hasInjection = (run: Run) => run.steps.some((s) => s.flags?.includes("injection_blocked"));

function ClaimItem({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <button
        type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", claim.loadBearing && "font-semibold")}>{claim.text}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            <Badge variant="outline">{claim.trust}</Badge>
            <Badge className={VERDICT_COLOR[claim.verdict]}>{label(claim.verdict)}</Badge>
            {claim.loadBearing && <Badge variant="secondary">load-bearing</Badge>}
          </span>
        </span>
      </button>
      {open && (
        <ul className="mt-2 ml-6 space-y-2 border-l pl-3 text-xs">
          {claim.sources.length === 0 && <li className="text-muted-foreground">No sources found for this claim.</li>}
          {claim.sources.map((s, i) => (
            <li key={i} className="space-y-0.5">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">{s.label}</a>
              ) : (
                <span className="font-medium">{s.label}</span>
              )}
              {s.snippet && <p className="text-muted-foreground">&ldquo;{s.snippet}&rdquo;</p>}
              {s.senso && (
                <p className="font-mono text-muted-foreground">
                  senso content {s.senso.contentId} · version {s.senso.versionId} · score {s.senso.score}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function FsaPanel({ fsa }: { fsa: NonNullable<Run["fsa"]> }) {
  const tiles = [
    ["Balance", fsa.balanceUsd], ["Carryover (" + fsa.planDocVersion + ")", fsa.carryoverUsd],
    ["At risk", fsa.atRiskUsd], ["Spent", fsa.spentUsd], ["Left", fsa.leftUsd],
  ] as const;
  const pct = fsa.atRiskUsd > 0 ? Math.min(100, (fsa.spentUsd / fsa.atRiskUsd) * 100) : 0;
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{usd(v)}</dd>
            </div>
          ))}
        </dl>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Spent ${usd(fsa.spentUsd)} of ${usd(fsa.atRiskUsd)} at risk`}>
            <div className="h-full bg-emerald-500" style={{ width: pct + "%" }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">Spent {usd(fsa.spentUsd)} of {usd(fsa.atRiskUsd)} at risk</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function RunView({ run }: { run: Run }) {
  const { mandate, action } = run;
  return (
    <div className="space-y-4">
      {hasInjection(run) && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>Blocked an instruction hidden in an untrusted source</AlertTitle>
          <AlertDescription>The agent treated it as data, dropped the source and replanned.</AlertDescription>
        </Alert>
      )}
      {run.fsa && <FsaPanel fsa={run.fsa} />}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-lg font-medium">{mandate.goal}</h3>
          <Badge variant={run.status === "done" ? "secondary" : run.status === "running" ? "outline" : "destructive"}>{run.status}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Max {usd(mandate.maxUsd)}</span>
          {mandate.constraints.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
          <span className="tabular-nums">· Cost ${run.cost.usd.toFixed(4)} · {run.cost.tokens.toLocaleString("en-US")} tokens</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <Card size="sm">
          <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {run.steps.map((s) => {
                const Icon = KIND_ICON[s.kind];
                return (
                  <li key={s.id} className="flex gap-2">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={s.kind} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm">{s.title}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                        <time dateTime={s.t}>{formatTime(s.t)}</time>
                        {(s.model || s.tool) && <span className="font-mono">{s.model ?? s.tool}</span>}
                        {s.latencyMs != null && <span>{s.latencyMs} ms</span>}
                        {s.costUsd != null && <span>${s.costUsd.toFixed(4)}</span>}
                        <span className={cn("font-medium", STATUS_COLOR[s.status])}>{s.status}</span>
                        {s.flags?.map((f) => <Badge key={f} variant="destructive">{label(f)}</Badge>)}
                      </p>
                      {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card size="sm">
            <CardHeader><CardTitle>Claims</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">{run.claims.map((c) => <ClaimItem key={c.id} claim={c} />)}</ul>
            </CardContent>
          </Card>
          {run.decision && (
            <Card size="sm">
              <CardHeader><CardTitle>Decision</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{run.decision.chosen}</p>
                <p className="text-muted-foreground">{run.decision.rationale}</p>
                <ul className="space-y-1.5">
                  {run.decision.alternatives.map((a) => (
                    <li key={a.name} className="text-xs">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-muted-foreground"> · why not: {a.whyNot}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {action && (
            <Card size="sm">
              <CardHeader><CardTitle>Receipt</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className={MODE_COLOR[action.mode]}>{action.mode.toUpperCase()}</Badge>
                  <span className="capitalize">{action.kind}</span>
                  <span className="text-muted-foreground">· {action.status}</span>
                </div>
                <p className="font-mono text-xs break-all">{action.ref}</p>
                {action.amountUsd != null && (
                  <p className="tabular-nums">
                    {usd(action.amountUsd)} <span className="text-muted-foreground">of {usd(mandate.maxUsd)} max</span>
                    {action.amountUsd > mandate.maxUsd && (
                      <span className="ml-2 inline-flex items-center gap-1 text-destructive"><TriangleAlert className="size-3.5" />over mandate</span>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
