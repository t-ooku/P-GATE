-- 2026-09-21 大隆さん指示書「成長・収益化 統合実装」§2〜§11: 「いつものホシル」。
-- 繰り返し買うもの（洗剤・コーヒー・ペットフード等）を HOSHILU が覚え、
-- なくなる頃に知らせる。残量管理はさせない。周期は本人の選択から始め、
-- 「買った！」の実績（購入間隔）で更新する。
--
-- member_wishes とは別テーブルにする理由:
--   ・購入履歴という 1対多 のデータを持つ（condition_snapshot の JSON では扱えない）
--   ・Seller 側の継続需要集計（§21 §23）が「次にいつ必要か」で索くため、索引の効く列が要る
--   ・探し中／値下がり待ち（member_wishes）とは寿命も更新契機も違う
--
-- 記録するのは商品の識別情報だけ。検索本文・検索単位IDは入れない（commit 916e379 の境界）。
CREATE TABLE IF NOT EXISTS member_usual_items (
  member_id TEXT NOT NULL,
  usual_id TEXT NOT NULL,
  -- 商品の識別。product_key は既存の値下がり待ちと同じ形（例 RAKUTEN:shop:12345）。
  product_key TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL DEFAULT '',
  marketplace TEXT NOT NULL DEFAULT '',
  -- 補充周期（日）。7/14/30/60 か本人の指定。
  cycle_days INTEGER NOT NULL CHECK (cycle_days >= 3 AND cycle_days <= 365),
  -- CHOSEN=本人が選んだまま / LEARNED=「買った！」の実績から更新した
  cycle_source TEXT NOT NULL DEFAULT 'CHOSEN' CHECK (cycle_source IN ('CHOSEN','LEARNED')),
  last_purchased_at TEXT,
  -- 次回の目安。last_purchased_at（無ければ created_at）+ cycle_days。索引で引くため保存する。
  next_due_at TEXT NOT NULL,
  -- §10 絶対これ / 同等品でもOK。true なら代替商品を提案しない。
  exact_only INTEGER NOT NULL DEFAULT 0 CHECK (exact_only IN (0,1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (member_id, usual_id)
);

-- 本人の「ホシル中」表示と「今週の補充」（§11）用。
CREATE INDEX IF NOT EXISTS idx_member_usual_due
  ON member_usual_items (member_id, status, next_due_at);

-- Seller 側の継続需要・需要予報（§21 §23）用。商品ごとに「いつ必要になる人が何人か」を索く。
-- 匿名集計の規則（最低5人・内部会員除外）は集計側で担保する。
CREATE INDEX IF NOT EXISTS idx_member_usual_demand
  ON member_usual_items (product_key, status, next_due_at);

-- 「買った！」の実績。周期の学習（§6）と「いつもの価格」（§9）の materials。
-- price_jpy は API で確認できた価格だけを入れる。推定価格は入れない（NULL のまま）。
CREATE TABLE IF NOT EXISTS member_usual_purchases (
  purchase_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  usual_id TEXT NOT NULL,
  purchased_at TEXT NOT NULL,
  price_jpy INTEGER CHECK (price_jpy IS NULL OR price_jpy > 0),
  marketplace TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_member_usual_purchases_item
  ON member_usual_purchases (member_id, usual_id, purchased_at DESC);
