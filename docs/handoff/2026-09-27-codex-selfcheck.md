# Codex startup self-check — 2026-09-27

- Production health: `ok: true`, release `1.22.1`, `missing: []`, `weak: []`.
- Open production reliability issue: #369. Its latest report predates HEAD `c09176bd` and records a Yahoo coordinator hop timeout plus a stale GitHub schedule heartbeat; confirm recovery in the next monitor run.
- User-reported search regression reproduced: `バッグ 白` treated boxed white wine as a bag because `バッグインボックス` matched the generic bag classifier. Production verification also exposed a skirt whose `バッグジップ` text meant a back zipper. Added evidence-gate exclusions and regression coverage while preserving wine-red bags, explicit wine-bottle carriers, and genuine zippered bags.
- No production data mutation or D1 write was performed.

## Search latency follow-up

- Startup recheck: health remains healthy; #369 still contains the pre-`c09176bd` Yahoo timeout report. No newer Claude handoff than September 20.
- Before-change public API sample (`バッグ 白`, QA): HTTP 200 in 12.702 seconds from this execution environment. This single sample is not a production percentile.
- Google mall search previously started inside final response decoration, after live marketplace search. Start it once after the effective query is finalized and reuse that promise during decoration. Preserve query, provider budgets, result filtering and ranking.
- Seller priority and active shop lookups are independent and now run concurrently.
- Add a public API regression that holds the marketplace response until Google starts, verifies overlap, retained Google results, and no duplicate Google call.

## Seller recruitment page follow-up

- User requested removal of the IT Group FAQ; removed it from visible FAQ and FAQPage structured data.
- Public demand API returned all three public lanes with groups/people zero. These totals cover only privacy-qualified groups (at least five people), not all demand on HOSHILU.
- Hide lanes without publishable counts; label positive counts as public-scope counts. Empty-state copy explains the publication threshold without claiming overall demand is zero. Fetch failures have a separate message.
- Preserve underlying counts and privacy thresholds. No production D1 write, pricing change, or social publication.
- Focused tests: 25 passed, covering empty, mixed, escaped conditions and failed API responses.
