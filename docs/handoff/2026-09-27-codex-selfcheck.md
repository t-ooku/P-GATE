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

## Seller 30-day follow-up (04:10 JST onwards)
- Fetched HEAD remains ec23353e at start; working tree clean. Health ok with no missing/weak settings, OAuth/Runway connected. #369 still contains the older Yahoo report; resolution is unverified.
- No newer Claude handoff. User's revised seller acquisition task supersedes the new calendar-three-month offer proposal only; existing promises remain protected.
- No migration, production SQL write, social publication or test charge performed.

## Seller marketing 30-day decision (04:47 JST)
- Current health ok, missing/weak empty, X/Instagram/Runway ready, database flags unchanged. #369 remains open with the previously observed Yahoo timeout; not claimed resolved. No newer Claude handoff than September 20.
- User explicitly approved updating SNS/LP/web recruitment wording to 30 days. Old individual promises stay intact. Production offer remains disabled pending prior migration/expiry approval and verification, so public copy announces the decision and says preparation is in progress.

## Seller copy correction (05:13 JST)
- User requested the plain sentence: 新規Sellerは商品公開から30日間無料。 Remove change-announcement phrasing from LP/FAQ/shared copy/SEO/social sources and generated Seller assets. Preserve activation status and existing promises.
- Health remains ok; incident #369 has no newer update than the previously observed Yahoo timeout. No new Claude handoff.

## Seller automatic renewal decision follow-up (14:50 JST user correction)
- GitHub branch read: 51e56b6831127938a6ab2d759a0bc378b426f6a3. Current /health fetch unavailable through this session's web retrieval; current health is UNVERIFIED, not inferred from earlier checks.
- #369 remains open with Yahoo coordinator timeout and excluded heartbeat self-reference. Yahoo recovery is UNVERIFIED; no incident repair or closure claimed.
- Latest Claude handoff is September 20; read its final correction (no further index investigation). Existing reranking/P1 items require status reconciliation before reimplementation.
- User changed future new-Seller policy to 30 days free from first approved product publication, then JPY 4,980/month automatically unless canceled by the trial deadline. Recorded in 2026-09-27-seller-30d-autorenew-approval-request.md. Existing commitments are not changed.
- Stop before policy publication or billing activation pending confirmation of mandatory payment-method registration at free-trial start, which conflicts with the previous no-payment-method decision. No runtime code, D1, Stripe, SNS, or deployed terms changed in this follow-up.

## Card-required auto-renew implementation (15:11 JST approval)
- Recovered source through public GitHub clone. /health now fetched successfully: ok=true, missing/weak empty, X/Instagram connected, Runway ready, database feature flags true. Prior unverified fetch is superseded for health only.
- #369 still has the older Yahoo report. Read-only aggregate recovery cannot be queried here without Cloudflare credentials; no repair or resolution claimed. No new Claude handoff beyond September 20.
- User explicitly approved mandatory card setup before trial. Implemented a new versioned flow; previous offers/contracts remain unchanged. New enrollment stays OFF until real Stripe test-mode and D1 verification. No real charge, migration, social send, or production SQL executed.
- See 2026-09-27-seller-30d-autorenew-approval-request.md for implementation, tests, and concrete rollout gaps.
