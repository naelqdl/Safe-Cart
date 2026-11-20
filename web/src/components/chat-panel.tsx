"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatTime } from "@/lib/format";
import type { Approval, ApprovalUiState, ChatMessage } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

const CHIPS = ["What did you buy?", "Check now", "Pause"];

export function ChatPanel({
  messages, sending, onSend, approvals, approvalStates, onApprove, onDecline, variant = "card",
}: {
  messages: ChatMessage[];
  sending: boolean;
  onSend(text: string): void;
  approvals: Approval[];
  approvalStates: Record<string, ApprovalUiState>;
  onApprove(id: string): void;
  onDecline(id: string): void;
  variant?: "card" | "plain";
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const submit = () => {
    const t = text.trim();
    if (!t || sending) return;
    onSend(t);
    setText("");
  };

  const body = (
    <>
      <h2 className={cn("px-4 text-sm font-medium", variant === "plain" && "border-b py-3")}>Chat with your agent</h2>
      <div ref={listRef} role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-1">
        {messages.map((m) => {
          const user = m.role === "user";
          const pending = !!m.approvalId && approvals.some((a) => a.id === m.approvalId);
          const st = m.approvalId ? approvalStates[m.approvalId] : undefined;
          return (
            <div key={m.id} className={cn("flex max-w-[85%] flex-col gap-1", user ? "self-end items-end" : "self-start items-start")}>
              <div className={cn("rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words", user ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.text}
              </div>
              {m.approvalId && !pending && <p className="text-xs text-muted-foreground">Handled</p>}
              {m.approvalId && pending && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Button size="sm" disabled={!pending || st?.status === "pending"} onClick={() => onApprove(m.approvalId!)}>
                      {st?.status === "pending" ? "Buying…" : "Approve"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={!pending || st?.status === "pending"} onClick={() => onDecline(m.approvalId!)}>
                      Decline
                    </Button>
                  </div>
                  {pending && st?.status === "error" && <p className="text-xs text-destructive">{st.message}</p>}
                </div>
              )}
              <time dateTime={m.at} className="text-xs text-muted-foreground tabular-nums">{formatTime(m.at)}</time>
            </div>
          );
        })}
        {sending && (
          <div className="self-start rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground" aria-label="The agent is typing">
            <span className="animate-pulse">…</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 px-4">
        {!sending && (
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <Button key={c} size="sm" variant="outline" className="rounded-full" onClick={() => onSend(c)}>
                {c}
              </Button>
            ))}
          </div>
        )}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Textarea
            aria-label="Message the agent"
            rows={1}
            value={text}
            maxLength={1000}
            placeholder="Message the agent…"
            className="min-h-9 max-h-[5.5rem] resize-none"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button type="submit" size="icon" disabled={sending || !text.trim()}>
            <SendHorizontal aria-hidden />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </>
  );

  return variant === "card" ? (
    <Card className="h-full">{body}</Card>
  ) : (
    <section className="flex h-full min-h-0 flex-col gap-3 pb-3">{body}</section>
  );
}
