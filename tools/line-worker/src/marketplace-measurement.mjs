// HOSHILU GAS→Web移行: gas/MarketplaceMeasurementEngine.gs をWorker/D1へ移植。
// 既存のKPI計測(measurement.mjs)と同じ考え方で、購入先Marketplace別の選択
// 状況をWorkerが並走記録する。GAS側のシートは変更しない。
const MARKETPLACES = new Set(['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP']);
const EVENT_TYPES = new Set(['CLICK', 'OUTBOUND']);
const CHANNELS = new Set(['LINE', 'PWA']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function clean(value, field) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 200) throw fail('MARKETPLACE_KPI_FIELD_INVALID');
  return text;
}

function toJstDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw fail('MARKETPLACE_KPI_DATE_INVALID');
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// gas/MarketplaceMeasurementEngine.gs normalizeEvent() の忠実な移植。
export function normalizeEvent(source = {}, recordedAt) {
  if (source.consent !== true) throw fail('MARKETPLACE_KPI_CONSENT_REQUIRED');
  const marketplace = clean(source.marketplace, 'Marketplace').toUpperCase();
  const eventType = clean(source.event_type, 'Event_Type').toUpperCase();
  const channel = clean(source.channel, 'Channel').toUpperCase();
  if (!MARKETPLACES.has(marketplace)) throw fail('MARKETPLACE_KPI_MARKETPLACE_INVALID');
  if (!EVENT_TYPES.has(eventType)) throw fail('MARKETPLACE_KPI_EVENT_INVALID');
  if (!CHANNELS.has(channel)) throw fail('MARKETPLACE_KPI_CHANNEL_INVALID');
  const occurredAt = clean(source.occurred_at, 'Occurred_At');
  const tenant = clean(source.tenant, 'Tenant').toLowerCase();
  const accountType = clean(source.account_type, 'Account_Type').toUpperCase();
  const accountId = clean(source.account_id, 'Account_ID');
  const eventId = clean(source.event_id, 'Event_ID');
  const sessionId = clean(source.session_id, 'Session_ID');
  const asin = clean(source.asin, 'ASIN').toUpperCase();
  if (/@/.test(sessionId) || /\s/.test(sessionId)) throw fail('MARKETPLACE_KPI_SESSION_UNSAFE');
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw fail('MARKETPLACE_KPI_ASIN_INVALID');
  return {
    event_key: [tenant, accountType, accountId, eventId].join('|'),
    event_id: eventId,
    occurred_at: new Date(occurredAt).toISOString(),
    date_jst: toJstDateKey(occurredAt),
    tenant, account_type: accountType, account_id: accountId, session_id: sessionId,
    recommendation_id: clean(source.recommendation_id, 'Recommendation_ID'),
    asin, marketplace, event_type: eventType, channel, consent: true,
    recorded_at: recordedAt || new Date().toISOString()
  };
}

// gas/MarketplaceMeasurementEngine.gs record() のD1版。
export async function recordEvents(env, events) {
  if (!Array.isArray(events) || events.length === 0) return { accepted: 0, duplicated: 0 };
  if (events.length > 200) throw fail('MARKETPLACE_KPI_BATCH_INVALID');
  if (!env.PRODUCT_DB) throw fail('MARKETPLACE_KPI_STORE_NOT_CONFIGURED');
  const now = new Date().toISOString();
  const seen = new Set();
  const rows = [];
  let duplicated = 0;
  for (const raw of events) {
    const normalized = normalizeEvent(raw, now);
    if (seen.has(normalized.event_key)) {
      duplicated += 1;
      continue;
    }
    seen.add(normalized.event_key);
    rows.push(normalized);
  }
  if (!rows.length) return { accepted: 0, duplicated };
  const sql = `INSERT INTO marketplace_kpi_events (
    event_key,event_id,occurred_at,date_jst,tenant,account_type,account_id,session_id,
    recommendation_id,asin,marketplace,event_type,channel,consent,recorded_at
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
  ON CONFLICT(event_key) DO NOTHING`;
  const prepared = env.PRODUCT_DB.prepare(sql);
  const statements = rows.map((event) => prepared.bind(
    event.event_key, event.event_id, event.occurred_at, event.date_jst, event.tenant,
    event.account_type, event.account_id, event.session_id, event.recommendation_id,
    event.asin, event.marketplace, event.event_type, event.channel, event.consent ? 1 : 0, event.recorded_at
  ));
  const results = await env.PRODUCT_DB.batch(statements);
  const accepted = results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
  return { accepted, duplicated: duplicated + (rows.length - accepted) };
}

// gas/MarketplaceMeasurementEngine.gs summarize() の忠実な移植。
export function summarize(events, updatedAt) {
  const groups = new Map();
  const totals = new Map();
  for (const event of events || []) {
    const baseKey = [event.date_jst, event.tenant, event.account_type, event.account_id, event.channel].join('|');
    const key = `${baseKey}|${event.marketplace}`;
    if (!groups.has(key)) {
      groups.set(key, {
        date_jst: event.date_jst, tenant: event.tenant, account_type: event.account_type,
        account_id: event.account_id, channel: event.channel, marketplace: event.marketplace,
        clicks: 0, outbound: 0, sessions: new Set(), asins: new Set()
      });
    }
    const group = groups.get(key);
    if (event.event_type === 'CLICK') {
      group.clicks += 1;
      totals.set(baseKey, (totals.get(baseKey) || 0) + 1);
    }
    if (event.event_type === 'OUTBOUND') group.outbound += 1;
    group.sessions.add(event.session_id);
    group.asins.add(event.asin);
  }
  return [...groups.keys()].sort().map((key) => {
    const group = groups.get(key);
    const baseKey = [group.date_jst, group.tenant, group.account_type, group.account_id, group.channel].join('|');
    const total = totals.get(baseKey) || 0;
    return {
      date_jst: group.date_jst, tenant: group.tenant, account_type: group.account_type,
      account_id: group.account_id, channel: group.channel, marketplace: group.marketplace,
      clicks: group.clicks, outbound: group.outbound,
      unique_sessions: group.sessions.size, unique_asins: group.asins.size,
      click_selection_share: total ? Math.round((group.clicks / total) * 10000) / 10000 : 0,
      updated_at: updatedAt || new Date().toISOString()
    };
  });
}

// gas/MarketplaceMeasurementEngine.gs refreshSummary() のD1版(全件再計算・総入れ替え)。
export async function refreshMarketplaceKpiSummary(env) {
  if (!env.PRODUCT_DB) return { skipped: true };
  const result = await env.PRODUCT_DB.prepare('SELECT * FROM marketplace_kpi_events').all();
  const events = result.results || [];
  const updatedAt = new Date().toISOString();
  const rows = summarize(events, updatedAt);
  await env.PRODUCT_DB.prepare('DELETE FROM marketplace_kpi_summary').run();
  if (rows.length) {
    const sql = `INSERT INTO marketplace_kpi_summary (
      date_jst,tenant,account_type,account_id,channel,marketplace,clicks,outbound,
      unique_sessions,unique_asins,click_selection_share,updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`;
    const prepared = env.PRODUCT_DB.prepare(sql);
    await env.PRODUCT_DB.batch(rows.map((row) => prepared.bind(
      row.date_jst, row.tenant, row.account_type, row.account_id, row.channel, row.marketplace,
      row.clicks, row.outbound, row.unique_sessions, row.unique_asins, row.click_selection_share, row.updated_at
    )));
  }
  return { events: events.length, summaries: rows.length };
}
