import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatTime } from "@/lib/format";
import type { RecallAlert } from "@/lib/agent/types";

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
      <Alert>
        <ShieldCheck aria-hidden />
        <AlertTitle>No recalls affect Maya&apos;s items.</AlertTitle>
        <AlertDescription>{lastTickAt ? `Last checked ${formatTime(lastTickAt)}.` : "Not checked yet. Turn on Autopilot or press Check now."}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {recalls.map((a) => (
        <Alert key={a.id} variant="destructive" className="border-destructive/50">
          <ShieldAlert aria-hidden />
          <AlertTitle>
            {a.itemTitle} was recalled ({a.hazard}). SafeCart {actionText(a)}.
          </AlertTitle>
          <AlertDescription>
            <span>
              {a.itemKind === "owned" ? "Item Maya owns" : "Wishlist item"} · {a.recallTitle} · Remedy: {a.remedy} ·{" "}
              <a href={a.url} target="_blank" rel="noreferrer">CPSC notice</a> · <time dateTime={a.at}>{formatTime(a.at)}</time>
            </span>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
