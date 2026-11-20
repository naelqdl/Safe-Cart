"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appConfig } from "@/config/app.config";
import type { ActionState, Candidate, Decision } from "@/lib/agent/types";

export function formatPrice(c: Pick<Candidate, "price" | "currency">) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: c.currency }).format(c.price);
}

export function DecisionCard({
  decision,
  candidate,
  action,
  onApprove,
}: {
  decision: Decision;
  candidate?: Candidate;
  action: ActionState;
  onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = decision.actionLabel ?? appConfig.actionLabel;
  const price = candidate ? formatPrice(candidate) : undefined;

  return (
    <Card className="border border-primary ring-0">
      <CardHeader>
        <CardTitle>Agent recommendation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>{decision.summary}</p>
        {candidate && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2">
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{candidate.title}</p>
              <p className="text-muted-foreground">{candidate.vendor}</p>
            </div>
            <p className="font-semibold tabular-nums">{price}</p>
          </div>
        )}

        {action.status === "success" && (
          <Alert>
            <AlertTitle>Done</AlertTitle>
            <AlertDescription>
              <p>{action.result.message}</p>
              {action.result.reference && <p className="font-mono">Reference: {action.result.reference}</p>}
            </AlertDescription>
          </Alert>
        )}
        {action.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{action.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {action.status !== "success" && (
        <CardFooter className="gap-2">
          {action.status === "idle" && <Button onClick={() => setOpen(true)}>{label}</Button>}
          {action.status === "pending" && <Button disabled>Working…</Button>}
          {action.status === "error" && (
            <Button variant="outline" onClick={onApprove}>
              Retry
            </Button>
          )}
        </CardFooter>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm action</DialogTitle>
            <DialogDescription>
              The agent will {label.toLowerCase()} for &quot;{candidate?.title ?? decision.candidateId}&quot;
              {price ? ` at ${price}` : ""}. This is recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                onApprove();
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
