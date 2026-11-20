import { formatPrice } from "@/lib/format";
import type { ChatReply, ChatRequest } from "@/lib/agent/types";

const reply = (text: string, actions: ChatReply["actions"] = []): ChatReply => ({ reply: text, actions });

// Deterministic keyword intents, first match wins (no LLM). Word boundaries keep "now" from matching "no".
export function runMockChat({ message, context }: ChatRequest): ChatReply {
  const msg = message.toLowerCase().trim();
  const { guardrails, currency, missions, receipts, recentSteps, autopilot } = context;
  const fmt = (n: number) => formatPrice(n, currency);
  const newest = [...context.approvals].sort((a, b) => b.at.localeCompare(a.at))[0];

  const m = msg.match(/\b(watch|find|buy|track|get)\s+(.+?)\s+(under|below|for|max|<)\s*\$?(\d+(\.\d+)?)/);
  if (m) {
    const t = m[2].replace(/^(a|an|the|some)\s+/, "").trim().slice(0, 60);
    const title = t.charAt(0).toUpperCase() + t.slice(1);
    const maxPrice = Number(m[4]);
    if (title && maxPrice > 0) {
      return reply(
        `Okay — I'll watch ${title} and buy it if it drops to ${fmt(maxPrice)} or less (auto-buy up to ${fmt(guardrails.autoBuyLimit)}).`,
        [{ type: "add_mission", title, maxPrice }],
      );
    }
  }
  if (/\b(pause|stop|turn off|disable)\b/.test(msg))
    return reply("Autopilot is off. I won't check or buy anything until you turn it back on.", [{ type: "set_autopilot", on: false }]);
  if (/\b(start|resume|turn on|enable|go)\b/.test(msg))
    return reply("Autopilot is on. I'll check your missions every few seconds.", [{ type: "set_autopilot", on: true }]);
  if (/\b(approve|yes|buy it|go ahead)\b/.test(msg))
    return newest
      ? reply(`Buying ${newest.candidate.title} for ${fmt(newest.candidate.price)} now.`, [{ type: "approve", approvalId: newest.id }])
      : reply("Nothing is waiting for your approval.");
  if (/\b(decline|no|skip|don't)\b/.test(msg))
    return newest
      ? reply(`Skipping ${newest.candidate.title}.`, [{ type: "decline", approvalId: newest.id }])
      : reply("Nothing is waiting for your approval.");
  if (/\b(check|look) (now|again)\b|\bscan\b/.test(msg)) return reply("Checking now.", [{ type: "check_now" }]);
  if (/(what|which).*(buy|bought|purchase)|receipts?|spent/.test(msg)) {
    if (!receipts.length) return reply("I haven't bought anything yet.");
    const total = receipts.reduce((s, r) => s + r.amount, 0);
    const list = receipts.slice(-3).reverse().map((r) => `${r.title} ${fmt(r.amount)} (${r.auto ? "auto" : "approved"})`).join(", ");
    return reply(`I've bought ${receipts.length} item${receipts.length === 1 ? "" : "s"}, ${fmt(total)} of your ${fmt(guardrails.dailyBudget)} daily budget: ${list}.`);
  }
  if (/\bwhy\b/.test(msg)) {
    const step = recentSteps.find((s) => s.kind === "decide" || s.kind === "act");
    if (!step) return reply("I haven't made a decision yet — turn on Autopilot or say “check now”.");
    const mission = missions.find((x) => x.id === step.missionId);
    return reply(`${step.title}. ${step.detail ?? ""}${mission ? ` (Mission: ${mission.title}.)` : ""}`.replace(/\s+/g, " ").trim());
  }
  if (/\b(status|missions?|watching)\b/.test(msg)) {
    const names = (done: boolean) => missions.filter((x) => (x.status === "done") === done).map((x) => x.title);
    const [w, d] = [names(false), names(true)];
    return reply(`Autopilot is ${autopilot ? "on" : "off"}. Watching ${w.length}${w.length ? `: ${w.join(", ")}` : ""}.${d.length ? ` Done: ${d.join(", ")}.` : ""}`);
  }
  return reply("I can watch items (“watch AirPods under $150”), pause or resume Autopilot, approve or decline a purchase, check now, or tell you what I bought and why.");
}
