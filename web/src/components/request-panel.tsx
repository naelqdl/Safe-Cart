"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { appConfig } from "@/config/app.config";
import type { RunStatus } from "@/lib/agent/types";

export function RequestPanel({
  status,
  query,
  onRun,
  onReset,
}: {
  status: RunStatus;
  query: string;
  onRun: (q: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(query);
  const running = status === "running";
  const canRun = !running && draft.trim().length > 0;

  function submit() {
    if (canRun) onRun(draft.trim());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="agent-request" className="text-sm font-medium">
            {appConfig.requestLabel}
          </label>
          <Textarea
            id="agent-request"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={appConfig.requestPlaceholder}
            rows={4}
            maxLength={2000}
            disabled={running}
          />
          <p className="text-xs text-muted-foreground">Ctrl/Cmd + Enter to run</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canRun}>
              {running ? "Running…" : "Run agent"}
            </Button>
            {(status === "done" || status === "error") && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft("");
                  onReset();
                }}
              >
                New request
              </Button>
            )}
          </div>
        </form>
        {appConfig.examplePrompts.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Try an example</p>
            <div className="flex flex-wrap gap-2">
              {appConfig.examplePrompts.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-7 py-1 text-left whitespace-normal"
                  disabled={running}
                  onClick={() => {
                    setDraft(prompt);
                    onRun(prompt);
                  }}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
