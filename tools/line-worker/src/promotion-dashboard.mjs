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
  const grouped = new Map(PLATFORMS.map(platform => [platform, {
    platform,
    configured: Boolean(readiness[platform]),
    schedule: SCHEDULES[platform],
    counts: { approved: 0, publishing: 0, published: 0, failed: 0, cancelled: 0, review_required: 0 },
    next: null,
    recent: [],
    last_published_at: ''
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
  return {
    ok: true,
    generated_at: now.toISOString(),
    autopilot_enabled: env.SOCIAL_AUTOPILOT_ENABLED === 'true',
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
