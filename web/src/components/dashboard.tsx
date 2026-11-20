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
import { Tabs } from "@base-ui/react/tabs";

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
      {/* Shop = what Maya sees; Admin = agent internals and stage controls (audit trail, runs, watch list, demo bar). */}
      <Tabs.Root defaultValue="shop" className="flex flex-1 flex-col">
        <Tabs.List className="flex gap-1 border-b px-4 lg:px-6">
          {[["shop", "Shop"], ["admin", "Admin"]].map(([value, label]) => (
            <Tabs.Tab
              key={value}
              value={value}
              className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active]:border-primary data-[active]:text-foreground data-[selected]:border-primary data-[selected]:text-foreground"
            >
              {label}
              {value === "admin" && state.error && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-destructive align-middle" aria-label="error" />}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="shop" className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <StatTiles state={state} />
          <RecallAlertsPanel recalls={state.recalls} lastTickAt={state.lastTickAt} />
          {!docked && <div className="h-[420px]">{chatPanel("card")}</div>}
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <MemoryPanel api={profile} recalls={state.recalls} />
            <div className="flex flex-col gap-6">
              <ApprovalsPanel
                approvals={state.approvals}
                approvalStates={state.approvalStates}
                missions={state.missions}
                onApprove={api.approve}
                onDecline={api.decline}
              />
              <ReceiptsPanel receipts={state.receipts} />
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="admin" className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          {appConfig.showDemoControls && (
            <div className="overflow-hidden rounded-lg border">
              <DemoBar
                profile={profile.profile}
                onApplied={() => {
                  profile.reload();
                  api.runNow();
                }}
              />
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
            <AuditTrail
              steps={state.steps}
              events={state.events}
              receipts={state.receipts}
              missions={state.missions}
              ticking={state.ticking}
              error={state.error}
            />
            <div className="flex flex-col gap-6">
              <RunsPanel runs={state.runs} />
              <MissionsPanel missions={state.missions} onAdd={api.addMission} />
            </div>
          </div>
        </Tabs.Panel>
      </Tabs.Root>
      <footer className="px-6 py-3 text-xs text-muted-foreground border-t">{appConfig.footerNote}</footer>
      </div>
      {docked && <aside className="sticky top-0 h-dvh w-[380px] shrink-0 self-start border-l bg-card">{chatPanel("plain")}</aside>}
    </div>
  );
}
