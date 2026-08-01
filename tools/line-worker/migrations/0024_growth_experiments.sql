ALTER TABLE growth_events
ADD COLUMN experiment TEXT NOT NULL DEFAULT '';

ALTER TABLE growth_events
ADD COLUMN variant TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS growth_events_experiment_time
  ON growth_events (experiment, variant, traffic_class, occurred_at DESC);
