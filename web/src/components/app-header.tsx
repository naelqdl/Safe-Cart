"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";

export function AutopilotControl({
  enabled,
  onToggle,
  secondsToNextCheck,
  ticking,
}: {
  enabled: boolean;
  onToggle(on: boolean): void;
  secondsToNextCheck: number;
  ticking: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Switch id="autopilot" checked={enabled} onCheckedChange={(on) => onToggle(on)} />
        <Label htmlFor="autopilot">Autopilot</Label>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        {ticking ? (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Checking…
          </>
        ) : enabled ? (
          `On · next check in ${secondsToNextCheck}s`
        ) : (
          "Off · the agent won't act"
        )}
      </p>
    </div>
  );
}

export function AppHeader({
  enabled,
  onToggle,
  secondsToNextCheck,
  ticking,
  onRunNow,
}: {
  enabled: boolean;
  onToggle(on: boolean): void;
  secondsToNextCheck: number;
  ticking: boolean;
  onRunNow(): void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{appConfig.name}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">{appConfig.tagline}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        {appConfig.sponsors.length > 0 && (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Powered by</span>
            <ul className="flex flex-wrap items-center gap-4">
              {appConfig.sponsors.map((sponsor) => {
                const mark = sponsor.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- static logos from /public; no next/image config needed
                  <img src={sponsor.logo} alt={sponsor.name} className="h-6 w-auto" />
                ) : (
                  <span className="text-sm font-medium text-foreground/70">{sponsor.name}</span>
                );
                return (
                  <li key={sponsor.name}>
                    {sponsor.url ? (
                      <a href={sponsor.url} target="_blank" rel="noreferrer" className="opacity-80 transition-opacity hover:opacity-100">
                        {mark}
                      </a>
                    ) : (
                      mark
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div
          className={cn(
            "flex items-center gap-4 rounded-lg px-3 py-2 ring-1 transition-colors",
            enabled ? "bg-primary/5 ring-primary/30" : "ring-border",
          )}
        >
          <AutopilotControl enabled={enabled} onToggle={onToggle} secondsToNextCheck={secondsToNextCheck} ticking={ticking} />
          <Button variant="outline" size="sm" disabled={ticking} onClick={onRunNow}>
            Check now
          </Button>
        </div>
      </div>
    </header>
  );
}
