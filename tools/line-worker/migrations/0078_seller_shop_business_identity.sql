-- 2026-09-11 大隆さん指示: ショッププロフィールに事業者名と店舗住所を載せる。
-- 一般ECとして見たときの信用情報（特定商取引法の表示にも近い）。
-- 空のままなら表示しない。公開ページの PROFILE 折りたたみ内に出す。
ALTER TABLE seller_shops ADD COLUMN business_name TEXT NOT NULL DEFAULT '';
ALTER TABLE seller_shops ADD COLUMN business_address TEXT NOT NULL DEFAULT '';
