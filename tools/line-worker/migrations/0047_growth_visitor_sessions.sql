-- Anonymous KPI identity. Values are browser-generated random identifiers only;
-- no IP address, user agent, raw search text, email, or LINE identifier is stored.
ALTER TABLE growth_events ADD COLUMN visitor_id TEXT NOT NULL DEFAULT '';
ALTER TABLE growth_events ADD COLUMN session_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS growth_events_visitor_time
  ON growth_events (visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS growth_events_session_time
  ON growth_events (session_id, occurred_at DESC);
