"use client";

import { AutopilotControl } from "@/components/app-header";
import { ChatPanel } from "@/components/chat-panel";
import { Badge } from "@/components/ui/badge";
import { appConfig } from "@/config/app.config";
import type { AutopilotApi } from "@/lib/agent/types";
import type { useChat } from "@/hooks/use-chat";

// Small-window layout: slim header + chat only.
export function CompactView({ api, chat }: { api: AutopilotApi; chat: ReturnType<typeof useChat> }) {
  const { state } = api;
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-sm font-semibold">{appConfig.name}</h1>
          {state.approvals.length > 0 && <Badge variant="warning">{state.approvals.length} waiting</Badge>}
        </div>
        <AutopilotControl enabled={api.enabled} onToggle={api.setEnabled} secondsToNextCheck={api.secondsToNextCheck} ticking={state.ticking} />
      </header>
      <div className="min-h-0 flex-1 pt-3">
        <ChatPanel variant="plain" {...chat} onSend={chat.send} approvals={state.approvals} approvalStates={state.approvalStates} onApprove={api.approve} onDecline={api.decline} />
      </div>
    </div>
  );
}
