// Self-check for the reducer. Run: npm run check:agent (Node >= 22.18 strips TS types).
import assert from "node:assert/strict";
import { applyEvent } from "./reduce.ts";
import { initialRunState } from "./types.ts";

const at = "2026-01-01T00:00:00.000Z";
const step = (status) => ({ type: "step", step: { id: "s1", at, kind: "fetch", title: "Fetch", status } });
const cand = (verdict) => ({
  type: "candidate",
  candidate: { id: "c1", title: "X", vendor: "V", price: 1, currency: "USD", attributes: {}, verdict },
});
const decision = { candidateId: "c1", summary: "Pick c1" };

const events = [
  step("running"),
  step("ok"),
  cand("considering"),
  cand("selected"),
  { type: "decision", decision },
  { type: "done" },
];
const s = events.reduce(applyEvent, { ...initialRunState, status: "running" });

// (a) step upsert by id
assert.equal(s.steps.length, 1);
assert.equal(s.steps[0].status, "ok");
// (b) candidate upsert by id
assert.equal(s.candidates.length, 1);
assert.equal(s.candidates[0].verdict, "selected");
// (c) decision
assert.deepEqual(s.decision, decision);
// (e) done
assert.equal(s.status, "done");
// (f) every event appended in order
assert.equal(s.events.length, events.length);
assert.deepEqual(s.events, events);

// (d) error
const e = applyEvent(initialRunState, { type: "error", message: "boom" });
assert.equal(e.status, "error");
assert.equal(e.error, "boom");

// (g) input never mutated
assert.equal(initialRunState.events.length, 0);
assert.equal(initialRunState.steps.length, 0);
assert.equal(initialRunState.status, "idle");

console.log("check:agent OK");
