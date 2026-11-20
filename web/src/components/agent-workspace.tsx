"use client";

import { AppHeader } from "@/components/app-header";
import { AuditTrail } from "@/components/audit-trail";
import { CandidatesPanel } from "@/components/candidates-panel";
import { RequestPanel } from "@/components/request-panel";
import { appConfig } from "@/config/app.config";
import { useAgentRun } from "@/hooks/use-agent-run";

export function AgentWorkspace() {
  const { state, action, run, reset, approve } = useAgentRun();

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      {/* Below lg the panels stack: Request, Candidates, Audit trail */}
      <main className="flex-1 grid gap-6 p-4 lg:p-6 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <RequestPanel status={state.status} query={state.query} onRun={run} onReset={reset} />
        <CandidatesPanel
          status={state.status}
          candidates={state.candidates}
          decision={state.status === "done" ? state.decision : undefined}
          action={action}
          onApprove={approve}
        />
        <AuditTrail state={state} action={action} />
      </main>
      <footer className="px-6 py-3 text-xs text-muted-foreground border-t">{appConfig.footerNote}</footer>
    </div>
  );
}
