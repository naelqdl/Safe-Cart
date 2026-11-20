// Self-check for the reducer. Run: npm run check:agent (Node >= 22.18 strips TS types).
import assert from "node:assert/strict";
import { applyEvent, initialDashboardState } from "./reduce.ts";

const at = "2026-01-01T00:00:00.000Z";
const missions = [{ id: "m1", title: "Charger", maxPrice: 40, currency: "USD" }];
const init = initialDashboardState(missions);
assert.equal(init.missions[0].status, "watching");
assert.equal(init.checks, 0);
assert.equal(init.ticking, false);

const step = (status) => ({ type: "step", step: { id: "s1", at, kind: "search", title: "Check", status, missionId: "m1" } });
const candidate = { id: "c1", title: "X", vendor: "V", price: 34, currency: "USD", attributes: {}, verdict: "selected" };
const approval = { type: "approval", approval: { id: "a1", missionId: "m1", candidate, reason: "over limit", at } };
const receipt = {
  type: "receipt",
  receipt: { reference: "R1", missionId: "m1", candidateId: "c1", title: "Charger", amount: 34, currency: "USD", saved: 14, at, auto: true },
};
const events = [
  step("running"),
  step("ok"),
  approval,
  approval,
  receipt,
  { type: "mission", missionId: "m1", status: "done", note: "Bought" },
  { type: "mission", missionId: "nope", status: "waiting" },
  { type: "done" },
];
const s = events.reduce(applyEvent, init);

// step upsert by id
assert.equal(s.steps.length, 1);
assert.equal(s.steps[0].status, "ok");
// approval added once, with idle UI state
assert.equal(s.approvals.length, 1);
assert.deepEqual(s.approvalStates.a1, { status: "idle" });
// receipt appended
assert.equal(s.receipts.length, 1);
// mission updated; unknown id ignored
assert.equal(s.missions.length, 1);
assert.equal(s.missions[0].status, "done");
assert.equal(s.missions[0].note, "Bought");
assert.ok(s.missions[0].lastChecked);
// every event appended in order
assert.deepEqual(s.events, events);

// run upsert by id, newest last
const run = (status) => ({ type: "run", run: { id: "r1", status, steps: [], claims: [] } });
const r1 = [run("running"), run("done"), { type: "run", run: { id: "r2" } }].reduce(applyEvent, init);
assert.deepEqual(r1.runs.map((r) => r.id + r.status), ["r1done", "r2undefined"]);

// error
assert.equal(applyEvent(init, { type: "error", message: "boom" }).error, "boom");

// caps: events 500, steps 300 (oldest dropped)
let big = init;
for (let i = 0; i < 600; i++) big = applyEvent(big, { type: "step", step: { id: "s" + i, at, kind: "plan", title: "t", status: "ok" } });
assert.equal(big.events.length, 500);
assert.equal(big.steps.length, 300);
assert.equal(big.steps[0].id, "s300");

// input never mutated
assert.equal(init.events.length, 0);
assert.equal(init.steps.length, 0);
assert.equal(init.missions[0].status, "watching");

console.log("check:agent OK");
