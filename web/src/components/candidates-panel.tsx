import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DecisionCard, formatPrice } from "@/components/decision-card";
import { cn } from "@/lib/utils";
import type { ActionState, Candidate, Decision, RunStatus, Verdict } from "@/lib/agent/types";

const verdictBadge: Record<Verdict, { label: string; variant: "default" | "destructive" | "secondary" }> = {
  selected: { label: "Selected", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  considering: { label: "Considering", variant: "secondary" },
};

export function CandidatesPanel({
  status,
  candidates,
  decision,
  action,
  onApprove,
}: {
  status: RunStatus;
  candidates: Candidate[];
  decision?: Decision;
  action: ActionState;
  onApprove: () => void;
}) {
  return (
    <section aria-labelledby="candidates-heading" className="flex flex-col gap-4">
      <h2 id="candidates-heading" className="text-base font-semibold">
        Candidates
      </h2>

      {decision && (
        <DecisionCard
          decision={decision}
          candidate={candidates.find((c) => c.id === decision.candidateId)}
          action={action}
          onApprove={onApprove}
        />
      )}

      {candidates.length === 0 ? (
        status === "running" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading candidates">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="mt-2 h-5 w-20 rounded-4xl" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : status === "error" ? (
          <p className="text-sm text-muted-foreground">No candidates were found before the run stopped.</p>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Candidates the agent considers will appear here, each with the reason it was picked or rejected.
          </div>
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {candidates.map((c) => (
            <li key={c.id}>
              <CandidateCard candidate={c} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CandidateCard({ candidate: c }: { candidate: Candidate }) {
  const badge = verdictBadge[c.verdict];
  return (
    <Card
      className={cn(
        "h-full",
        c.verdict === "rejected" && "opacity-70",
        c.verdict === "selected" && "ring-2 ring-primary",
      )}
    >
      {c.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary agent-supplied URLs; next/image would need remotePatterns
        <img src={c.imageUrl} alt={c.title} className="aspect-video w-full object-cover" />
      )}
      <CardHeader>
        <CardTitle className="line-clamp-2">
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
              {c.title}
            </a>
          ) : (
            c.title
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{c.vendor}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-lg font-semibold tabular-nums">{formatPrice(c)}</p>
        {Object.keys(c.attributes).length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {Object.entries(c.attributes).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto flex flex-col gap-1">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {c.reason && <p className="text-xs text-muted-foreground">{c.reason}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
