import { authorizeAdminRequest } from './admin-auth.mjs';
import { socialPublisherReadiness } from './social-publisher.mjs';

const PLATFORMS = ['X', 'INSTAGRAM', 'TIKTOK'];
const SCHEDULES = Object.freeze({
  X: '毎日20:15（22歳設定v2 AI女優リール。20:00の非動画枠は追加投稿）',
  INSTAGRAM: '毎日20:15（22歳設定v2 AI女優リール）',
  TIKTOK: '未接続'
});
const SOURCE_BY_PLATFORM = Object.freeze({ X: 'x', INSTAGRAM: 'instagram', TIKTOK: 'tiktok' });
const FUNNEL_EVENTS = Object.freeze([
  'landing_view', 'search_started', 'search_completed', 'search_failed', 'ai_result_clicked',
  'ranking_result_clicked', 'price_comparison_opened', 'marketplace_click', 'returning_visit'
]);
const emptyFunnel = () => Object.fromEntries(FUNNEL_EVENTS.map(event => [event, 0]));
const VALUE_EVENT_SQL = "'ai_result_clicked','ranking_result_clicked','price_comparison_opened','wish_saved','continuous_search_saved','share_started','marketplace_click'";
const IDENTITY_INELIGIBLE_EVENT_SQL = "'continuous_search_enabled','search_backend_failed','search_provider_degraded','search_client_degraded'";
const SEARCH_INPUT_EVENTS = Object.freeze({
  search_input_text: ['TEXT', 'attempts'],
  search_input_screenshot: ['SCREENSHOT', 'attempts'],
  search_input_camera: ['CAMERA', 'attempts'],
  search_input_social_url: ['SOCIAL_URL', 'attempts'],
  search_input_text_screenshot: ['TEXT_SCREENSHOT', 'attempts'],
  search_input_text_camera: ['TEXT_CAMERA', 'attempts'],
  search_input_text_social_url: ['TEXT_SOCIAL_URL', 'attempts'],
  search_input_screenshot_social_url: ['SCREENSHOT_SOCIAL_URL', 'attempts'],
  search_input_camera_social_url: ['CAMERA_SOCIAL_URL', 'attempts'],
  search_input_text_screenshot_social_url: ['TEXT_SCREENSHOT_SOCIAL_URL', 'attempts'],
  search_input_text_camera_social_url: ['TEXT_CAMERA_SOCIAL_URL', 'attempts'],
  search_completed_text: ['TEXT', 'completed'],
  search_completed_screenshot: ['SCREENSHOT', 'completed'],
  search_completed_camera: ['CAMERA', 'completed'],
  search_completed_social_url: ['SOCIAL_URL', 'completed'],
  search_completed_text_screenshot: ['TEXT_SCREENSHOT', 'completed'],
  search_completed_text_camera: ['TEXT_CAMERA', 'completed'],
  search_completed_text_social_url: ['TEXT_SOCIAL_URL', 'completed'],
  search_completed_screenshot_social_url: ['SCREENSHOT_SOCIAL_URL', 'completed'],
  search_completed_camera_social_url: ['CAMERA_SOCIAL_URL', 'completed'],
  search_completed_text_screenshot_social_url: ['TEXT_SCREENSHOT_SOCIAL_URL', 'completed'],
  search_completed_text_camera_social_url: ['TEXT_CAMERA_SOCIAL_URL', 'completed'],
  search_outbound_text: ['TEXT', 'outbound'],
  search_outbound_screenshot: ['SCREENSHOT', 'outbound'],
  search_outbound_camera: ['CAMERA', 'outbound'],
  search_outbound_social_url: ['SOCIAL_URL', 'outbound'],
  search_outbound_text_screenshot: ['TEXT_SCREENSHOT', 'outbound'],
  search_outbound_text_camera: ['TEXT_CAMERA', 'outbound'],
  search_outbound_text_social_url: ['TEXT_SOCIAL_URL', 'outbound'],
  search_outbound_screenshot_social_url: ['SCREENSHOT_SOCIAL_URL', 'outbound'],
  search_outbound_camera_social_url: ['CAMERA_SOCIAL_URL', 'outbound'],
  search_outbound_text_screenshot_social_url: ['TEXT_SCREENSHOT_SOCIAL_URL', 'outbound'],
  search_outbound_text_camera_social_url: ['TEXT_CAMERA_SOCIAL_URL', 'outbound']
});
const SEARCH_INPUT_EVENT_SQL = Object.keys(SEARCH_INPUT_EVENTS).map(value => `'${value}'`).join(',');
const ANNUAL_TRAFFIC_TARGET = Object.freeze({
  start_at: '2026-08-13T15:00:00.000Z',
  end_at: '2027-08-13T15:00:00.000Z',
  visitors: 1_000_000,
  daily_pace: 2740,
  monthly_pace: 83334
});
const CODEX_KPI_COUNT_KEYS = Object.freeze([
  'visitors', 'repeat_visitors', 'sessions', 'landing_sessions', 'search_sessions',
  'completed_search_sessions', 'failed_search_sessions', 'value_sessions',
  'comparison_sessions', 'outbound_sessions', 'wish_sessions',
  'continuous_search_save_sessions', 'continuous_search_enabled_count',
  'share_sessions', 'registration_sessions', 'watch_set_sessions', 'watch_set_count',
  'events', 'identity_eligible_events', 'identified_events'
]);
const CODEX_KPI_RATE_KEYS = Object.freeze([
  'visit_to_search', 'visit_to_watch_set', 'search_completion', 'search_failure', 'value_realization',
  'comparison_reach', 'marketplace_outbound', 'repeat_visitor', 'registration',
  'tracking_coverage'
]);
const SOCIAL_QUEUE_STATUSES = Object.freeze([
  'APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'REVIEW_REQUIRED'
]);

function noStoreJson(value, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(value, { ...init, headers });
}

const safeCount = value => Math.max(0, Math.round(Number(value || 0)));
const safeNumber = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
const percentage = (numerator, denominator) => denominator > 0
  ? Math.round((numerator / denominator) * 1000) / 10 : null;
const iso = value => new Date(value).toISOString();
const shiftDays = (value, days) => new Date(new Date(value).getTime() + days * 86400000);

const SESSION_METRICS_SQL = `WITH base AS (
  SELECT visitor_id,session_id,event_type,traffic_class,occurred_at
  FROM growth_events
  WHERE occurred_at>=?1 AND occurred_at<?2 AND traffic_class<>'QA'
), session_flags AS (
  SELECT session_id,
    MAX(CASE WHEN event_type='landing_view' THEN 1 ELSE 0 END) AS landed,
    MAX(CASE WHEN event_type='search_started' THEN 1 ELSE 0 END) AS searched,
    MAX(CASE WHEN event_type='search_completed' THEN 1 ELSE 0 END) AS completed,
    MAX(CASE WHEN event_type IN ('search_failed','search_dead_end') THEN 1 ELSE 0 END) AS failed,
    MAX(CASE WHEN event_type IN (${VALUE_EVENT_SQL}) THEN 1 ELSE 0 END) AS valued,
    MAX(CASE WHEN event_type='price_comparison_opened' THEN 1 ELSE 0 END) AS compared,
    MAX(CASE WHEN event_type='marketplace_click' THEN 1 ELSE 0 END) AS outbound,
    MAX(CASE WHEN event_type IN ('wish_saved','continuous_search_saved') THEN 1 ELSE 0 END) AS wished,
    MAX(CASE WHEN event_type='continuous_search_saved' THEN 1 ELSE 0 END) AS continuous_search_saved,
    MAX(CASE WHEN event_type='share_started' THEN 1 ELSE 0 END) AS shared,
    MAX(CASE WHEN event_type='member_registered' THEN 1 ELSE 0 END) AS registered,
    MAX(CASE WHEN event_type='target_price_watch_set' THEN 1 ELSE 0 END) AS watch_set,
    MAX(CASE WHEN traffic_class='ATTRIBUTED' THEN 1 ELSE 0 END) AS attributed,
    MIN(CASE WHEN event_type='search_started' THEN occurred_at END) AS search_at,
    MIN(CASE WHEN event_type='search_completed' THEN occurred_at END) AS completed_at,
    MIN(CASE WHEN event_type IN (${VALUE_EVENT_SQL}) THEN occurred_at END) AS value_at
  FROM base WHERE session_id<>'' GROUP BY session_id
), visitor_flags AS (
  SELECT visitor_id,COUNT(DISTINCT session_id) AS session_count
  FROM base WHERE visitor_id<>'' GROUP BY visitor_id
)
SELECT
  (SELECT COUNT(*) FROM visitor_flags) AS visitors,
  (SELECT COUNT(*) FROM visitor_flags WHERE session_count>=2) AS repeat_visitors,
  COUNT(*) AS sessions,
  SUM(landed) AS landing_sessions,
  SUM(searched) AS search_sessions,
  SUM(CASE WHEN searched=1 AND completed=1 THEN 1 ELSE 0 END) AS completed_search_sessions,
  SUM(CASE WHEN searched=1 AND failed=1 THEN 1 ELSE 0 END) AS failed_search_sessions,
  SUM(CASE WHEN completed=1 AND valued=1 THEN 1 ELSE 0 END) AS value_sessions,
  SUM(CASE WHEN completed=1 AND compared=1 THEN 1 ELSE 0 END) AS comparison_sessions,
  SUM(CASE WHEN completed=1 AND outbound=1 THEN 1 ELSE 0 END) AS outbound_sessions,
  SUM(CASE WHEN completed=1 AND wished=1 THEN 1 ELSE 0 END) AS wish_sessions,
  SUM(continuous_search_saved) AS continuous_search_save_sessions,
  (SELECT COUNT(*) FROM base WHERE event_type='continuous_search_enabled') AS continuous_search_enabled_count,
  SUM(CASE WHEN completed=1 AND shared=1 THEN 1 ELSE 0 END) AS share_sessions,
  SUM(CASE WHEN landed=1 AND registered=1 THEN 1 ELSE 0 END) AS registration_sessions,
  SUM(watch_set) AS watch_set_sessions,
  (SELECT COUNT(*) FROM base WHERE event_type='target_price_watch_set') AS watch_set_count,
  SUM(attributed) AS attributed_sessions,
  ROUND(AVG(CASE WHEN search_at IS NOT NULL AND completed_at>=search_at
    THEN (julianday(completed_at)-julianday(search_at))*86400 END),1) AS avg_search_seconds,
  ROUND(AVG(CASE WHEN completed=1 AND search_at IS NOT NULL AND value_at>=search_at
    THEN (julianday(value_at)-julianday(search_at))*86400 END),1) AS avg_value_seconds,
  (SELECT COUNT(*) FROM base) AS events,
  (SELECT COUNT(*) FROM base WHERE event_type NOT IN (${IDENTITY_INELIGIBLE_EVENT_SQL})) AS identity_eligible_events,
  (SELECT COUNT(*) FROM base WHERE event_type NOT IN (${IDENTITY_INELIGIBLE_EVENT_SQL})
    AND visitor_id<>'' AND session_id<>'') AS identified_events,
  (SELECT MAX(occurred_at) FROM base) AS last_event_at
FROM session_flags`;

const SOURCE_BREAKDOWN_SQL = `WITH base AS (
  SELECT visitor_id,session_id,event_type,source,medium
  FROM growth_events WHERE occurred_at>=?1 AND occurred_at<?2 AND traffic_class<>'QA' AND session_id<>''
), sessions AS (
  SELECT session_id,MAX(visitor_id) AS visitor_id,
    COALESCE(NULLIF(MAX(source),''),'DIRECT') AS source,
    COALESCE(NULLIF(MAX(medium),''),'NONE') AS medium,
    MAX(CASE WHEN event_type='search_started' THEN 1 ELSE 0 END) AS searched,
    MAX(CASE WHEN event_type='search_completed' THEN 1 ELSE 0 END) AS completed,
    MAX(CASE WHEN event_type IN (${VALUE_EVENT_SQL}) THEN 1 ELSE 0 END) AS valued,
    MAX(CASE WHEN event_type='marketplace_click' THEN 1 ELSE 0 END) AS outbound,
    MAX(CASE WHEN event_type='target_price_watch_set' THEN 1 ELSE 0 END) AS watch_set
  FROM base GROUP BY session_id
)
SELECT source,medium,COUNT(*) AS sessions,
  COUNT(DISTINCT CASE WHEN visitor_id<>'' THEN visitor_id END) AS visitors,
  SUM(searched) AS search_sessions,
  SUM(CASE WHEN searched=1 AND completed=1 THEN 1 ELSE 0 END) AS completed_search_sessions,
  SUM(CASE WHEN completed=1 AND valued=1 THEN 1 ELSE 0 END) AS value_sessions,
  SUM(CASE WHEN completed=1 AND outbound=1 THEN 1 ELSE 0 END) AS outbound_sessions,
  SUM(watch_set) AS watch_set_sessions
FROM sessions GROUP BY source,medium
ORDER BY value_sessions DESC,outbound_sessions DESC,sessions DESC LIMIT 10`;

// 2026-09-03 §17: モール別に「出た」「押された」を並べる。表示(marketplace_shown)
// は2026-09-03に計測を開始したため、それ以前の期間は impressions が0になる。
// 0を「表示されなかった」と読み違えないよう、クリック率は表示が1件以上ある
// 場合だけ算出し、無い場合は null(未計測)を返す。
const MARKETPLACE_BREAKDOWN_SQL = `SELECT marketplace,
    COUNT(DISTINCT CASE WHEN event_type='marketplace_click' THEN session_id END) AS outbound_sessions,
    COUNT(DISTINCT CASE WHEN event_type='marketplace_shown' THEN session_id END) AS shown_sessions,
    SUM(CASE WHEN event_type='marketplace_click' THEN 1 ELSE 0 END) AS clicks,
    SUM(CASE WHEN event_type='marketplace_shown' THEN 1 ELSE 0 END) AS impressions
  FROM growth_events WHERE occurred_at>=?1 AND occurred_at<?2 AND traffic_class<>'QA'
  AND event_type IN ('marketplace_click','marketplace_shown') AND marketplace<>'' AND session_id<>''
  GROUP BY marketplace ORDER BY outbound_sessions DESC,impressions DESC,marketplace ASC LIMIT 15`;

const DAILY_SQL = `WITH sessions AS (
  SELECT substr(occurred_at,1,10) AS day,session_id,MAX(visitor_id) AS visitor_id,
    MAX(CASE WHEN event_type='search_started' THEN 1 ELSE 0 END) AS searched,
    MAX(CASE WHEN event_type='search_completed' THEN 1 ELSE 0 END) AS completed,
    MAX(CASE WHEN event_type IN (${VALUE_EVENT_SQL}) THEN 1 ELSE 0 END) AS valued,
    MAX(CASE WHEN event_type='marketplace_click' THEN 1 ELSE 0 END) AS outbound
  FROM growth_events WHERE occurred_at>=?1 AND occurred_at<?2 AND traffic_class<>'QA' AND session_id<>''
  GROUP BY substr(occurred_at,1,10),session_id
)
SELECT day,COUNT(DISTINCT CASE WHEN visitor_id<>'' THEN visitor_id END) AS visitors,
  SUM(searched) AS search_sessions,
  SUM(CASE WHEN completed=1 AND valued=1 THEN 1 ELSE 0 END) AS value_sessions,
  SUM(CASE WHEN completed=1 AND outbound=1 THEN 1 ELSE 0 END) AS outbound_sessions
FROM sessions GROUP BY day ORDER BY day`;

// 指示書 §33: 「検索 → モール到達」の時間とタップ数(2026-09-03)。
// セッションごとに最初の search_started から最初の marketplace_click までの
// 秒数と、その間の操作回数(候補タップ・価格比較・モールタップ)を出す。
// タップ1回 = 本命候補の直下の導線からそのままモールへ(P0-1 の実測)。
const SEARCH_TO_MALL_SQL = `WITH base AS (
  SELECT session_id,event_type,occurred_at FROM growth_events
  WHERE occurred_at>=?1 AND occurred_at<?2 AND traffic_class<>'QA' AND session_id<>''
    AND event_type IN ('search_started','marketplace_click','ai_result_clicked','price_comparison_opened')
), anchors AS (
  SELECT session_id,
    MIN(CASE WHEN event_type='search_started' THEN occurred_at END) AS search_at
  FROM base GROUP BY session_id
), reached AS (
  SELECT anchors.session_id,anchors.search_at,MIN(base.occurred_at) AS mall_at
  FROM anchors JOIN base ON base.session_id=anchors.session_id
  WHERE base.event_type='marketplace_click' AND anchors.search_at IS NOT NULL AND base.occurred_at>=anchors.search_at
  GROUP BY anchors.session_id
)
SELECT reached.session_id,
  ROUND((julianday(reached.mall_at)-julianday(reached.search_at))*86400,1) AS seconds,
  (SELECT COUNT(*) FROM base WHERE base.session_id=reached.session_id
    AND base.event_type IN ('ai_result_clicked','price_comparison_opened')
    AND base.occurred_at>=reached.search_at AND base.occurred_at<reached.mall_at) + 1 AS taps
FROM reached ORDER BY reached.mall_at DESC LIMIT 2000`;

const SEARCH_INPUT_MIX_SQL = `WITH typed AS (
    SELECT event_type,SUBSTR(event_id,1,71) AS execution_key
    FROM growth_events WHERE occurred_at>=?1 AND occurred_at<?2 AND traffic_class<>'QA'
      AND event_type IN (${SEARCH_INPUT_EVENT_SQL})
      AND event_id LIKE 'search_%'
  ), attempts AS (
    SELECT DISTINCT execution_key FROM typed WHERE event_type LIKE 'search_input_%'
  )
  SELECT typed.event_type,COUNT(DISTINCT typed.execution_key) AS searches
  FROM typed JOIN attempts USING(execution_key) GROUP BY typed.event_type`;

function normalizedMetrics(row = {}) {
  const fields = [
    'visitors', 'repeat_visitors', 'sessions', 'landing_sessions', 'search_sessions',
    'completed_search_sessions', 'failed_search_sessions', 'value_sessions',
    'comparison_sessions', 'outbound_sessions', 'wish_sessions', 'continuous_search_save_sessions',
    'continuous_search_enabled_count', 'share_sessions',
    'registration_sessions', 'watch_set_sessions', 'watch_set_count',
    'attributed_sessions', 'events', 'identity_eligible_events', 'identified_events'
  ];
  const metrics = Object.fromEntries(fields.map(field => [field, safeCount(row[field])]));
  return {
    ...metrics,
    avg_search_seconds: safeNumber(row.avg_search_seconds),
    avg_value_seconds: safeNumber(row.avg_value_seconds),
    last_event_at: row.last_event_at || '',
    rates: {
      visit_to_search: percentage(metrics.search_sessions, metrics.landing_sessions),
      search_completion: percentage(metrics.completed_search_sessions, metrics.search_sessions),
      search_failure: percentage(metrics.failed_search_sessions, metrics.search_sessions),
      value_realization: percentage(metrics.value_sessions, metrics.completed_search_sessions),
      comparison_reach: percentage(metrics.comparison_sessions, metrics.completed_search_sessions),
      marketplace_outbound: percentage(metrics.outbound_sessions, metrics.completed_search_sessions),
      repeat_visitor: percentage(metrics.repeat_visitors, metrics.visitors),
      registration: percentage(metrics.registration_sessions, metrics.landing_sessions),
      // 2026-09-06 大隆さん指示（§27）: 訪問→Watch Set率。内部・テスト会員の登録は
      // traffic_class='QA' で書くので、この分母・分子の両方から自動的に外れる。
      visit_to_watch_set: percentage(metrics.watch_set_sessions, metrics.landing_sessions),
      attributed_sessions: percentage(metrics.attributed_sessions, metrics.sessions),
      tracking_coverage: percentage(metrics.identified_events, metrics.identity_eligible_events)
    }
  };
}

function fillDaily(start, end, rows = []) {
  const byDay = new Map(rows.map(row => [row.day, row]));
  const daily = [];
  for (let cursor = new Date(start); cursor < end; cursor = shiftDays(cursor, 1)) {
    const day = cursor.toISOString().slice(0, 10);
    const row = byDay.get(day) || {};
    daily.push({ day, visitors: safeCount(row.visitors), search_sessions: safeCount(row.search_sessions),
      value_sessions: safeCount(row.value_sessions), outbound_sessions: safeCount(row.outbound_sessions) });
  }
  return daily;
}

function sourceRows(rows = []) {
  return rows.map(row => ({
    source: String(row.source || 'DIRECT').toLowerCase(),
    medium: String(row.medium || 'NONE').toLowerCase(),
    visitors: safeCount(row.visitors), sessions: safeCount(row.sessions),
    search_sessions: safeCount(row.search_sessions), completed_search_sessions: safeCount(row.completed_search_sessions),
    value_sessions: safeCount(row.value_sessions),
    outbound_sessions: safeCount(row.outbound_sessions),
    // 流入元ごとの「希望価格を入れた人」。どのチャネルが本命の行動に繋がったかを見る。
    watch_set_sessions: safeCount(row.watch_set_sessions),
    watch_set_rate: percentage(safeCount(row.watch_set_sessions), safeCount(row.sessions)),
    value_rate: percentage(safeCount(row.value_sessions), safeCount(row.completed_search_sessions))
  }));
}

function marketplaceRows(rows = []) {
  return rows.map(row => {
    const impressions = safeCount(row.impressions);
    const clicks = safeCount(row.clicks);
    return {
      marketplace: String(row.marketplace || ''),
      outbound_sessions: safeCount(row.outbound_sessions),
      shown_sessions: safeCount(row.shown_sessions),
      impressions,
      clicks,
      // 表示の実測が無いモールは率を作らない(推測値を実数として出さない)。
      click_rate: impressions > 0 ? percentage(clicks, impressions) : null
    };
  });
}

function searchInputMix(rows = []) {
  const types = [...new Set(Object.values(SEARCH_INPUT_EVENTS).map(([type]) => type))];
  const performance = Object.fromEntries(types.map(type => [type, { attempts: 0, completed: 0, outbound: 0 }]));
  for (const row of rows) {
    const [type, stage] = SEARCH_INPUT_EVENTS[String(row.event_type || '')] || [];
    if (type && stage) performance[type][stage] = safeCount(row.searches);
  }
  const counts = Object.fromEntries(types.map(type => [type, performance[type].attempts]));
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  for (const type of types) {
    const row = performance[type];
    row.mix_rate = percentage(row.attempts, total);
    row.success_rate = percentage(row.completed, row.attempts);
    row.outbound_rate = percentage(row.outbound, row.attempts);
    row.attempt_to_outbound_rate = percentage(row.outbound, row.attempts);
  }
  return {
    total_searches: total,
    rate_definition: '構成比=受理検索内、成功率=成功÷受理、送客CVR=送客した検索÷受理（同一検索の複数クリックは1件）',
    counts,
    rates: Object.fromEntries(types.map(type => [type, performance[type].mix_rate])),
    performance
  };
}

function searchToMall(rows = []) {
  const seconds = rows.map(row => Number(row.seconds)).filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const taps = rows.map(row => safeCount(row.taps)).filter(value => value > 0);
  const quantile = (values, q) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * q))] : null;
  const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
  const oneTap = taps.filter(value => value === 1).length;
  return {
    definition: '検索開始から最初のモール遷移まで（QA除外、セッション単位）。タップ=候補タップ・価格比較・モールタップの合計、1タップ=本命候補からそのままモールへ',
    sessions: rows.length,
    median_seconds: quantile(seconds, 0.5),
    p90_seconds: quantile(seconds, 0.9),
    avg_seconds: average(seconds),
    avg_taps: average(taps),
    one_tap_sessions: oneTap,
    one_tap_rate: percentage(oneTap, taps.length)
  };
}

function comparison(current, previous) {
  const countKeys = ['visitors', 'sessions', 'search_sessions', 'completed_search_sessions', 'value_sessions', 'outbound_sessions'];
  const rateKeys = ['visit_to_search', 'search_completion', 'search_failure', 'value_realization', 'marketplace_outbound', 'repeat_visitor'];
  return {
    counts: Object.fromEntries(countKeys.map(key => [key, previous[key] > 0
      ? Math.round(((current[key] - previous[key]) / previous[key]) * 1000) / 10
      : current[key] > 0 ? null : 0])),
    rates: Object.fromEntries(rateKeys.map(key => [key,
      current.rates[key] === null || previous.rates[key] === null ? null
        : Math.round((current.rates[key] - previous.rates[key]) * 10) / 10]))
  };
}

function improvementInsights(current, previous, sources) {
  if (!current.events) return [{ tone: 'info', title: '計測開始待ち', detail: '本番イベントが届くと、改善優先順位を自動表示します。' }];
  const insights = [];
  if ((current.rates.tracking_coverage ?? 0) < 90) {
    insights.push({ tone: 'warning', title: '計測データを先に整える',
      detail: `匿名ID付与率は${current.rates.tracking_coverage ?? 0}%です。率の判断は90%以上になってから行います。` });
  }
  if (current.search_sessions < 20) {
    insights.push({ tone: 'info', title: '判断保留', detail: `検索セッションは${current.search_sessions}件です。まず20件以上を集め、率より実数と不具合を確認します。` });
  } else {
    const stages = [
      { title: '訪問から検索開始', from: current.landing_sessions, to: current.search_sessions, rate: current.rates.visit_to_search },
      { title: '検索開始から成功', from: current.search_sessions, to: current.completed_search_sessions, rate: current.rates.search_completion },
      { title: '検索成功から商品発見', from: current.completed_search_sessions, to: current.value_sessions, rate: current.rates.value_realization },
      { title: '商品発見からモール送客', from: current.value_sessions, to: current.outbound_sessions,
        rate: percentage(current.outbound_sessions, current.value_sessions) }
    ].filter(stage => stage.from > 0);
    const largest = stages.sort((a, b) => (b.from - b.to) - (a.from - a.to))[0];
    if (largest) insights.push({ tone: 'action', title: `最優先：${largest.title}`,
      detail: `${largest.from}→${largest.to}、離脱${Math.max(0, largest.from - largest.to)}件（到達率${largest.rate ?? 0}%）です。` });
  }
  const rateDeltas = comparison(current, previous).rates;
  const regressions = [
    ['検索開始率', rateDeltas.visit_to_search], ['検索成功率', rateDeltas.search_completion],
    ['価値到達率', rateDeltas.value_realization], ['モール送客率', rateDeltas.marketplace_outbound]
  ].filter(([, delta]) => delta !== null && delta <= -5).sort((a, b) => a[1] - b[1]);
  if (regressions[0]) insights.push({ tone: 'danger', title: `${regressions[0][0]}が悪化`,
    detail: `直前期間より${Math.abs(regressions[0][1])}ポイント低下しています。変更履歴と流入元を確認してください。` });
  const best = sources.filter(row => row.search_sessions >= 3).sort((a, b) => b.value_rate - a.value_rate)[0];
  if (best) insights.push({ tone: 'success', title: `質の高い流入：${best.source}`,
    detail: `${best.search_sessions}検索、価値到達率${best.value_rate ?? 0}%です。量を増やせるか検証します。` });
  return insights.slice(0, 4);
}

async function periodSummary(env, now, days) {
  const end = new Date(now);
  const start = shiftDays(end, -days);
  const previousStart = shiftDays(start, -days);
  const statements = [
    env.PRODUCT_DB.prepare(SESSION_METRICS_SQL).bind(iso(start), iso(end)),
    env.PRODUCT_DB.prepare(SESSION_METRICS_SQL).bind(iso(previousStart), iso(start)),
    env.PRODUCT_DB.prepare(SOURCE_BREAKDOWN_SQL).bind(iso(start), iso(end)),
    env.PRODUCT_DB.prepare(MARKETPLACE_BREAKDOWN_SQL).bind(iso(start), iso(end)),
    env.PRODUCT_DB.prepare(DAILY_SQL).bind(iso(start), iso(end)),
    env.PRODUCT_DB.prepare(SEARCH_INPUT_MIX_SQL).bind(iso(start), iso(end)),
    env.PRODUCT_DB.prepare(SEARCH_TO_MALL_SQL).bind(iso(start), iso(end))
  ];
  const results = typeof env.PRODUCT_DB.batch === 'function'
    ? await env.PRODUCT_DB.batch(statements)
    : await Promise.all([statements[0].first(), statements[1].first(), statements[2].all(), statements[3].all(), statements[4].all(), statements[5].all(), statements[6].all()]);
  const first = result => Array.isArray(result?.results) ? result.results[0] || {} : result || {};
  const rows = result => Array.isArray(result?.results) ? result.results : [];
  const current = normalizedMetrics(first(results[0]));
  const previous = normalizedMetrics(first(results[1]));
  const sources = sourceRows(rows(results[2]));
  const marketplaces = marketplaceRows(rows(results[3]));
  return {
    days, start_at: iso(start), end_at: iso(end), current, previous,
    comparison: comparison(current, previous),
    daily: fillDaily(start, end, rows(results[4])), sources, marketplaces,
    search_input_mix: searchInputMix(rows(results[5])),
    search_to_mall: searchToMall(rows(results[6])),
    insights: improvementInsights(current, previous, sources)
  };
}

async function businessKpiSummary(env, now) {
  let registeredMembers = 0;
  try {
    const row = await env.PRODUCT_DB.prepare(`SELECT COUNT(DISTINCT destination.member_id) AS total
      FROM member_notification_destinations destination
      WHERE destination.verified_at<>'' AND destination.channel IN ('LINE','EMAIL')
      AND NOT EXISTS (
        SELECT 1 FROM member_notification_destinations alias
        WHERE alias.member_id=destination.member_id AND alias.channel='IDENTITY_ALIAS' AND alias.verified_at<>''
      )`).first();
    registeredMembers = safeCount(row?.total);
  } catch {}
  try {
    const [period7d, period30d] = await Promise.all([
      periodSummary(env, now, 7), periodSummary(env, now, 30)
    ]);
    const annualTraffic = await env.PRODUCT_DB.prepare(`SELECT COUNT(DISTINCT visitor_id) AS visitors
      FROM growth_events WHERE occurred_at>=?1 AND occurred_at<?2
      AND traffic_class<>'QA' AND visitor_id<>''`)
      .bind(ANNUAL_TRAFFIC_TARGET.start_at, ANNUAL_TRAFFIC_TARGET.end_at).first();
    const annualVisitors = safeCount(annualTraffic?.visitors);
    return {
      status: 'READY', north_star: '商品発見セッション', registered_members: registeredMembers,
      definition: '検索成功後に商品・ランキング・価格比較・お気に入り・共有・モール送客へ進んだ重複なしセッション',
      annual_traffic_goal: {
        ...ANNUAL_TRAFFIC_TARGET,
        metric: 'QAアクセスを除く匿名ユニーク訪問者',
        actual_visitors: annualVisitors,
        remaining_visitors: Math.max(0, ANNUAL_TRAFFIC_TARGET.visitors - annualVisitors),
        progress_percent: Math.round((annualVisitors / ANNUAL_TRAFFIC_TARGET.visitors) * 10000) / 100
      },
      search_input_mix: { '7d': period7d.search_input_mix, '30d': period30d.search_input_mix },
      periods: { '7d': period7d, '30d': period30d }
    };
  } catch (error) {
    console.error(JSON.stringify({ event: 'promotion_kpi_query_failed', error: String(error?.message || error).slice(0, 120) }));
    return { status: 'UNAVAILABLE', error: 'KPI_DATA_UNAVAILABLE', registered_members: registeredMembers, periods: {} };
  }
}

function codexMetricSet(metrics = {}) {
  return {
    counts: Object.fromEntries(CODEX_KPI_COUNT_KEYS.map(key => [key, safeCount(metrics[key])])),
    rates_percent: Object.fromEntries(CODEX_KPI_RATE_KEYS.map(key => [key,
      metrics.rates?.[key] === null || metrics.rates?.[key] === undefined
        ? null : safeNumber(metrics.rates[key])])),
    avg_search_seconds: safeNumber(metrics.avg_search_seconds),
    avg_value_seconds: safeNumber(metrics.avg_value_seconds),
    last_event_at: String(metrics.last_event_at || '')
  };
}

function codexPeriod(period = {}) {
  const performance = period.search_input_mix?.performance || {};
  return {
    start_at: String(period.start_at || ''),
    end_at: String(period.end_at || ''),
    current: codexMetricSet(period.current),
    previous: codexMetricSet(period.previous),
    change_percent: {
      counts: Object.fromEntries(CODEX_KPI_COUNT_KEYS
        .filter(key => Object.hasOwn(period.comparison?.counts || {}, key))
        .map(key => [key, period.comparison.counts[key]])),
      rates_points: Object.fromEntries(CODEX_KPI_RATE_KEYS
        .filter(key => Object.hasOwn(period.comparison?.rates || {}, key))
        .map(key => [key, period.comparison.rates[key]]))
    },
    search_input: Object.fromEntries(Object.keys(SEARCH_INPUT_EVENTS)
      .map(key => SEARCH_INPUT_EVENTS[key][0]).filter((value, index, values) => values.indexOf(value) === index)
      .map(type => [type, {
        attempts: safeCount(performance[type]?.attempts),
        completed: safeCount(performance[type]?.completed),
        outbound: safeCount(performance[type]?.outbound),
        mix_rate_percent: safeNumber(performance[type]?.mix_rate),
        success_rate_percent: safeNumber(performance[type]?.success_rate),
        outbound_rate_percent: safeNumber(performance[type]?.outbound_rate)
      }]))
  };
}

function codexPriority(period = {}) {
  const counts = period.current?.counts || {};
  const rates = period.current?.rates_percent || {};
  if ((rates.tracking_coverage ?? 0) < 90) {
    return { status: 'HOLD', code: 'MEASUREMENT_COVERAGE',
      evidence: { actual_percent: rates.tracking_coverage ?? 0, required_percent: 90 } };
  }
  if ((counts.search_sessions || 0) < 20) {
    return { status: 'HOLD', code: 'SAMPLE_GATHERING',
      evidence: { search_sessions: counts.search_sessions || 0, required_search_sessions: 20 } };
  }
  const stages = [
    ['VISIT_TO_SEARCH', counts.landing_sessions, counts.search_sessions, rates.visit_to_search],
    ['SEARCH_COMPLETION', counts.search_sessions, counts.completed_search_sessions, rates.search_completion],
    ['VALUE_REALIZATION', counts.completed_search_sessions, counts.value_sessions, rates.value_realization],
    ['MARKETPLACE_OUTBOUND', counts.value_sessions, counts.outbound_sessions,
      percentage(counts.outbound_sessions, counts.value_sessions)]
  ].filter(([, from]) => from > 0)
    .map(([code, from, to, rate]) => ({ code, from, to, lost: Math.max(0, from - to), rate_percent: rate }))
    .sort((left, right) => right.lost - left.lost);
  const priority = stages[0];
  return priority
    ? { status: 'ACTION', code: priority.code, evidence: priority }
    : { status: 'HOLD', code: 'NO_FUNNEL_SAMPLE', evidence: {} };
}

async function codexSocialKpis(env, now) {
  const since = shiftDays(now, -7).toISOString();
  const [queueResult, funnelResult] = await Promise.all([
    env.PRODUCT_DB.prepare(`SELECT platform,status,COUNT(*) AS total,
      MAX(CASE WHEN status='PUBLISHED' THEN published_at ELSE '' END) AS last_published_at
      FROM social_post_queue GROUP BY platform,status`).all(),
    env.PRODUCT_DB.prepare(`SELECT LOWER(source) AS source,event_type,COUNT(*) AS total
      FROM growth_events WHERE occurred_at>=?1 AND traffic_class='ATTRIBUTED'
      AND LOWER(source) IN ('x','instagram','tiktok')
      AND event_type IN ('landing_view','search_started','search_completed','search_failed',
        'ai_result_clicked','ranking_result_clicked','price_comparison_opened','marketplace_click','returning_visit')
      GROUP BY LOWER(source),event_type`).bind(since).all()
  ]);
  const channels = new Map(PLATFORMS.map(platform => [platform, {
    queue: Object.fromEntries(SOCIAL_QUEUE_STATUSES.map(status => [status.toLowerCase(), 0])),
    last_published_at: '', funnel_7d: emptyFunnel()
  }]));
  for (const row of queueResult.results || []) {
    const channel = channels.get(String(row.platform || ''));
    const status = String(row.status || '');
    if (!channel || !SOCIAL_QUEUE_STATUSES.includes(status)) continue;
    channel.queue[status.toLowerCase()] = safeCount(row.total);
    if (status === 'PUBLISHED') channel.last_published_at = String(row.last_published_at || '');
  }
  for (const row of funnelResult.results || []) {
    const platform = PLATFORMS.find(value => SOURCE_BY_PLATFORM[value] === String(row.source || '').toLowerCase());
    const channel = channels.get(platform);
    if (channel && FUNNEL_EVENTS.includes(row.event_type)) channel.funnel_7d[row.event_type] = safeCount(row.total);
  }
  return Object.fromEntries(PLATFORMS.map(platform => {
    const channel = channels.get(platform);
    return [platform, {
      ...channel,
      rates_percent_7d: {
        visit_to_search: percentage(channel.funnel_7d.search_started, channel.funnel_7d.landing_view),
        search_completion: percentage(channel.funnel_7d.search_completed, channel.funnel_7d.search_started),
        marketplace_outbound: percentage(channel.funnel_7d.marketplace_click, channel.funnel_7d.search_completed)
      }
    }];
  }));
}

export async function codexKpiSnapshotSummary(env, now = new Date()) {
  const generatedAt = new Date(now);
  if (!env.PRODUCT_DB || !Number.isFinite(generatedAt.getTime())) {
    throw new Error('CODEX_KPI_INPUT_INVALID');
  }
  const [business, social] = await Promise.all([
    businessKpiSummary(env, generatedAt), codexSocialKpis(env, generatedAt)
  ]);
  if (business.status !== 'READY') throw new Error('CODEX_KPI_DATA_UNAVAILABLE');
  const periods = {
    '7d': codexPeriod(business.periods['7d']),
    '30d': codexPeriod(business.periods['30d'])
  };
  return {
    schema: 'hoshilu.codex-kpi.aggregate.v1',
    generated_at: generatedAt.toISOString(),
    privacy: {
      scope: 'AGGREGATE_ONLY',
      personal_data: false,
      raw_search_text: false,
      raw_event_ids: false,
      post_text_or_ids: false,
      arbitrary_utm_values: false
    },
    north_star: {
      code: 'PRODUCT_DISCOVERY_SESSIONS',
      actual_7d: periods['7d'].current.counts.value_sessions,
      actual_30d: periods['30d'].current.counts.value_sessions
    },
    annual_anonymous_visitors: {
      target: safeCount(business.annual_traffic_goal.visitors),
      actual: safeCount(business.annual_traffic_goal.actual_visitors),
      remaining: safeCount(business.annual_traffic_goal.remaining_visitors),
      progress_percent: safeNumber(business.annual_traffic_goal.progress_percent),
      daily_pace_target: safeCount(business.annual_traffic_goal.daily_pace),
      monthly_pace_target: safeCount(business.annual_traffic_goal.monthly_pace)
    },
    registered_members: safeCount(business.registered_members),
    periods,
    social,
    improvement_priority: codexPriority(periods['7d'])
  };
}

async function socialPromotionSummary(env, now) {
  const warnings = [];
  const query = async (label, operation, fallback = { results: [] }) => {
    try { return await operation(); } catch (error) {
      warnings.push(label);
      console.error(JSON.stringify({ event: 'promotion_social_query_failed', query: label,
        error: String(error?.message || error).slice(0, 120) }));
      return fallback;
    }
  };
  const queue = await query('queue_counts', () => env.PRODUCT_DB.prepare(`SELECT platform,status,COUNT(*) AS total,
    MAX(CASE WHEN status='PUBLISHED' THEN published_at ELSE '' END) AS last_published_at
    FROM social_post_queue GROUP BY platform,status ORDER BY platform,status`).all());
  const upcoming = await query('upcoming_posts', () => env.PRODUCT_DB.prepare(`SELECT post_id,platform,caption,scheduled_at,status
    FROM social_post_queue WHERE status IN ('APPROVED','PUBLISHING') AND scheduled_at>=?1
    ORDER BY scheduled_at ASC LIMIT 30`).bind(now.toISOString()).all());
  const recent = await query('recent_posts', () => env.PRODUCT_DB.prepare(`SELECT post_id,platform,caption,scheduled_at,published_at,
    status,external_post_id,last_error FROM social_post_queue
    WHERE status IN ('PUBLISHED','FAILED') ORDER BY updated_at DESC LIMIT 30`).all());
  const since = shiftDays(now, -7).toISOString();
  const funnelResult = await query('social_funnel', () => env.PRODUCT_DB.prepare(`SELECT LOWER(source) AS source,event_type,COUNT(*) AS total
    FROM growth_events WHERE occurred_at>=?1 AND traffic_class='ATTRIBUTED'
    AND LOWER(source) IN ('x','instagram','tiktok') GROUP BY LOWER(source),event_type`).bind(since).all());
  const readiness = socialPublisherReadiness(env);
  const grouped = new Map(PLATFORMS.map(platform => [platform, {
    platform, configured: Boolean(readiness[platform]), schedule: SCHEDULES[platform],
    counts: { approved: 0, publishing: 0, published: 0, failed: 0, cancelled: 0, review_required: 0 },
    next: null, recent: [], last_published_at: '', funnel_7d: emptyFunnel(),
    funnel_rates_7d: { search_completion: null, comparison_reach: null, marketplace_outbound: null }
  }]));
  for (const row of queue.results || []) {
    const channel = grouped.get(row.platform);
    if (!channel) continue;
    channel.counts[String(row.status || '').toLowerCase()] = safeCount(row.total);
    if (row.last_published_at > channel.last_published_at) channel.last_published_at = row.last_published_at;
  }
  for (const row of upcoming.results || []) {
    const channel = grouped.get(row.platform);
    if (channel && !channel.next) channel.next = row;
  }
  for (const row of recent.results || []) {
    const channel = grouped.get(row.platform);
    if (channel && channel.recent.length < 5) channel.recent.push(row);
  }
  for (const row of funnelResult.results || []) {
    const platform = PLATFORMS.find(value => SOURCE_BY_PLATFORM[value] === String(row.source || '').toLowerCase());
    const channel = grouped.get(platform);
    if (channel && FUNNEL_EVENTS.includes(row.event_type)) channel.funnel_7d[row.event_type] = safeCount(row.total);
  }
  for (const channel of grouped.values()) {
    const funnel = channel.funnel_7d;
    channel.funnel_rates_7d = {
      search_completion: percentage(funnel.search_completed, funnel.search_started),
      comparison_reach: percentage(funnel.price_comparison_opened, funnel.search_completed),
      marketplace_outbound: percentage(funnel.marketplace_click, funnel.search_completed)
    };
  }
  return { warnings, channels: PLATFORMS.map(platform => grouped.get(platform)) };
}

export async function promotionDashboardSummary(env, now = new Date()) {
  const [businessKpis, social] = await Promise.all([
    businessKpiSummary(env, now), socialPromotionSummary(env, now)
  ]);
  return {
    ok: true, generated_at: now.toISOString(),
    autopilot_enabled: env.SOCIAL_AUTOPILOT_ENABLED === 'true',
    business_kpis: businessKpis, social_warnings: social.warnings, channels: social.channels
  };
}

export async function handlePromotionDashboardRoutes(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/admin/promotion-dashboard') return null;
  if (!await authorizeAdminRequest(request, env)) {
    return noStoreJson({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!env.PRODUCT_DB) {
    return noStoreJson({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  }
  return noStoreJson(await promotionDashboardSummary(env));
}
