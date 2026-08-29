# HOSHILU repository instructions

## Mandatory Codex session-start self-check

Before feature work, marketing work, scheduled work, or other repository tasks, Codex must spend no more than five minutes completing the startup self-check defined in [`docs/handoff/2026-08-25-codex-startup-selfcheck.md`](docs/handoff/2026-08-25-codex-startup-selfcheck.md).

The startup gate is mandatory for every Codex session working in this repository:

1. Fetch and inspect `https://hoshilu.app/health` using the failure conditions in the canonical rule. OAuth, Runway, and database checks live under `checks.x_oauth.connected`, `checks.instagram_oauth.connected`, `checks.runway_video_generation.ready`, and `checks.database_features.*`.
2. Inspect open GitHub Issues titled `[AUTO][HOSHILU] Production reliability incident`, excluding only the documented `GITHUB_SCHEDULE_HEARTBEAT_STALE` / `#49` self-reference failures.
3. Inspect new `docs/handoff/*-claude-to-codex-*.md` messages and add actionable requests to the work queue.

If a check cannot be completed because the network, GitHub authentication, or another dependency is unavailable, report it as **unverified**; do not treat it as healthy. For comparisons with a previous health state, use the latest reliable prior self-check or production-monitor evidence. If no reliable baseline exists, establish the initial baseline without claiming that a regression occurred.

Any detected incident takes priority over planned work. Codex may investigate and prepare a fix autonomously, but must stop before D1 migrations or production SQL writes, spending money, publishing to social media, or changing pricing or policy wording. Those actions require 大隆さん's approval and a handoff approval-request file. This 2026-08-25 approval boundary overrides any less restrictive wording in older incident-remediation documents.

When an incident exists, append a concise result to `docs/handoff/YYYY-MM-DD-codex-selfcheck.md`. Do not create a daily result file when all checks pass.
