-- CTO指示書v3.4 追補 Priority1: AIウォッチ通知は商品単位で表示する必要がある。
-- 実際の価格監視イベント検出(将来のバックエンド連携)はローンチ後の対応で
-- 良いとの合意のもと、まずは商品を特定するための列だけを追加する。
ALTER TABLE mywatch_notifications ADD COLUMN asin TEXT NOT NULL DEFAULT '';
ALTER TABLE mywatch_notifications ADD COLUMN marketplace TEXT NOT NULL DEFAULT '';
ALTER TABLE mywatch_notifications ADD COLUMN image_url TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS mywatch_notifications_asin
  ON mywatch_notifications(member_id, asin);
