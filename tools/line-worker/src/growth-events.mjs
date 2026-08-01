const EVENTS = new Set([
  'landing_view',
  'search_started',
  'search_completed',
  'registration_started',
  'registration_completed',
  'return_visit',
  'pwa_install_prompted',
  'pwa_install_completed',
  'wish_saved',
  'marketplace_click',
  'share_started'
]);
const LOCALES = new Set(['JA', 'EN', 'ZH', 'KO']);
const MARKETPLACES = new Set(['', 'AMAZON_JP', 'RAKUTEN_JP', 'QOO10_JP', 'SHEIN_JP']);

function clean(value, length = 80) {
  return String(value || '').trim().replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, length);
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
    marketplace: MARKETPLACES.has(marketplace) ? marketplace : ''
  };
}

export async function handleGrowthEvent(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/events') return null;
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'EVENT_STORE_UNAVAILABLE' }, { status: 503 });
  let event;
  try {
    event = normalizeGrowthEvent(await request.json());
  } catch {
    return Response.json({ ok: false, error: 'EVENT_INVALID' }, { status: 400 });
  }
  const trafficClass = classifyGrowthTraffic(event);
  await env.PRODUCT_DB.prepare(
    `INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
  ).bind(
    crypto.randomUUID(), event.event_type, event.locale, event.source, event.medium,
    event.campaign, event.content, event.marketplace, new Date().toISOString(), trafficClass
  ).run();
  return Response.json({ ok: true }, {
    status: 202,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}
