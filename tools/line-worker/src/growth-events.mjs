const EVENTS = new Set([
  'landing_view',
  'search_started',
  'search_completed',
  'search_failed',
  'search_dead_end',
  'search_degraded',
  'ai_result_clicked',
  'ranking_result_clicked',
  'price_comparison_opened',
  'returning_visit',
  'wish_saved',
  'marketplace_click',
  'share_started',
  'seo_article_view',
  'seo_search_transition',
  'seo_hub_view',
  'seo_hub_search_transition',
  'seo_comparison_view',
  'seo_evidence_view',
  'seo_review_guide_view',
  'seo_identity_guide_view',
  'member_registered',
  'inquiry_submitted'
]);
const LOCALES = new Set(['JA', 'EN', 'ZH', 'KO']);
const MARKETPLACES = new Set([
  '', 'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
  'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP',
  // v4.2 項目14で追加された5モール。SHOPLIST_JP/MUSINSA_JPは新規の検索導線
  // からは外れたが、既存クリックイベントの後方互換のためこのSetには残す。
  'LOFT_JP', 'HANDS_JP', 'MATSUKIYO_JP', 'COSME_JP', 'ABCMART_JP'
]);

function clean(value, length = 80) {
  return String(value || '').trim().replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, length);
}

function anonymousId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-f0-9-]{20,64}$/.test(normalized) ? normalized : '';
}

export function classifyGrowthTraffic(event = {}) {
  const source = clean(event.source).toLowerCase();
  const medium = clean(event.medium).toLowerCase();
  const campaign = clean(event.campaign).toLowerCase();
  const content = clean(event.content).toLowerCase();
  const qaSignal = source.startsWith('codex')
    || source.startsWith('test')
    || source.startsWith('qa')
    || medium === 'qa'
    || campaign.includes('acceptance')
    || campaign.includes('test');
  if (qaSignal) return 'QA';
  return source || medium || campaign || content ? 'ATTRIBUTED' : 'UNATTRIBUTED';
}

export function normalizeGrowthEvent(input = {}) {
  const eventType = String(input.event_type || '').trim().toLowerCase();
  if (!EVENTS.has(eventType)) throw new Error('GROWTH_EVENT_INVALID');
  const locale = String(input.locale || 'JA').trim().toUpperCase();
  const marketplace = String(input.marketplace || '').trim().toUpperCase();
  return {
    event_type: eventType,
    locale: LOCALES.has(locale) ? locale : 'JA',
    source: clean(input.source),
    medium: clean(input.medium),
    campaign: clean(input.campaign),
    content: clean(input.content),
    marketplace: MARKETPLACES.has(marketplace) ? marketplace : '',
    visitor_id: anonymousId(input.visitor_id),
    session_id: anonymousId(input.session_id)
  };
}

// Internal-only operational telemetry. This event type is intentionally not
// in the public EVENTS allowlist, so /api/events cannot forge it. It stores
// only a server request ID and a bounded error code, never the search text.
export async function recordSearchOperationalFailure(env, { requestId = '', code = '' } = {}) {
  if (!env?.PRODUCT_DB) return false;
  const safeCode = /^[A-Z][A-Z0-9_]{2,79}$/u.test(String(code || ''))
    ? String(code) : 'KNOWLEDGE_INTERNAL_ERROR';
  const values = [
    crypto.randomUUID(), 'search_backend_failed', 'JA', 'worker', 'operational',
    safeCode, clean(requestId), '', new Date().toISOString(), 'UNATTRIBUTED', '', ''
  ];
  try {
    await env.PRODUCT_DB.prepare(
      `INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    ).bind(...values).run();
  } catch (error) {
    const message = String(error?.message || error);
    if (!/(?:no column named|has no column named|no such column).*(?:visitor_id|session_id)/i.test(message)) throw error;
    await env.PRODUCT_DB.prepare(
      `INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
    ).bind(...values.slice(0, 10)).run();
  }
  return true;
}

export async function handleGrowthEvent(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/events') return null;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'EVENT_STORE_UNAVAILABLE' }, { status: 503 });
  let event;
  try {
    event = normalizeGrowthEvent(await request.json());
  } catch {
    return Response.json({ ok: false, error: 'EVENT_INVALID' }, { status: 400 });
  }
  const trafficClass = classifyGrowthTraffic(event);
  if (event.event_type === 'search_dead_end') {
    // Advisory RUM can be forged by a browser, so correlate it to a recent
    // search_started from the same anonymous session before accepting it.
    if (!event.session_id) return Response.json({ ok: false, error: 'EVENT_CORRELATION_REQUIRED' }, { status: 400 });
    try {
      const started = await env.PRODUCT_DB.prepare(
        `SELECT 1 AS found FROM growth_events
         WHERE session_id=?1 AND event_type='search_started'
           AND occurred_at>=?2 LIMIT 1`
      ).bind(event.session_id, new Date(Date.now() - 5 * 60000).toISOString()).first();
      if (!started?.found) return Response.json({ ok: false, error: 'EVENT_CORRELATION_REQUIRED' }, { status: 400 });
    } catch {
      return Response.json({ ok: false, error: 'EVENT_CORRELATION_UNAVAILABLE' }, { status: 503 });
    }
  }
  const values = [
    crypto.randomUUID(), event.event_type, event.locale, event.source, event.medium,
    event.campaign, event.content, event.marketplace, new Date().toISOString(), trafficClass,
    event.visitor_id, event.session_id
  ];
  let identityRecorded = true;
  try {
    await env.PRODUCT_DB.prepare(
      `INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    ).bind(...values).run();
  } catch (error) {
    const message = String(error?.message || error);
    const visitorColumnsMissing = /(?:no column named|has no column named|no such column).*(?:visitor_id|session_id)/i.test(message);
    if (!visitorColumnsMissing) throw error;
    // Production migrations are intentionally manual. Keep privacy-safe event
    // counts available while migration 0047 is pending, without pretending
    // visitor/session retention metrics are connected.
    identityRecorded = false;
    await env.PRODUCT_DB.prepare(
      `INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
    ).bind(...values.slice(0, 10)).run();
  }
  return Response.json({ ok: true, identity_recorded: identityRecorded }, {
    status: 202,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}
