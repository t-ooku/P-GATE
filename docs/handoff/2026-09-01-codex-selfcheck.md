# 2026-09-01 Codex startup self-check

- Checked at: `2026-09-01T12:24:10Z`
- Production health: HTTP 200, release `1.22.1`, `ok:true`, `missing:[]`, `weak:[]`; X/Instagram connected, Runway ready, and no database feature reported false.
- Open reliability incident: [#106](https://github.com/t-ooku/P-GATE/issues/106)
  - External contract: PASS
  - Real-user search SLI monitor: FAIL
  - Signal: `DEEP_CANARY_AI_CHAT_CONSECUTIVE:AI_CHAT_PRIMARY:CANARY_PROVIDER_TIMEOUT`
  - Query Structurer recovered from the preceding timeout; the latest AI-primary synthetic probe still exceeded its fixed five-second deadline.
  - Production source: `a4ca2ec35a562d258238019442979e99f8a0df70`
  - Verification run: [#673](https://github.com/t-ooku/P-GATE/actions/runs/33494780436)
- Public health, live assets, 13-mall registry, Yahoo! native ranking, and AI/Knowledge validation contracts passed. The synthetic timeout has no request ID.
- Google Cloud reported no broad severe incident. The exact provider-side cause is unconfirmed.
- The existing provider-failure path returns HTTP 200 and preserves signed 13-mall search links; a regression assertion was added for that contract.
- Recovery verification at `2026-09-01T13:08:02Z`: Query Structurer and AI chat primary both returned `PASS(CANARY_OK)`; the last 15 minutes had 2 starts, 3 completions, 0 degradation, 0 hard failures, and 0 backend failures. This was a manual retry of scheduled run #674, so it does not satisfy the three-original-run auto-close condition.
- Verification: 2,058 Worker regressions, 6 extension tests, 50 search-quality cases, and 1,256 marketplace-query cases passed.
- Claude-to-Codex handoff: no new file after `2026-08-19-claude-to-codex-restart.md`.
- No credential, production D1 data, search text, personal data, pricing, or policy value was read or changed.
