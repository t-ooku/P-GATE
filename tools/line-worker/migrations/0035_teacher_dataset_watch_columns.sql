-- CTO指示書v3.2 ⑥: Teacher DatasetはAIウォッチにも将来利用する。
-- 現時点ではカラムのみ追加し、ロジックへの接続は行わない
-- (docs/HOSHILU_AI_WATCH_FUTURE_DESIGN_v0.1.md §3参照)。
ALTER TABLE teacher_queries ADD COLUMN price_watch INTEGER CHECK(price_watch IS NULL OR price_watch IN (0,1));
ALTER TABLE teacher_queries ADD COLUMN stock_watch INTEGER CHECK(stock_watch IS NULL OR stock_watch IN (0,1));
ALTER TABLE teacher_queries ADD COLUMN coupon_watch INTEGER CHECK(coupon_watch IS NULL OR coupon_watch IN (0,1));
ALTER TABLE teacher_queries ADD COLUMN launch_watch INTEGER CHECK(launch_watch IS NULL OR launch_watch IN (0,1));
