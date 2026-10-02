# Codex self-check — 2026-10-03

- Checked at: 2026-10-03 08:25 JST
- Production health: healthy (`ok:true`, release `1.22.1`, missing 0, weak 0)
- Production source: `e5e3738220baa7d3b015ed5a1b0081efd904dc3f`
- Production Version ID: `745e128c-44d2-4aa9-ba26-b1880fc6d389`
- Latest production deploy: [run 37052891726](https://github.com/t-ooku/P-GATE/actions/runs/37052891726), success
- Working branch HEAD observed at start: `7cb917096dbd39df1b0dfbabfc2f1376848c29d0`; it is ahead of production and current-head CI was not yet verified.
- Reliability issue: [#369](https://github.com/t-ooku/P-GATE/issues/369) remains open because 2026-10-07 X/Instagram future inventory is missing. External contract and real-user search SLI pass; this is not a Seller runtime outage.
- Latest handoffs processed: Seller master, AI promotion progress, Cowork instructions, and Cowork-to-Claude handoff dated 2026-10-02/03.
- Latest read-only KPI artifact: generated 2026-10-03 04:17 JST. Seller candidates 246; send targets 184; current SENT 184; historical API-accepted 185 including one later opted out; response 0; external Seller accounts 0; external products 0. Delivered/bounce remain unavailable.
- General funnel (7d): landing 88, search 15, watch started 1, watch set 0, notification return 0, mall-click sessions 3. External general-user watches remain 0 after excluding 3 internal members.
- Seller promotion QA: unattended QA job completed; all text deliverables passed. QA store is not counted as external acquisition. R2 image binding remains absent, so image publication stays manual.
- Change prepared on isolated branch: remove stale “trial preparation” wording from creator recruitment copy and add regression coverage.
- No production D1 write, external outreach send, pricing/terms change, paid spend, or external publication was performed.
