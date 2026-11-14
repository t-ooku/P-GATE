CREATE TABLE IF NOT EXISTS import_restriction_knowledge (
  tenant TEXT NOT NULL,
  source_order_hash TEXT NOT NULL,
  source_product_id TEXT NOT NULL DEFAULT '',
  restriction_class TEXT NOT NULL,
  occurred_month TEXT NOT NULL,
  anonymous_demand_count INTEGER NOT NULL DEFAULT 1,
  domestic_alternative_status TEXT NOT NULL DEFAULT 'UNRESOLVED',
  verified_alternative_ids TEXT NOT NULL DEFAULT '[]',
  verification_level TEXT NOT NULL DEFAULT 'UNVERIFIED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant, source_order_hash)
);

CREATE INDEX IF NOT EXISTS import_restriction_tenant_month
  ON import_restriction_knowledge (tenant, occurred_month DESC);
CREATE INDEX IF NOT EXISTS import_restriction_class_month
  ON import_restriction_knowledge (restriction_class, occurred_month DESC);
