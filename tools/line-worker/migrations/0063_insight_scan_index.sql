CREATE INDEX IF NOT EXISTS member_wishes_insight_scan
  ON member_wishes (wish_id, member_id)
  WHERE notify_new_match = 1;
