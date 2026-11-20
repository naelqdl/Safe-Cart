import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";
import type { Approval, ApprovalUiState, MissionState } from "@/lib/agent/types";

export function ApprovalsPanel({
  approvals,
  approvalStates,
  missions,
  onApprove,
  onDecline,
}: {
  approvals: Approval[];
  approvalStates: Record<string, ApprovalUiState>;
  missions: MissionState[];
  onApprove(id: string): void;
  onDecline(id: string): void;
}) {
  const [verifying, setVerifying] = useState(false);
  // Demo stand-in for the Persona flow: pass or fail the SIMULATED inquiry, then retry the purchase.
  const resolve = async (id: string, outcome: "approved" | "declined") => {
    setVerifying(true);
    try {
      await fetch("/api/demo/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome }) });
      onApprove(id);
    } finally {
      setVerifying(false);
    }
  };
  return (
    <Card className={approvals.length > 0 ? "ring-2 ring-warning/50" : undefined}>
      <CardHeader>
        <CardTitle>Approvals</CardTitle>
        <CardAction>
          <Badge variant={approvals.length > 0 ? "warning" : "secondary"}>{approvals.length} waiting</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {approvals.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing needs you. The agent will ask here before going over your guardrails.
          </p>
        )}
        {/* always mounted so new approvals are announced */}
        <ul aria-live="polite" className="flex flex-col gap-3">
          {approvals.map((a) => {
            const ui = approvalStates[a.id] ?? { status: "idle" };
            const pending = ui.status === "pending";
            const mission = missions.find((m) => m.id === a.missionId);
            return (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-pretty">{a.candidate.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.candidate.vendor}
                      {mission && <> · for {mission.title}</>}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatPrice(a.candidate.price, a.candidate.currency)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{a.reason}</p>
                {ui.status === "error" && (
                  <Alert variant="destructive">
                    <AlertTitle>Purchase failed</AlertTitle>
                    <AlertDescription>{ui.message ?? "Try again."}</AlertDescription>
                  </Alert>
                )}
                {ui.status === "verify" && ui.verify && (
                  <Alert>
                    <ShieldCheck aria-hidden />
                    <AlertTitle>Identity check with Persona</AlertTitle>
                    <AlertDescription className="flex flex-col gap-2">
                      <span>{ui.message}</span>
                      <span className="font-mono text-xs">
                        Inquiry {ui.verify.inquiryId}
                        {ui.verify.simulated && " · SIMULATED (no Persona key)"}
                      </span>
                      {ui.verify.url && (
                        <a href={ui.verify.url} target="_blank" rel="noreferrer" className="w-fit font-medium text-primary hover:underline">
                          Verify with Persona, then press Approve again
                        </a>
                      )}
                      {ui.verify.simulated && (
                        <span className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={verifying || pending} onClick={() => resolve(a.id, "approved")}>
                            Pass check as Maya
                          </Button>
                          <Button size="sm" variant="ghost" disabled={verifying || pending} onClick={() => resolve(a.id, "declined")}>
                            Fail check
                          </Button>
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => onApprove(a.id)}>
                    {pending ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden />
                        Buying…
                      </>
                    ) : (
                      "Approve"
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDecline(a.id)}>
                    Decline
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
