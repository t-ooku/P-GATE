-- 2026-09-21 指示書 §35・§36「Seller営業を需要起点に」「Seller候補管理」。
--
-- 未充足の需要から「その需要に応えられそうなセラー」を探し、
-- 営業済／返信／無料登録／商品連携／DMC発生／有料化 まで1本で追えるようにする。
--
-- 既存の seller_outreach_contacts は「メールを送る箱」なので、そのまま残す。
-- こちらは「需要起点のパイプライン」で、同じ相手が複数の需要に紐づくことがある。
--
-- 入れるのは公開されている事業者向けの情報だけ（ショップ名・公開連絡先・商品URL）。
-- ユーザーの個人情報は入れない。需要は匿名集計のキーと人数だけを持つ。

CREATE TABLE IF NOT EXISTS seller_candidates (
  candidate_id TEXT PRIMARY KEY,
  -- どの需要に対する候補か（shop_demand_requests.demand_key の匿名キー）
  demand_key TEXT NOT NULL DEFAULT '',
  demand_label TEXT NOT NULL DEFAULT '',
  -- 記録した時点の人数。あとから変わるので「そのとき何人だったか」として残す
  demand_people INTEGER NOT NULL DEFAULT 0 CHECK (demand_people >= 0),
  shop_name TEXT NOT NULL,
  -- 公開されている事業者向けの連絡先・出典のみ
  contact_url TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  -- 契約に至ったら seller_billing_accounts と突き合わせるための鍵
  seller_key TEXT NOT NULL DEFAULT '',
  -- パイプラインの段階。後戻りもあり得るので順序は強制しない
  stage TEXT NOT NULL DEFAULT 'FOUND'
    CHECK (stage IN ('FOUND','CONTACTED','REPLIED','SIGNED_UP','PRODUCTS_LINKED','DMC_EARNED','PAID','DECLINED')),
  -- 各段階に「いつ入ったか」。空文字は「まだ」。0 や偽の日付を入れない
  contacted_at TEXT NOT NULL DEFAULT '',
  replied_at TEXT NOT NULL DEFAULT '',
  signed_up_at TEXT NOT NULL DEFAULT '',
  products_linked_at TEXT NOT NULL DEFAULT '',
  dmc_earned_at TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT '',
  declined_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 需要ごとに候補を並べる／段階ごとに残件を数える、の2つが主な読み方。
CREATE INDEX IF NOT EXISTS idx_seller_candidates_demand ON seller_candidates(demand_key, stage);
CREATE INDEX IF NOT EXISTS idx_seller_candidates_stage ON seller_candidates(stage, updated_at DESC);
-- 同じ需要に同じショップを二重登録しない
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_candidates_unique ON seller_candidates(demand_key, shop_name);
