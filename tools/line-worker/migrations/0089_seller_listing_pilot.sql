-- New opt-in pilot only. No existing contract, billing or product rows are modified.
CREATE TABLE IF NOT EXISTS seller_listing_pilots (
  pilot_id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL UNIQUE,
  owner_member_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seller_pilot_owner ON seller_listing_pilots(owner_member_id);
CREATE TABLE IF NOT EXISTS seller_listing_pilot_audit (
  event_id TEXT PRIMARY KEY,
  pilot_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('ADMIN','OWNER')),
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seller_listing_pilot_saves (
  pilot_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY(pilot_id,product_id,member_id)
);
