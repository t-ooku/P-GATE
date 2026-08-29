-- HOSHILU continuous-search notifications require an explicit, auditable opt-in.
--
-- notify_new_match was introduced with DEFAULT 1 in migration 0044.  That flag
-- therefore cannot distinguish a member action from a legacy/default value.
-- Existing rows intentionally remain NULL here and are excluded from scans.
-- Only the member-wish API may set this timestamp after an explicit enable
-- action; disabling notifications or selecting MUTED clears it again.
ALTER TABLE member_wishes ADD COLUMN insight_enabled_at TEXT;

CREATE INDEX IF NOT EXISTS member_wishes_active_insight_scan
  ON member_wishes (wish_id, member_id)
  WHERE insight_enabled_at IS NOT NULL
    AND notify_new_match = 1
    AND watch_frequency <> 'MUTED';
