-- Public business identity entered by the seller, not inferred from billing data.
ALTER TABLE seller_shops ADD COLUMN business_name TEXT NOT NULL DEFAULT '';
ALTER TABLE seller_shops ADD COLUMN registered_address TEXT NOT NULL DEFAULT '';
