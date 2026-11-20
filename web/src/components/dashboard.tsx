"use client";

import { AppHeader } from "@/components/app-header";
import { ApprovalsPanel } from "@/components/approvals-panel";
import { ChatPanel } from "@/components/chat-panel";
import { CompactView } from "@/components/compact-view";
import { DemoBar } from "@/components/demo-bar";
import { MemoryPanel } from "@/components/memory-panel";
import { RecallAlertsPanel } from "@/components/recall-alerts-panel";
import { AuditTrail } from "@/components/audit-trail";
import { MissionsPanel } from "@/components/missions-panel";
import { RunsPanel } from "@/components/runs-panel";
import { ReceiptsPanel } from "@/components/receipts-panel";
import { StatTiles } from "@/components/stat-tiles";
import { appConfig } from "@/config/app.config";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useChat } from "@/hooks/use-chat";
import { useProfile } from "@/hooks/use-profile";
import { useCompact, useMedia } from "@/hooks/use-compact";
import { useEffect } from "react";

export function Dashboard() {
  const api = useAutopilot();
  const chat = useChat(api);
  const compact = useCompact();
  const docked = useMedia("(min-width: 1280px)");
  const { state } = api;
  const profile = useProfile(state.checks);
  const { syncWishlist } = api;
  const wishlist = profile.profile?.wishlist;
  useEffect(() => {
    if (wishlist) syncWishlist(wishlist);
  }, [wishlist, syncWishlist]);

  if (compact) return <CompactView api={api} chat={chat} />;

  const chatPanel = (variant: "card" | "plain") => (
    <ChatPanel
      variant={variant}
      messages={chat.messages}
      sending={chat.sending}
      onSend={chat.send}
      approvals={state.approvals}
      approvalStates={state.approvalStates}
      onApprove={api.approve}
      onDecline={api.decline}
    />
  );

  return (
    <div className="flex">
      <div className="min-h-screen min-w-0 flex-1 flex flex-col">
      <AppHeader
        enabled={api.enabled}
        onToggle={api.setEnabled}
        secondsToNextCheck={api.secondsToNextCheck}
        ticking={state.ticking}
        onRunNow={api.runNow}
      />
      {appConfig.showDemoControls && (
        <DemoBar
          profile={profile.profile}
          onApplied={() => {
            profile.reload();
            api.runNow();
          }}
        />
      )}
      <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <StatTiles state={state} />
        <RecallAlertsPanel recalls={state.recalls} lastTickAt={state.lastTickAt} />
        {!docked && <div className="h-[420px]">{chatPanel("card")}</div>}
        {/* Below lg the column-3 wrapper is display:contents so items stack: approvals, missions, audit, receipts */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <div className="order-2 lg:order-1">
            <div className="flex flex-col gap-6">
              <MemoryPanel api={profile} recalls={state.recalls} />
              <MissionsPanel missions={state.missions} onAdd={api.addMission} />
              <RunsPanel runs={state.runs} />
            </div>
          </div>
          <div className="order-3 lg:order-2">
            <AuditTrail
              steps={state.steps}
              events={state.events}
              receipts={state.receipts}
              missions={state.missions}
              ticking={state.ticking}
              error={state.error}
            />
          </div>
          <div className="contents lg:order-3 lg:flex lg:flex-col lg:gap-6">
            <div className="order-1">
              <ApprovalsPanel
                approvals={state.approvals}
                approvalStates={state.approvalStates}
                missions={state.missions}
                onApprove={api.approve}
                onDecline={api.decline}
              />
            </div>
            <div className="order-4">
              <ReceiptsPanel receipts={state.receipts} />
            </div>
          </div>
        </div>
      </main>
      <footer className="px-6 py-3 text-xs text-muted-foreground border-t">{appConfig.footerNote}</footer>
      </div>
      {docked && <aside className="sticky top-0 h-dvh w-[380px] shrink-0 self-start border-l">{chatPanel("plain")}</aside>}
    </div>
  );
}
