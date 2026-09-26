-- Additive; requires explicit production migration approval.
CREATE TABLE IF NOT EXISTS seller_inquiry_notifications (
  inquiry_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('PENDING','API_ACCEPTED','FAILED')),
  updated_at TEXT NOT NULL
);
-- API_ACCEPTED is not delivery, inbox placement, reading, or a reply.
