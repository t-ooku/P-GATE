-- 2026-09-04 大隆さん指示「請求・決済の自動化して」「全部前払いね」
-- Seller料金（無料＝ジャンル定価／Business ¥9,800＝定価の50%＋毎月5,000円分まで0円）を
-- Stripe で前払い運用するための台帳。
--   月額 ¥9,800  : Stripe Subscription（期間開始時に前払い、登録後3か月はトライアル＝0円）
--   送客料       : 前払い残高（seller_billing_wallets）から有効クリックごとに消化。
--                  Business は毎月5,000円分の無料枠を先に消化し、残高はその後。
--   チャージ     : Stripe Checkout（カード／銀行振込）。入金確認後に残高へ加算。
-- 既存の seller_billing_wallets / seller_qualified_click_charges はそのまま使う。

CREATE TABLE IF NOT EXISTS seller_billing_accounts (
  seller_key TEXT PRIMARY KEY,
  account_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  tenants TEXT NOT NULL DEFAULT '[]',
  plan TEXT NOT NULL CHECK(plan IN ('BUSINESS','SELLER')),
  payment_preference TEXT NOT NULL DEFAULT 'CARD' CHECK(payment_preference IN ('CARD','BANK_TRANSFER')),
  stripe_customer_id TEXT NOT NULL DEFAULT '',
  stripe_subscription_id TEXT NOT NULL DEFAULT '',
  subscription_status TEXT NOT NULL DEFAULT 'NONE',
  trial_end_at TEXT NOT NULL DEFAULT '',
  current_period_end_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK(status IN ('PENDING_PAYMENT','ACTIVE','SUSPENDED_UNPAID','CANCELLED')),
  auto_recharge_enabled INTEGER NOT NULL DEFAULT 0 CHECK(auto_recharge_enabled IN (0,1)),
  auto_recharge_amount_jpy INTEGER NOT NULL DEFAULT 10000 CHECK(auto_recharge_amount_jpy>=3000),
  auto_recharge_threshold_jpy INTEGER NOT NULL DEFAULT 2000 CHECK(auto_recharge_threshold_jpy>=0),
  inquiry_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_billing_accounts_customer
  ON seller_billing_accounts(stripe_customer_id);

-- 残高の増減をすべて記録する台帳。amount は符号付き（チャージ +、消化 −）。
-- stripe_object_id / source_event_id の UNIQUE で Webhook 再送・クリック重複を冪等にする。
CREATE TABLE IF NOT EXISTS seller_billing_ledger (
  entry_id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN (
    'TOPUP','TOPUP_AUTO','ALLOWANCE','REFERRAL_CHARGE','ADJUSTMENT','REFUND'
  )),
  amount_micros_jpy INTEGER NOT NULL,
  balance_after_micros_jpy INTEGER NOT NULL CHECK(balance_after_micros_jpy>=0),
  stripe_object_id TEXT NOT NULL DEFAULT '',
  source_event_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_billing_ledger_seller
  ON seller_billing_ledger(seller_key, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_billing_ledger_stripe_object
  ON seller_billing_ledger(stripe_object_id) WHERE stripe_object_id<>'';

-- Business の毎月5,000円分（Business単価で積算・翌月繰越なし）。
CREATE TABLE IF NOT EXISTS seller_billing_allowance_months (
  seller_key TEXT NOT NULL,
  month TEXT NOT NULL,
  granted_micros_jpy INTEGER NOT NULL CHECK(granted_micros_jpy>=0),
  consumed_micros_jpy INTEGER NOT NULL DEFAULT 0 CHECK(consumed_micros_jpy>=0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (seller_key, month)
);

-- Stripe Webhook の再送を弾く。
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT ''
);

-- Stripe 側の Product / Price ID など、API で一度作って使い回す設定値。
CREATE TABLE IF NOT EXISTS seller_billing_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
