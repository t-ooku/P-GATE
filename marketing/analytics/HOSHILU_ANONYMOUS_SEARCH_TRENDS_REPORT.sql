-- HOSHILU 編集者向け匿名検索トレンド候補
-- 期間を置換して実行する。結果が0行なら公開条件未達であり、0件として公表しない。
-- イベント件数・匿名需要パターン数であり、利用者数、売上、購入、検索精度ではない。

WITH params AS (
  SELECT
    '2026-08-01' AS period_start_jst,
    '2026-09-01' AS period_end_exclusive_jst,
    '2026-07-31T15:00:00Z' AS start_at,
    '2026-08-31T15:00:00Z' AS end_at,
    100 AS minimum_search_starts,
    20 AS minimum_category_events,
    28 AS minimum_period_days
), eligible_searches AS (
  SELECT COUNT(*) AS searches_started
  FROM growth_events, params
  WHERE occurred_at >= start_at
    AND occurred_at < end_at
    AND event_type = 'search_started'
    AND traffic_class IN ('ATTRIBUTED', 'UNATTRIBUTED')
), category_totals AS (
  SELECT
    category,
    COUNT(*) AS demand_events,
    COUNT(DISTINCT demand_hash) AS distinct_demand_patterns,
    SUM(CASE WHEN demand_status = 'UNMET' THEN 1 ELSE 0 END) AS unmet_events,
    SUM(CASE WHEN demand_status = 'MATCHED' THEN 1 ELSE 0 END) AS matched_events
  FROM unmet_demand_events, params
  WHERE occurred_at >= start_at
    AND occurred_at < end_at
    AND traffic_class IN ('ATTRIBUTED', 'UNATTRIBUTED')
  GROUP BY category
), eligible_categories AS (
  SELECT category, demand_events, distinct_demand_patterns, unmet_events, matched_events
  FROM category_totals, params
  WHERE demand_events >= minimum_category_events
)
SELECT
  params.period_start_jst,
  params.period_end_exclusive_jst,
  eligible_searches.searches_started AS non_qa_searches_started,
  eligible_categories.category,
  eligible_categories.demand_events,
  eligible_categories.distinct_demand_patterns,
  eligible_categories.unmet_events,
  eligible_categories.matched_events,
  ROUND(
    100.0 * eligible_categories.unmet_events
    / NULLIF(eligible_categories.demand_events, 0),
    2
  ) AS unmet_event_share_pct
FROM eligible_categories, eligible_searches, params
WHERE eligible_searches.searches_started >= params.minimum_search_starts
  AND julianday(params.end_at) - julianday(params.start_at) >= params.minimum_period_days
ORDER BY eligible_categories.demand_events DESC, eligible_categories.category;
