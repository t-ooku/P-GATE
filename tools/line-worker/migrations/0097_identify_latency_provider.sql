-- 2026-11-14 Cowork 依頼（写真検索をレンズ水準に近づける 第1段 その1）:
-- 「これですか？」をどの経路で出したか・どこで落ちたかを後から数えられるようにする。
-- 残すのは固定語彙だけ（経路名・段階付き診断コード・入力の種類）。写真・検索語・
-- 商品名・会員ID・セッションIDは入れない。消す期間は既存と同じ14日。
-- 適用は承認が要る操作（apply-d1-migrations.yml）。未適用の間、Worker は従来の列だけで書く。
ALTER TABLE identify_latency_log ADD COLUMN provider TEXT NOT NULL DEFAULT '';
ALTER TABLE identify_latency_log ADD COLUMN diagnostic TEXT NOT NULL DEFAULT '';
ALTER TABLE identify_latency_log ADD COLUMN input_kind TEXT NOT NULL DEFAULT '';
