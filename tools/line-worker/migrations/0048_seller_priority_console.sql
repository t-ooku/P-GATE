-- Seller/Business向けの優先出品管理とクリック請求台帳。
-- 自然検索順位には接続せず、同一商品の購入先枠だけを管理する。
-- 金額は小数円の送客単価を失わないよう1円=1,000,000 microsで保持する。

CREATE TABLE IF NOT EXISTS seller_priority_rules (
  rule_id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  tenant TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN (
    'ALL','CATEGORY','BRAND','MANUFACTURER','INVENTORY_MIN','AI_RECOMMENDED'
  )),
  scope_value TEXT NOT NULL DEFAULT '*',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  priority_started_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(seller_key,tenant,scope_type,scope_value)
);

CREATE INDEX IF NOT EXISTS seller_priority_rules_active_order
  ON seller_priority_rules (tenant,scope_type,active,priority_started_at,rule_id);

CREATE INDEX IF NOT EXISTS seller_priority_rules_account
  ON seller_priority_rules (seller_key,tenant,updated_at DESC);

CREATE TABLE IF NOT EXISTS seller_priority_memberships (
  seller_key TEXT NOT NULL,
  tenant TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (seller_key,tenant,seller_id)
);

CREATE INDEX IF NOT EXISTS seller_priority_memberships_offer
  ON seller_priority_memberships (tenant,seller_id,seller_key);

CREATE INDEX IF NOT EXISTS seller_priority_memberships_seller
  ON seller_priority_memberships (seller_id,tenant,seller_key);

CREATE TABLE IF NOT EXISTS seller_billing_wallets (
  seller_key TEXT PRIMARY KEY,
  currency TEXT NOT NULL DEFAULT 'JPY' CHECK(currency='JPY'),
  balance_micros_jpy INTEGER NOT NULL DEFAULT 0 CHECK(balance_micros_jpy>=0),
  reserved_micros_jpy INTEGER NOT NULL DEFAULT 0 CHECK(reserved_micros_jpy>=0),
  status TEXT NOT NULL DEFAULT 'UNFUNDED' CHECK(status IN ('UNFUNDED','ACTIVE','PAUSED')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_qualified_click_charges (
  charge_id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE,
  seller_key TEXT NOT NULL,
  tenant TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  hoshilu_product_id TEXT,
  amount_micros_jpy INTEGER NOT NULL CHECK(amount_micros_jpy>=0),
  status TEXT NOT NULL CHECK(status IN ('PENDING','SETTLED','VOID')),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE INDEX IF NOT EXISTS seller_qualified_click_charges_account_time
  ON seller_qualified_click_charges (seller_key,status,occurred_at DESC);

CREATE TABLE IF NOT EXISTS seller_console_audit (
  audit_id TEXT PRIMARY KEY,
  seller_key TEXT NOT NULL,
  tenant TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_value TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS seller_console_audit_account_time
  ON seller_console_audit (seller_key,occurred_at DESC);
