-- HOSHILU SNS外グロース日次ファネル
-- D1 Console / wrangler d1 execute で期間を置換して実行する。
-- イベント件数であり、個人・ユニークユーザー数ではない。

WITH scoped AS (
  SELECT
    substr(occurred_at, 1, 10) AS event_date_utc,
    CASE
      WHEN medium IN ('cpc', 'paid_search') THEN 'PAID_SEARCH'
      WHEN medium IN ('display', 'paid_display') THEN 'DISPLAY'
      WHEN medium IN ('email', 'newsletter') THEN 'EMAIL'
      WHEN medium IN ('referral', 'affiliate', 'partner') THEN 'REFERRAL_PARTNER'
      WHEN source IN ('google', 'bing') AND medium IN ('organic', '') THEN 'ORGANIC_SEARCH'
      WHEN source = '' AND medium = '' AND campaign = '' THEN 'DIRECT_OR_UNKNOWN'
      ELSE 'OTHER_ATTRIBUTED'
    END AS channel,
    event_type
  FROM growth_events
  WHERE occurred_at >= '2026-08-01T00:00:00Z'
    AND occurred_at <  '2026-09-01T00:00:00Z'
    AND traffic_class <> 'QA'
), daily AS (
  SELECT
    event_date_utc,
    channel,
    SUM(CASE WHEN event_type = 'landing_view' THEN 1 ELSE 0 END) AS landing_views,
    SUM(CASE WHEN event_type = 'search_started' THEN 1 ELSE 0 END) AS searches_started,
    SUM(CASE WHEN event_type = 'search_completed' THEN 1 ELSE 0 END) AS searches_completed,
    SUM(CASE WHEN event_type = 'registration_started' THEN 1 ELSE 0 END) AS registrations_started,
    SUM(CASE WHEN event_type = 'registration_completed' THEN 1 ELSE 0 END) AS registrations_completed,
    SUM(CASE WHEN event_type = 'return_visit' THEN 1 ELSE 0 END) AS return_visits,
    SUM(CASE WHEN event_type = 'marketplace_click' THEN 1 ELSE 0 END) AS marketplace_clicks,
    SUM(CASE WHEN event_type = 'pwa_install_completed' THEN 1 ELSE 0 END) AS pwa_installs
  FROM scoped
  GROUP BY event_date_utc, channel
)
SELECT
  *,
  ROUND(100.0 * searches_started / NULLIF(landing_views, 0), 2) AS landing_to_search_pct,
  ROUND(100.0 * searches_completed / NULLIF(searches_started, 0), 2) AS search_completion_pct,
  ROUND(100.0 * registrations_completed / NULLIF(registrations_started, 0), 2) AS registration_completion_pct,
  ROUND(100.0 * marketplace_clicks / NULLIF(searches_completed, 0), 2) AS search_to_marketplace_pct
FROM daily
ORDER BY event_date_utc DESC, channel;

-- QAは実績へ混ぜず、検証イベントが届いたかだけを別表で確認する。
SELECT
  substr(occurred_at, 1, 10) AS event_date_utc,
  source,
  medium,
  campaign,
  event_type,
  COUNT(*) AS qa_events
FROM growth_events
WHERE occurred_at >= '2026-08-01T00:00:00Z'
  AND occurred_at <  '2026-09-01T00:00:00Z'
  AND traffic_class = 'QA'
GROUP BY event_date_utc, source, medium, campaign, event_type
ORDER BY event_date_utc DESC, source, campaign, event_type;
