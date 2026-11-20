import type { AgentEvent } from "./types";

/** Reads an NDJSON body, calling onEvent per line. Returns true if a terminal (done/error) event arrived. */
export async function readNdjson(res: Response, onEvent: (e: AgentEvent) => void): Promise<boolean> {
  if (!res.body) return false;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;

  const handle = async (line: string) => {
    if (!line.trim()) return;
    let ev: AgentEvent;
    try {
      ev = JSON.parse(line) as AgentEvent;
    } catch {
      await reader.cancel().catch(() => {});
      throw new Error("Malformed event from agent");
    }
    onEvent(ev);
    if (ev.type === "done" || ev.type === "error") terminal = true;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) await handle(line);
  }
  await handle(buffer + decoder.decode());
  return terminal;
}
