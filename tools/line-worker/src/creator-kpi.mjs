// 2026-09-04 総合実行指示書 §66–70 インフルエンサー第三市場: Creator 別の実数KPI。
//
// 計測URL: https://hoshilu.app/?creator_id=<creator>&campaign_id=<campaign>&creative_id=<creative>
//（短縮 cr / cp / cv も可。UTM を併用してもよい）。growth-analytics.mjs が 30 日間引き継ぎ、
// growth_events の creator_id / campaign_id / creative_id（migration 0070）に入る。
// ここでは QA を除いた実数だけを、Creator → 施策 → クリエイティブの順で集計する。
// 会員登録・問い合わせはサーバ側イベント（Creator 属性なし）なので、ここには含めない。

import { authorizeAdminRequest } from './admin-auth.mjs';
import { creatorSafeId } from './growth-events.mjs';

const STAGES = ['landing_view', 'search_started', 'search_completed', 'marketplace_click', 'wish_saved', 'returning_visit', 'shop_followed'];

function noStoreJson(body, init = {}) {
  return Response.json(body, { ...init, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(init.headers || {}) } });
}

function stageColumns() {
  return STAGES.map((stage) => `SUM(CASE WHEN event_type='${stage}' THEN 1 ELSE 0 END) AS ${stage}`).join(',');
}

function groupSql(groupExpr) {
  return `SELECT ${groupExpr} AS key_value,
    COUNT(DISTINCT CASE WHEN session_id<>'' THEN session_id END) AS sessions,
    COUNT(DISTINCT CASE WHEN visitor_id<>'' THEN visitor_id END) AS visitors,
    ${stageColumns()},
    MIN(occurred_at) AS first_seen, MAX(occurred_at) AS last_seen
    FROM growth_events
    WHERE creator_id<>'' AND traffic_class<>'QA' AND occurred_at>=?1 AND occurred_at<?2 ${groupExpr === 'creator_id' ? '' : 'AND creator_id=?3'}
    GROUP BY ${groupExpr} ORDER BY sessions DESC, key_value LIMIT 200`;
}

function shapeRow(row) {
  const out = { key: String(row.key_value || ''), sessions: Number(row.sessions || 0), visitors: Number(row.visitors || 0), first_seen: row.first_seen || '', last_seen: row.last_seen || '' };
  for (const stage of STAGES) out[stage] = Number(row[stage] || 0);
  out.search_rate = out.sessions ? Math.round(out.search_started / out.sessions * 1000) / 10 : 0;
  out.click_rate = out.sessions ? Math.round(out.marketplace_click / out.sessions * 1000) / 10 : 0;
  return out;
}

export function creatorTrackingUrl({ origin = 'https://hoshilu.app', path = '/', creator_id, campaign_id = '', creative_id = '', utm_source = '', query = '' } = {}) {
  const creator = creatorSafeId(creator_id);
  if (!creator) throw new Error('CREATOR_ID_INVALID');
  const url = new URL(path.startsWith('/') ? path : `/${path}`, origin);
  if (query) url.searchParams.set('q', String(query).slice(0, 80));
  url.searchParams.set('creator_id', creator);
  const campaign = creatorSafeId(campaign_id);
  const creative = creatorSafeId(creative_id);
  if (campaign) url.searchParams.set('campaign_id', campaign);
  if (creative) url.searchParams.set('creative_id', creative);
  const source = creatorSafeId(utm_source);
  if (source) { url.searchParams.set('utm_source', source); url.searchParams.set('utm_medium', 'influencer'); }
  return url.toString();
}

export async function creatorKpiSummary(env, { days = 30, creatorId = '', now = new Date() } = {}) {
  const span = Math.min(Math.max(Number(days) || 30, 1), 180);
  const end = new Date(now.getTime() + 60000).toISOString();
  const start = new Date(now.getTime() - span * 86400000).toISOString();
  const db = env.PRODUCT_DB;
  let columnsReady = true;
  let creators = [];
  try {
    const rows = await db.prepare(groupSql('creator_id')).bind(start, end).all();
    creators = (rows.results || []).map(shapeRow);
  } catch (error) {
    if (!/no such column.*creator_id/i.test(String(error?.message || error))) throw error;
    columnsReady = false;
  }
  const selected = creatorSafeId(creatorId);
  let campaigns = [];
  let creatives = [];
  if (columnsReady && selected) {
    const [c1, c2] = await Promise.all([
      db.prepare(groupSql('campaign_id')).bind(start, end, selected).all(),
      db.prepare(groupSql('creative_id')).bind(start, end, selected).all()
    ]);
    campaigns = (c1.results || []).map(shapeRow);
    creatives = (c2.results || []).map(shapeRow);
  }
  return {
    ok: true, days: span, window: { start, end }, columns_ready: columnsReady,
    stages: STAGES, creators, selected_creator: selected, campaigns, creatives,
    totals: creators.reduce((acc, row) => {
      acc.sessions += row.sessions; acc.visitors += row.visitors;
      for (const stage of STAGES) acc[stage] = (acc[stage] || 0) + row[stage];
      return acc;
    }, { sessions: 0, visitors: 0 })
  };
}

export async function handleCreatorKpiRoutes(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/creators')) return null;
  if (!await authorizeAdminRequest(request, env)) return noStoreJson({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  if (request.method === 'GET' && url.pathname === '/api/admin/creators/summary') {
    if (!env.PRODUCT_DB) return noStoreJson({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
    return noStoreJson(await creatorKpiSummary(env, { days: url.searchParams.get('days'), creatorId: url.searchParams.get('creator_id') }));
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/creators/url') {
    try {
      return noStoreJson({ ok: true, url: creatorTrackingUrl({
        origin: url.origin, path: url.searchParams.get('path') || '/', creator_id: url.searchParams.get('creator_id'),
        campaign_id: url.searchParams.get('campaign_id'), creative_id: url.searchParams.get('creative_id'),
        utm_source: url.searchParams.get('utm_source'), query: url.searchParams.get('q')
      }) });
    } catch (error) {
      return noStoreJson({ ok: false, error: String(error.message || error) }, { status: 400 });
    }
  }
  return noStoreJson({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
