import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/format";
import type { RecallAlert } from "@/lib/agent/types";

// CPSC hazard text can be a paragraph; the alert shows its first sentence (full text on hover and in details).
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

function actionText(a: RecallAlert): string {
  switch (a.action) {
    case "refund_claim_filed":
      return `filed a refund claim${a.claimRef ? ` (${a.claimRef})` : ""}`;
    case "replacement_bought":
      return `filed a refund claim${a.claimRef ? ` (${a.claimRef})` : ""} and bought a safe replacement${a.replacementTitle ? `: ${a.replacementTitle}` : ""}`;
    case "purchase_skipped":
      return `skipped the purchase${a.replacementTitle ? ` and bought ${a.replacementTitle} instead` : ""}`;
    case "needs_you":
      return "needs your decision";
  }
}

export function RecallAlertsPanel({ recalls, lastTickAt }: { recalls: RecallAlert[]; lastTickAt?: string }) {
  if (recalls.length === 0) {
    return (
      <Alert variant="success">
        <ShieldCheck aria-hidden />
        <AlertTitle>No recalls affect Maya&apos;s items.</AlertTitle>
        <AlertDescription>{lastTickAt ? `Last checked ${formatTime(lastTickAt)}.` : "Not checked yet. Turn on Autopilot or press Check now."}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {recalls.map((a) => (
        <Alert key={a.id} variant="destructive">
          <ShieldAlert aria-hidden />
          <AlertTitle className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="min-w-0 truncate">Recalled: {a.itemTitle}</span>
            <Badge variant="destructive">{a.itemKind === "owned" ? "Maya owns this" : "On wishlist"}</Badge>
            <time dateTime={a.at} className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">{formatTime(a.at)}</time>
          </AlertTitle>
          <AlertDescription className="space-y-1 [&_p:not(:last-child)]:mb-0">
            <p className="font-medium text-success">SafeCart {actionText(a)}.</p>
            <p className="line-clamp-1 text-foreground" title={a.hazard}>Hazard: {firstSentence(a.hazard)}</p>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">Recall details</summary>
              <p className="mt-1">{a.recallTitle}</p>
              <p className="mt-1">Remedy: {a.remedy}</p>
              <a href={a.url} target="_blank" rel="noreferrer">CPSC notice</a>
            </details>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
