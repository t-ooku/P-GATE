CREATE TABLE IF NOT EXISTS seller_business_inquiries (
  inquiry_id TEXT PRIMARY KEY,
  inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('CONSULTATION','ACCOUNT_APPLICATION')),
  organization_type TEXT NOT NULL CHECK (organization_type IN ('MAKER','SELLER','BOTH','OTHER')),
  organization_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  storefront_url TEXT NOT NULL DEFAULT '',
  marketplaces TEXT NOT NULL DEFAULT '[]',
  monthly_order_range TEXT NOT NULL DEFAULT '',
  plan_interest TEXT NOT NULL DEFAULT '',
  payment_preference TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','QUALIFIED','CLOSED')),
  source TEXT NOT NULL DEFAULT 'FOR_SELLERS',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seller_business_inquiries_status_created
  ON seller_business_inquiries(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_business_inquiries_email_created
  ON seller_business_inquiries(contact_email, created_at);
