// HOSHILU GAS→Web移行: gas/MeasurementEngine.gs をWorker/D1へ移植。
// GAS側のKPI_Event_Log/KPI_Summary/KPI_Upliftシートは正本のまま稼働を続け、
// Worker→GASのcallGas('TRACK')呼び出しも変更しない(index.mjsのTRACK送信箇所を
// 参照)。ここはWorkerがそれと並走してD1へも同じイベントを記録する、B2B契約
// KPI用の独自パイプライン(既存のB2C成長分析 growth-events.mjs とは別物)。
const EVENT_TYPES = new Set(['IMPRESSION', 'CLICK', 'OUTBOUND', 'PURCHASE']);
const ACCOUNT_TYPES = new Set(['SELLER', 'MANUFACTURER']);
const EXPERIMENT_VARIANTS = new Set(['CONTROL', 'P_GATE']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function cleanId(value, field, required) {
  const text = String(value ?? '').trim();
  if (required && !text) throw fail('KPI_FIELD_REQUIRED');
  if (text.length > 200) throw fail('KPI_FIELD_TOO_LONG');
  return text;
}

export function toJstDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw fail('KPI_OCCURRED_AT_INVALID');
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// gas/MeasurementEngine.gs normalizeEvent() の忠実な移植。
export function normalizeEvent(source = {}, recordedAt) {
  if (source.consent !== true) throw fail('KPI_CONSENT_REQUIRED');
  const eventType = cleanId(source.event_type, 'Event_Type', true).toUpperCase();
  if (!EVENT_TYPES.has(eventType)) throw fail('KPI_EVENT_TYPE_INVALID');
  const accountType = cleanId(source.account_type, 'Account_Type', true).toUpperCase();
  if (!ACCOUNT_TYPES.has(accountType)) throw fail('KPI_ACCOUNT_TYPE_INVALID');
  const experimentVariant = cleanId(source.experiment_variant, 'Experiment_Variant', true).toUpperCase();
  if (!EXPERIMENT_VARIANTS.has(experimentVariant)) throw fail('KPI_EXPERIMENT_VARIANT_INVALID');
  const occurredAt = cleanId(source.occurred_at, 'Occurred_At', true);
  const asin = cleanId(source.asin, 'ASIN', true).toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw fail('KPI_ASIN_INVALID');
  let revenue = Math.max(0, Number(source.revenue) || 0);
  let grossProfit = Number(source.gross_profit) || 0;
  if (eventType !== 'PURCHASE') {
    revenue = 0;
    grossProfit = 0;
  }
  const sessionId = cleanId(source.session_id, 'Session_ID', true);
  if (/@/.test(sessionId) || /\s/.test(sessionId)) throw fail('KPI_SESSION_ID_UNSAFE');
  const eventId = cleanId(source.event_id, 'Event_ID', true);
  const tenant = cleanId(source.tenant, 'Tenant', true).toLowerCase();
  const accountId = cleanId(source.account_id, 'Account_ID', true);
  const dateJst = toJstDateKey(occurredAt);
  return {
    event_key: [tenant, accountType, accountId, eventId].join('|'),
    event_id: eventId,
    occurred_at: new Date(occurredAt).toISOString(),
    date_jst: dateJst,
    tenant, account_type: accountType, account_id: accountId, session_id: sessionId,
    recommendation_id: cleanId(source.recommendation_id, 'Recommendation_ID', true),
    campaign_id: cleanId(source.campaign_id, 'Campaign_ID', true),
    experiment_variant: experimentVariant,
    asin, event_type: eventType, revenue, gross_profit: grossProfit, consent: true,
    source: cleanId(source.source || 'P-GATE', 'Source', false),
    recorded_at: recordedAt || new Date().toISOString()
  };
}

// gas/MeasurementEngine.gs record() のD1版: event_keyで重複排除して挿入する。
export async function recordEvents(env, events) {
  if (!Array.isArray(events) || events.length === 0 || events.length > 500) throw fail('KPI_EVENT_BATCH_INVALID');
  if (!env.PRODUCT_DB) throw fail('KPI_STORE_NOT_CONFIGURED');
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
  const sql = `INSERT INTO kpi_events (
    event_key,event_id,occurred_at,date_jst,tenant,account_type,account_id,session_id,
    recommendation_id,campaign_id,experiment_variant,asin,event_type,revenue,gross_profit,
    consent,source,recorded_at
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
  ON CONFLICT(event_key) DO NOTHING`;
  const prepared = env.PRODUCT_DB.prepare(sql);
  const statements = rows.map((event) => prepared.bind(
    event.event_key, event.event_id, event.occurred_at, event.date_jst, event.tenant,
    event.account_type, event.account_id, event.session_id, event.recommendation_id,
    event.campaign_id, event.experiment_variant, event.asin, event.event_type, event.revenue,
    event.gross_profit, event.consent ? 1 : 0, event.source, event.recorded_at
  ));
  const results = await env.PRODUCT_DB.batch(statements);
  const accepted = results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
  return { accepted, duplicated: duplicated + (rows.length - accepted) };
}

function safeRate(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
}

// gas/MeasurementEngine.gs summarize() の忠実な移植。
export function summarize(events, updatedAt) {
  const groups = new Map();
  for (const event of events) {
    const key = [event.date_jst, event.tenant, event.account_type, event.account_id, event.campaign_id, event.experiment_variant].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        date_jst: event.date_jst, tenant: event.tenant, account_type: event.account_type,
        account_id: event.account_id, campaign_id: event.campaign_id, experiment_variant: event.experiment_variant,
        impressions: 0, clicks: 0, outbound: 0, purchases: 0, revenue: 0, gross_profit: 0
      });
    }
    const group = groups.get(key);
    if (event.event_type === 'IMPRESSION') group.impressions += 1;
    if (event.event_type === 'CLICK') group.clicks += 1;
    if (event.event_type === 'OUTBOUND') group.outbound += 1;
    if (event.event_type === 'PURCHASE') {
      group.purchases += 1;
      group.revenue += Number(event.revenue || 0);
      group.gross_profit += Number(event.gross_profit || 0);
    }
  }
  return [...groups.keys()].sort()
    .map((key) => groups.get(key))
    .map((group) => ({
      ...group,
      ctr: safeRate(group.clicks, group.impressions),
      outbound_rate: safeRate(group.outbound, group.impressions),
      cvr: safeRate(group.purchases, group.outbound),
      updated_at: updatedAt || new Date().toISOString()
    }));
}

// gas/MeasurementEngine.gs calculateUplift() の忠実な移植。CONTROL/P_GATEの
// 両方が揃っているグループだけを対象に、5指標(CTR等)のリフトを計算する。
export function calculateUplift(summaryRows, updatedAt) {
  const pairs = new Map();
  for (const row of summaryRows) {
    const key = [row.date_jst, row.tenant, row.account_type, row.account_id, row.campaign_id].join('|');
    if (!pairs.has(key)) {
      pairs.set(key, {
        prefix: { date_jst: row.date_jst, tenant: row.tenant, account_type: row.account_type, account_id: row.account_id, campaign_id: row.campaign_id },
        variants: {}
      });
    }
    pairs.get(key).variants[row.experiment_variant] = row;
  }
  const output = [];
  for (const key of [...pairs.keys()].sort()) {
    const pair = pairs.get(key);
    const control = pair.variants.CONTROL;
    const treatment = pair.variants.P_GATE;
    if (!control || !treatment) continue;
    const metrics = [
      ['CTR', control.ctr, treatment.ctr, control.impressions, treatment.impressions],
      ['OUTBOUND_RATE', control.outbound_rate, treatment.outbound_rate, control.impressions, treatment.impressions],
      ['CVR', control.cvr, treatment.cvr, control.outbound, treatment.outbound],
      ['REVENUE_PER_1000_IMPRESSIONS', safeRate(control.revenue * 1000, control.impressions), safeRate(treatment.revenue * 1000, treatment.impressions), control.impressions, treatment.impressions],
      ['GROSS_PROFIT_PER_1000_IMPRESSIONS', safeRate(control.gross_profit * 1000, control.impressions), safeRate(treatment.gross_profit * 1000, treatment.impressions), control.impressions, treatment.impressions]
    ];
    for (const [metric, controlValue, treatmentValue, controlSample, treatmentSample] of metrics) {
      const absoluteLift = Number(treatmentValue || 0) - Number(controlValue || 0);
      const relativeLift = controlValue ? absoluteLift / controlValue : null;
      output.push({
        ...pair.prefix, metric, control_value: Number(controlValue || 0), p_gate_value: Number(treatmentValue || 0),
        absolute_lift: absoluteLift, relative_lift: relativeLift,
        control_sample: controlSample, p_gate_sample: treatmentSample,
        updated_at: updatedAt || new Date().toISOString()
      });
    }
  }
  return output;
}

async function loadAllEvents(env) {
  const result = await env.PRODUCT_DB.prepare('SELECT * FROM kpi_events').all();
  return result.results || [];
}

// gas/MeasurementEngine.gs refreshSummary() のD1版。GASと同じく全件再計算・
// 総入れ替えとする(差分更新は行わない)。
export async function refreshKpiSummary(env) {
  if (!env.PRODUCT_DB) return { skipped: true };
  const events = await loadAllEvents(env);
  const updatedAt = new Date().toISOString();
  const summaryRows = summarize(events, updatedAt);
  const upliftRows = calculateUplift(summaryRows, updatedAt);
  await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare('DELETE FROM kpi_summary'),
    env.PRODUCT_DB.prepare('DELETE FROM kpi_uplift')
  ]);
  const summarySql = `INSERT INTO kpi_summary (
    date_jst,tenant,account_type,account_id,campaign_id,experiment_variant,
    impressions,clicks,outbound,purchases,ctr,outbound_rate,cvr,revenue,gross_profit,updated_at
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`;
  const preparedSummary = env.PRODUCT_DB.prepare(summarySql);
  if (summaryRows.length) {
    await env.PRODUCT_DB.batch(summaryRows.map((row) => preparedSummary.bind(
      row.date_jst, row.tenant, row.account_type, row.account_id, row.campaign_id, row.experiment_variant,
      row.impressions, row.clicks, row.outbound, row.purchases, row.ctr, row.outbound_rate, row.cvr,
      row.revenue, row.gross_profit, row.updated_at
    )));
  }
  const upliftSql = `INSERT INTO kpi_uplift (
    date_jst,tenant,account_type,account_id,campaign_id,metric,control_value,p_gate_value,
    absolute_lift,relative_lift,control_sample,p_gate_sample,updated_at
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`;
  const preparedUplift = env.PRODUCT_DB.prepare(upliftSql);
  if (upliftRows.length) {
    await env.PRODUCT_DB.batch(upliftRows.map((row) => preparedUplift.bind(
      row.date_jst, row.tenant, row.account_type, row.account_id, row.campaign_id, row.metric,
      row.control_value, row.p_gate_value, row.absolute_lift, row.relative_lift,
      row.control_sample, row.p_gate_sample, row.updated_at
    )));
  }
  return { events: events.length, summaries: summaryRows.length, upliftRows: upliftRows.length };
}
