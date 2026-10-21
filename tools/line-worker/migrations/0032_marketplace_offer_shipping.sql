ALTER TABLE marketplace_offers ADD COLUMN shipping_fee REAL;
ALTER TABLE marketplace_offers ADD COLUMN total_cost REAL;
ALTER TABLE marketplace_offers ADD COLUMN shipping_fee_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(shipping_fee_confirmed IN (0,1));
ALTER TABLE marketplace_offers ADD COLUMN delivery_days INTEGER;
