CREATE TABLE IF NOT EXISTS member_notification_destinations (
  member_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  encrypted_destination TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(member_id, channel)
);
