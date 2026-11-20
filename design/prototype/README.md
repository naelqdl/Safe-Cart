# design/prototype: SafeCart Autopilot UI (cc)

A standalone, no-build prototype of the dashboard. It's connected live to the agent backend (`server/` on :8000).
- **Left stage (Waymo-style sensor view):** a dark dot-grid with a radar sweep while the agent works, an overlay card for the most important event (recall > injection > purchase), a "currently reading" target card, a telemetry feed of real agent steps, and a 4-stage pipeline (Perceive, Verify, Decide, Act).
- **Right panel (configurator-style):** Wishlist / Owned / Receipts tabs, a big-number trio, 52px option rows (1px #d0d1d2; 2px black when purchased; red rule when recalled), the purchase policy, Autopilot and Recall-guard switches, the single blue CTA, and demo controls.
- **Audit trail sheet:** open it from the run dots or a receipt. It shows the decision with Claude's rationale, the payment ref, claims with trust and verdict and cited sources, and every step with model, latency and cost.

Open fonts only (Figtree, Inter, JetBrains Mono). No Tesla or Waymo fonts, logos or imagery.

```bash
cd design/prototype && python3 -m http.server 5174   # then open http://localhost:5174 (?api=http://host:8000 to point elsewhere)
```
