-- HOSHILU GAS→Web移行: gas/MeasurementEngine.gs, gas/MarketplaceMeasurementEngine.gs,
-- gas/BenchmarkEngine.gsに相当するD1スキーマ。GAS側のKPI_Event_Log等シートは
-- 引き続き正本として稼働し続ける(Worker→GASのcallGas('TRACK')は変更しない)。
-- ここはWorkerが同じイベントをD1へも並走記録するための、Worker独自のB2B契約
-- KPIパイプラインで、既存のB2C growth-events.mjsとは別物として扱う
-- (docs/HOSHILU_GAS_TO_WEB_MIGRATION_BRIEF_2026-08-06.md §3)。

CREATE TABLE IF NOT EXISTS kpi_events (
  event_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  date_jst TEXT NOT NULL,
  tenant TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  experiment_variant TEXT NOT NULL,
  asin TEXT NOT NULL,
  event_type TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  consent INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS kpi_events_summary_scope
  ON kpi_events (date_jst, tenant, account_type, account_id, campaign_id, experiment_variant);

CREATE TABLE IF NOT EXISTS kpi_summary (
  date_jst TEXT NOT NULL,
  tenant TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  experiment_variant TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  outbound INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  outbound_rate REAL NOT NULL DEFAULT 0,
  cvr REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date_jst, tenant, account_type, account_id, campaign_id, experiment_variant)
);

CREATE TABLE IF NOT EXISTS kpi_uplift (
  date_jst TEXT NOT NULL,
  tenant TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  control_value REAL NOT NULL DEFAULT 0,
  p_gate_value REAL NOT NULL DEFAULT 0,
  absolute_lift REAL NOT NULL DEFAULT 0,
  relative_lift REAL,
  control_sample INTEGER NOT NULL DEFAULT 0,
  p_gate_sample INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date_jst, tenant, account_type, account_id, campaign_id, metric)
);

CREATE TABLE IF NOT EXISTS marketplace_kpi_events (
  event_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  date_jst TEXT NOT NULL,
  tenant TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  asin TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS marketplace_kpi_events_summary_scope
  ON marketplace_kpi_events (date_jst, tenant, account_type, account_id, channel);

CREATE TABLE IF NOT EXISTS marketplace_kpi_summary (
  date_jst TEXT NOT NULL,
  tenant TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  outbound INTEGER NOT NULL DEFAULT 0,
  unique_sessions INTEGER NOT NULL DEFAULT 0,
  unique_asins INTEGER NOT NULL DEFAULT 0,
  click_selection_share REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date_jst, tenant, account_type, account_id, channel, marketplace)
);

-- gas/BenchmarkEngine.gs: 明示同意(Client_Contracts.benchmark_consent)のある
-- 契約のP_GATE実績だけを、最小コホートサイズ(k-匿名性)を満たす場合のみ集計する。
CREATE TABLE IF NOT EXISTS anonymous_benchmark (
  date_jst TEXT NOT NULL,
  account_type TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  median REAL NOT NULL DEFAULT 0,
  p25 REAL NOT NULL DEFAULT 0,
  p75 REAL NOT NULL DEFAULT 0,
  cohort_size INTEGER NOT NULL DEFAULT 0,
  minimum_cohort INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (date_jst, account_type, campaign_id, metric)
);
