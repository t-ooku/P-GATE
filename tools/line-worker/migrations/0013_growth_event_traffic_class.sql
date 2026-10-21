ALTER TABLE growth_events
ADD COLUMN traffic_class TEXT NOT NULL DEFAULT 'UNATTRIBUTED'
CHECK (traffic_class IN ('QA', 'ATTRIBUTED', 'UNATTRIBUTED'));

UPDATE growth_events
SET traffic_class = 'QA'
WHERE lower(source) LIKE 'codex%'
   OR lower(source) LIKE 'test%'
   OR lower(source) LIKE 'qa%'
   OR lower(medium) = 'qa'
   OR lower(campaign) LIKE '%acceptance%'
   OR lower(campaign) LIKE '%test%';

UPDATE growth_events
SET traffic_class = 'ATTRIBUTED'
WHERE traffic_class <> 'QA'
  AND (source <> '' OR medium <> '' OR campaign <> '' OR content <> '');

CREATE INDEX IF NOT EXISTS growth_events_traffic_time
  ON growth_events (traffic_class, occurred_at DESC);

ALTER TABLE unmet_demand_events
ADD COLUMN traffic_class TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN'
CHECK (traffic_class IN ('QA', 'ATTRIBUTED', 'UNATTRIBUTED', 'LEGACY_UNKNOWN'));

CREATE INDEX IF NOT EXISTS unmet_demand_traffic_time
  ON unmet_demand_events (traffic_class, occurred_at DESC);
