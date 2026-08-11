import { authorizeAdminRequest } from './admin-auth.mjs';
import { socialPublisherReadiness } from './social-publisher.mjs';

const PLATFORMS = ['X', 'INSTAGRAM', 'TIKTOK'];
const SCHEDULES = Object.freeze({
  X: '日・月・水・金 20:00',
  INSTAGRAM: '月・火・土 20:15（リール）',
  TIKTOK: '未接続'
});

function noStoreJson(value, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(value, { ...init, headers });
}

const safeCount = value => Math.max(0, Number(value || 0));

const SOURCE_BY_PLATFORM = Object.freeze({ X: 'x', INSTAGRAM: 'instagram', TIKTOK: 'tiktok' });
const FUNNEL_EVENTS = Object.freeze([
  'landing_view', 'search_started', 'search_completed', 'ai_result_clicked',
  'ranking_result_clicked', 'price_comparison_opened', 'marketplace_click', 'returning_visit'
]);
const emptyFunnel = () => Object.fromEntries(FUNNEL_EVENTS.map(event => [event, 0]));
const percentage = (numerator, denominator) => denominator > 0
  ? Math.round((numerator / denominator) * 1000) / 10 : null;

async function businessKpiSummary(env, now) {
  const since7d = new Date(now.getTime() - (7 * 86400000)).toISOString();
  const since30d = new Date(now.getTime() - (30 * 86400000)).toISOString();
  const empty = { visitors: 0, sessions: 0, landing_view: 0, search_started: 0, search_completed: 0,
    ai_result_clicked: 0, ranking_result_clicked: 0, price_comparison_opened: 0,
    marketplace_click: 0, returning_visit: 0, member_registered: 0 };
  const period = async (since) => {
    const counts = { ...empty };
    const totals = await env.PRODUCT_DB.prepare(`SELECT
      COUNT(DISTINCT CASE WHEN visitor_id<>'' THEN visitor_id END) AS visitors,
      COUNT(DISTINCT CASE WHEN session_id<>'' THEN session_id END) AS sessions
      FROM growth_events WHERE occurred_at>=?1 AND traffic_class<>'QA'`).bind(since).first();
    counts.visitors = safeCount(totals?.visitors);
    counts.sessions = safeCount(totals?.sessions);
    const result = await env.PRODUCT_DB.prepare(`SELECT event_type,COUNT(*) AS total
      FROM growth_events WHERE occurred_at>=?1 AND traffic_class<>'QA' GROUP BY event_type`).bind(since).all();
    for (const row of result.results || []) {
      if (Object.hasOwn(counts, row.event_type)) counts[row.event_type] = safeCount(row.total);
    }
    return { ...counts, rates: {
      visit_to_search: percentage(counts.search_started, counts.landing_view),
      search_completion: percentage(counts.search_completed, counts.search_started),
      result_engagement: percentage(counts.ai_result_clicked + counts.ranking_result_clicked, counts.search_completed),
      comparison_reach: percentage(counts.price_comparison_opened, counts.search_completed),
      marketplace_outbound: percentage(counts.marketplace_click, counts.search_completed),
      registration: percentage(counts.member_registered, counts.landing_view)
    } };
  };
  let registeredMembers = 0;
  try {
    const row = await env.PRODUCT_DB.prepare(`SELECT COUNT(DISTINCT member_id) AS total
      FROM member_notification_destinations WHERE verified_at<>''`).first();
    registeredMembers = safeCount(row?.total);
  } catch {}
  return { registered_members: registeredMembers, periods: { '7d': await period(since7d), '30d': await period(since30d) } };
}

export async function promotionDashboardSummary(env, now = new Date()) {
  const queue = await env.PRODUCT_DB.prepare(`SELECT platform,status,COUNT(*) AS total,
    MAX(CASE WHEN status='PUBLISHED' THEN published_at ELSE '' END) AS last_published_at
    FROM social_post_queue GROUP BY platform,status ORDER BY platform,status`).all();
  const upcoming = await env.PRODUCT_DB.prepare(`SELECT post_id,platform,caption,scheduled_at,status
    FROM social_post_queue WHERE status IN ('APPROVED','PUBLISHING') AND scheduled_at>=?1
    ORDER BY scheduled_at ASC LIMIT 30`).bind(now.toISOString()).all();
  const recent = await env.PRODUCT_DB.prepare(`SELECT post_id,platform,caption,scheduled_at,published_at,
    status,external_post_id,last_error FROM social_post_queue
    WHERE status IN ('PUBLISHED','FAILED') ORDER BY updated_at DESC LIMIT 30`).all();
  const readiness = socialPublisherReadiness(env);
  const since = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString();
  let funnelRows = [];
  try {
    const result = await env.PRODUCT_DB.prepare(`SELECT LOWER(source) AS source,event_type,COUNT(*) AS total
      FROM growth_events WHERE occurred_at>=?1 AND traffic_class='ATTRIBUTED'
      AND LOWER(source) IN ('x','instagram','tiktok')
      GROUP BY LOWER(source),event_type`).bind(since).all();
    funnelRows = result.results || [];
  } catch {
    // 移行前の開発DBでも、投稿運用画面そのものは利用可能に保つ。
  }
  const grouped = new Map(PLATFORMS.map(platform => [platform, {
    platform,
    configured: Boolean(readiness[platform]),
    schedule: SCHEDULES[platform],
    counts: { approved: 0, publishing: 0, published: 0, failed: 0, cancelled: 0, review_required: 0 },
    next: null,
    recent: [],
    last_published_at: '',
    funnel_7d: emptyFunnel(),
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
  for (const row of funnelRows) {
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
  return {
    ok: true,
    generated_at: now.toISOString(),
    autopilot_enabled: env.SOCIAL_AUTOPILOT_ENABLED === 'true',
    business_kpis: await businessKpiSummary(env, now),
    channels: PLATFORMS.map(platform => grouped.get(platform))
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
