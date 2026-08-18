-- Runway月間クレジット上限を 3,000 → 6,000 へ引き上げる。
--
-- 経緯(2026-08-19、大隆さん承認済み):
--   - AI女優リールを週2〜3本(8秒=336クレジット/本)へ増やす決定。
--     週2本で月3,024となり、現行上限3,000では月末に必ず止まる。
--   - 課金はRunway APIのAuto Billing(残高が減ると自動購入、1,000クレジット=$10)
--     へ移行するため、支出の実質的な歯止めはRunway側ではなく
--     このHOSHILU側上限になる。6,000 = 実質約$60/月の支出上限。
--   - 週3本+やり直し20%(5,376)を通しつつ、暴走時は$60で必ず停止する。
--
-- 実効上限は min(この値, wrangler.jsonc の RUNWAY_MONTHLY_CREDIT_LIMIT) なので、
-- 同時に wrangler.jsonc 側も 6000 へ引き上げる(同一コミット)。
-- kill_switch・enabled・初回テスト上限(initial_cap_credits)は変更しない。
UPDATE runway_budget_policy
SET monthly_cap_credits = 6000,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE policy_id = 1
  AND monthly_cap_credits = 3000
  AND enabled = 1;
