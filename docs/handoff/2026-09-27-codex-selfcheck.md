# Codex startup self-check — 2026-09-27

- Production health: `ok: true`, release `1.22.1`, `missing: []`, `weak: []`.
- Open production reliability issue: #369. Its latest report predates HEAD `c09176bd` and records a Yahoo coordinator hop timeout plus a stale GitHub schedule heartbeat; confirm recovery in the next monitor run.
- User-reported search regression reproduced: `バッグ 白` treated boxed white wine as a bag because `バッグインボックス` matched the generic bag classifier. Added an evidence-gate exclusion and regression coverage while preserving wine-red bags and explicit wine-bottle carriers.
- No production data mutation or D1 write was performed.
