-- 2026-09-17 大隆さん決定: SNS はリール週2回（火・金）＋カルーセル画像フィード週3回（月・水・土）。
-- カルーセルは複数画像なので、投稿キューに画像 URL の JSON 配列を持つ列を足す（既存列は変えない）。
ALTER TABLE social_post_queue ADD COLUMN media_urls TEXT NOT NULL DEFAULT '';
