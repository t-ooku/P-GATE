# 2026-08-31 Codex startup self-check

- Checked at: `2026-08-31T02:37:28Z`
- Production health: HTTP 200, release `1.22.1`, `ok:true`, `missing:[]`, `weak:[]`; X/Instagram connected, Runway ready, all 32 database features true.
- Open reliability incident: [#106](https://github.com/t-ooku/P-GATE/issues/106)
  - External contract: PASS
  - Real-user search SLI: FAIL
  - Signal: `DEEP_CANARY_NON_TRANSIENT_IMMEDIATE:YAHOO:CANARY_PROVIDER_AUTH_FAILED`
  - Latest failed run: [#660](https://github.com/t-ooku/P-GATE/actions/runs/33345116223)
  - Production source: `6c67d37c78dcb6bacacd7490fb59bc0a52cc7fb4`
- Prior incident #100 auto-closed after three consecutive successful checks at `2026-08-30T23:23:39Z`; the Yahoo authentication failure subsequently recurred as #106.
- Claude-to-Codex handoff: no new file after `2026-08-19-claude-to-codex-restart.md`.
- No production mutation was performed by this check; no credential value was displayed.

## Recovery verification correction

- Checked at: `2026-08-31T14:35:51Z`
- Production health and the Yahoo!/Rakuten deep canaries are currently passing; no `search_dead_end`, Worker failure, degradation, or SLO violation was observed in the latest completed monitor.
- Incident #106 was closed after the recovery helper incorrectly counted manual reruns (`run_attempt` 16 and 2) as distinct scheduled successes.
- The recovery helper now requires attempt 1 of three new `schedule` runs after `Last detected`; manual reruns and workflow dispatches cannot close an incident.
- Targeted regression tests, all 2,040 Worker tests, the 50-case search baseline, and 1,256 marketplace-query cases passed.
- No credential, production D1 data, search text, or personal data was read or changed.
