import { probeChatIntentProvider } from './ai-chat-intent.mjs';
import { searchRakutenMarketplace } from './rakuten-marketplace-api.mjs';
import { searchYahooShopping } from './yahoo-shopping-api.mjs';

const EVENT_TYPE = 'deep_canary_result';
const MONTHLY_LIMIT_MICRO_USD = 5_000_000;
const COST_MICRO_USD = Object.freeze({
  // Conservative per-call reservations. Together with the fixed cadence and
  // response-token caps these total at most $4.836 in a 31-day month.
  query_structurer: 1000,
  ai_chat_primary: 2000,
  openai_backup: 3000
});
const COMPONENTS = new Set([
  'query_structurer', 'ai_chat_primary', 'openai_backup', 'rakuten', 'yahoo'
]);

const safeCode = (value, fallback = 'CANARY_FAILED') => {
  const code = String(value || '').toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,79}$/u.test(code) ? code : fallback;
};

const scheduledComponents = (date) => {
  const components = ['query_structurer', 'rakuten', 'yahoo'];
  if (date.getUTCMinutes() === 7) components.push('ai_chat_primary');
  if (date.getUTCMinutes() === 7 && date.getUTCHours() % 6 === 0) components.push('openai_backup');
  return components;
};

async function estimatedMonthlySpend(env, now) {
  const start = `${now.toISOString().slice(0, 7)}-01T00:00:00.000Z`;
  const row = await env.PRODUCT_DB.prepare(`SELECT
    COALESCE(SUM(CASE medium
      WHEN 'query_structurer' THEN ${COST_MICRO_USD.query_structurer}
      WHEN 'ai_chat_primary' THEN ${COST_MICRO_USD.ai_chat_primary}
      WHEN 'openai_backup' THEN ${COST_MICRO_USD.openai_backup}
      ELSE 0 END),0) AS estimated_micro_usd
    FROM growth_events
    WHERE event_type=?1 AND traffic_class='QA' AND source='worker' AND occurred_at>=?2`)
    .bind(EVENT_TYPE, start).first();
  return Math.max(0, Number(row?.estimated_micro_usd) || 0);
}

async function missingComponents(env) {
  const rows = await env.PRODUCT_DB.prepare(`SELECT DISTINCT medium AS component
    FROM growth_events WHERE event_type=?1 AND traffic_class='QA' AND source='worker'`).bind(EVENT_TYPE).all();
  const found = new Set((rows?.results || []).map((row) => String(row.component || '')));
  return [...COMPONENTS].filter((component) => !found.has(component));
}

async function writeResult(env, runId, component, status, code, occurredAt) {
  if (!COMPONENTS.has(component)) throw new Error('CANARY_COMPONENT_INVALID');
  await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?1,?2,'JA','worker',?3,?4,?5,'',?6,'QA','','')
    ON CONFLICT(event_id) DO UPDATE SET campaign=excluded.campaign,
      content=excluded.content,occurred_at=excluded.occurred_at`)
    .bind(`deep-canary:${runId}:${component}`, EVENT_TYPE, component,
      status === 'PASS' ? 'PASS' : 'FAIL', safeCode(code, status === 'PASS' ? 'CANARY_OK' : 'CANARY_FAILED'), occurredAt)
    .run();
}

function validateAi(result) {
  if (!result || result.needs_clarification === true || !String(result.refined_query || '').trim()) {
    throw new Error('CANARY_AI_RESPONSE_INVALID');
  }
}

function validateMarketplace(rows, marketplace) {
  const valid = (Array.isArray(rows) ? rows : []).some((row) => {
    const offer = row?.offers?.find((item) => item.marketplace === marketplace);
    return String(row?.product_name || '').trim() && Number(offer?.price) > 0
      && /^https:\/\//u.test(String(offer?.product_url || ''));
  });
  if (!valid) throw new Error(`CANARY_${marketplace.replace('_JP', '')}_NO_VERIFIED_PRODUCT`);
}

export async function runDeepCanaryCycle(env, scheduledAt = new Date(), fetchImpl = fetch) {
  if (!env?.PRODUCT_DB) return { skipped: true, reason: 'DATABASE_NOT_CONFIGURED' };
  const now = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (!Number.isFinite(now.getTime())) throw new Error('CANARY_TIME_INVALID');
  const occurredAt = now.toISOString();
  const runId = String(now.getTime());
  const components = [...new Set([...scheduledComponents(now), ...await missingComponents(env)])];
  let spend = await estimatedMonthlySpend(env, now);

  const probes = {
    query_structurer: async () => {
      const cost = COST_MICRO_USD.query_structurer;
      if (spend + cost > MONTHLY_LIMIT_MICRO_USD) throw new Error('CANARY_MONTHLY_BUDGET_LIMIT');
      spend += cost;
      const probeEnv = { ...env,
        GEMINI_PRODUCT_DISCOVERY_MODEL: String(env.GEMINI_QUERY_REFINEMENT_MODEL || 'gemini-3.5-flash-lite') };
      validateAi(await probeChatIntentProvider('gemini', probeEnv, fetchImpl, { timeoutMs: 5000 }));
    },
    ai_chat_primary: async () => {
      const cost = COST_MICRO_USD.ai_chat_primary;
      if (spend + cost > MONTHLY_LIMIT_MICRO_USD) throw new Error('CANARY_MONTHLY_BUDGET_LIMIT');
      spend += cost;
      validateAi(await probeChatIntentProvider('gemini', env, fetchImpl, { timeoutMs: 5000 }));
    },
    openai_backup: async () => {
      const cost = COST_MICRO_USD.openai_backup;
      if (spend + cost > MONTHLY_LIMIT_MICRO_USD) throw new Error('CANARY_MONTHLY_BUDGET_LIMIT');
      spend += cost;
      validateAi(await probeChatIntentProvider('openai', env, fetchImpl, { timeoutMs: 5000 }));
    },
    rakuten: async () => validateMarketplace(
      await searchRakutenMarketplace(env, 'ワイヤレスイヤホン', fetchImpl, runId), 'RAKUTEN_JP'),
    yahoo: async () => validateMarketplace(
      await searchYahooShopping(env, 'ワイヤレスイヤホン', fetchImpl), 'YAHOO_JP')
  };

  const results = [];
  // Sequential paid probes make the local monthly fuse deterministic. Free
  // marketplace probes remain short and the whole cron stays far below its
  // 15-minute platform wall-time.
  for (const component of components) {
    try {
      await probes[component]();
      await writeResult(env, runId, component, 'PASS', 'CANARY_OK', occurredAt);
      results.push({ component, status: 'PASS', code: 'CANARY_OK' });
    } catch (error) {
      const code = safeCode(error?.message);
      await writeResult(env, runId, component, 'FAIL', code, occurredAt);
      results.push({ component, status: 'FAIL', code });
    }
  }
  console.info('DEEP_CANARY_CYCLE', {
    scheduled_at: occurredAt,
    results: results.map(({ component, status, code }) => ({ component, status, code }))
  });
  return { skipped: false, results, estimated_monthly_micro_usd: spend };
}

export const deepCanaryTest = { scheduledComponents, safeCode, validateMarketplace };
