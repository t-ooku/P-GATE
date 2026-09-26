-- Additive; requires explicit production migration approval. Never backfill consent.
CREATE TABLE IF NOT EXISTS seller_contact_permissions (
  email_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose='SELLER_MARKETING'),
  opted_in_at TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  revoked_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(email_hash,purpose)
);
