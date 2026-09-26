# Codex startup self-check — 2026-09-27

- Production health: `ok: true`, release `1.22.1`, `missing: []`, `weak: []`.
- Open production reliability issue: #369. Its latest report predates HEAD `c09176bd` and records a Yahoo coordinator hop timeout plus a stale GitHub schedule heartbeat; confirm recovery in the next monitor run.
- User-reported search regression reproduced: `バッグ 白` treated boxed white wine as a bag because `バッグインボックス` matched the generic bag classifier. Production verification also exposed a skirt whose `バッグジップ` text meant a back zipper. Added evidence-gate exclusions and regression coverage while preserving wine-red bags, explicit wine-bottle carriers, and genuine zippered bags.
- No production data mutation or D1 write was performed.
