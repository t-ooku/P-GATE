import { probeChatIntentProvider } from './ai-chat-intent.mjs';
import { openAiBackupEnabled } from './ai-provider-availability.mjs';
import { searchRakutenMarketplace } from './rakuten-marketplace-api.mjs';
import { searchYahooShopping } from './yahoo-shopping-api.mjs';

const EVENT_TYPE = 'deep_canary_result';
const BUDGET_EVENT_TYPE = 'deep_canary_budget';
const MONTHLY_LIMIT_MICRO_USD = 5_000_000;
const PRICING_REVISION = '2026-08-13';
const PRICING_REVIEW_DEADLINE_MS = Date.parse('2026-09-13T00:00:00.000Z');
const PRICING = Object.freeze({
  query_structurer: Object.freeze({ model: 'gemini-3.1-flash-lite', reservation: 100_000, input: 0.25, output: 1.5 }),
  ai_chat_primary: Object.freeze({ model: 'gemini-3.6-flash', reservation: 500_000, input: 1.5, output: 7.5 }),
  openai_backup: Object.freeze({ model: 'gpt-5', reservation: 7_000, input: 1.25, output: 10 })
});
const COMPONENTS = new Set([
  'query_structurer', 'ai_chat_primary', 'openai_backup', 'rakuten', 'yahoo'
]);
const MARKETPLACE_COMPONENTS = new Set(['rakuten', 'yahoo']);
const PRIMARY_AI_COMPONENTS = new Set(['ai_chat_primary', 'query_structurer']);
const MARKETPLACE_CATCHUP_AFTER_MS = 12 * 60 * 1000;
const AI_RETRYABLE_CODES = new Set([
  'CANARY_PROVIDER_TIMEOUT',
  'CANARY_PROVIDER_RATE_LIMITED',
  'CANARY_PROVIDER_UPSTREAM_5XX',
  'CANARY_PROVIDER_NETWORK_FAILED',
  'CANARY_PROVIDER_INVALID_JSON',
  'GEMINI_CHAT_INTENT_INVALID_JSON',
  'OPENAI_CHAT_INTENT_INVALID_JSON',
  'CANARY_AI_RESPONSE_INVALID'
]);
const AI_MISSED_SLOT_CATCHUP_WINDOW_MS = 3 * 60 * 60 * 1000;

const safeCode = (value, fallback = 'CANARY_FAILED') => {
  const code = String(value || '').toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,79}$/u.test(code) ? code : fallback;
};

const scheduledComponents = (date) => {
  const components = ['rakuten', 'yahoo'];
  if (date.getUTCMinutes() === 7) components.push('query_structurer', 'ai_chat_primary');
  if (date.getUTCMinutes() === 7 && date.getUTCHours() % 6 === 0) components.push('openai_backup');
  return components;
};

const isTransientAiFailureCode = (value) => {
  const code = String(value || '');
  return code === safeCode(code) && AI_RETRYABLE_CODES.has(code);
};

// :07 is the regular Query Structurer/AI-primary/OpenAI slot. A transient
// failure, or a recently missed hourly Gemini result, may be confirmed once
// at the first later deep-canary offset that actually runs (:22/:37/:52).
// Requiring the newest row to remain the exact :07 row makes the first retry
// self-closing: its own PASS/FAIL row prevents every later offset from paying
// for another request. A row older than the expected :07 slot is the safe
// evidence that the regular slot never persisted a result and needs catch-up.
// The bounded window prevents ancient/corrupt state from authorizing a paid
// request, and the optional six-hour OpenAI backup stays fail-closed.
const regularAiSlot = (date, component) => {
  if (![22, 37, 52].includes(date.getUTCMinutes())) return null;
  if (component === 'openai_backup' && date.getUTCHours() % 6 !== 0) return null;
  const slot = new Date(date);
  slot.setUTCMinutes(7, 0, 0);
  return slot;
};

async function scheduledAiRetries(env, date) {
  const retries = [];
  for (const component of ['query_structurer', 'ai_chat_primary', 'openai_backup']) {
    const regularSlot = regularAiSlot(date, component);
    if (!regularSlot) continue;
    const expectedOccurredAt = regularSlot.toISOString();
    const expectedEventId = `deep-canary:${regularSlot.getTime()}:${component}`;
    // Read the newest component result without filtering by status/code first.
    // A malformed or newer unexpected row must fail closed instead of reviving
    // an older failure and spending money on an unsafe extra probe.
    const row = await env.PRODUCT_DB.prepare(`SELECT event_id,campaign AS status,content AS code,occurred_at
      FROM growth_events WHERE event_type=?1 AND source='worker' AND traffic_class='QA'
        AND medium=?2
      ORDER BY occurred_at DESC,event_id DESC LIMIT 1`).bind(EVENT_TYPE, component).first();
    if (String(row?.event_id || '') === expectedEventId
      && String(row?.occurred_at || '') === expectedOccurredAt
      && String(row?.status || '') === 'FAIL'
      && isTransientAiFailureCode(row?.code)) retries.push(component);
    else {
      const latestOccurredAt = Date.parse(String(row?.occurred_at || ''));
      const catchupFloor = regularSlot.getTime() - AI_MISSED_SLOT_CATCHUP_WINDOW_MS;
      if (component !== 'openai_backup'
        && Number.isFinite(latestOccurredAt)
        && latestOccurredAt >= catchupFloor
        && latestOccurredAt < regularSlot.getTime()) {
        retries.push(component);
      }
    }
  }
  return retries;
}

// Backward-compatible test name while failed-only retries cover each paid AI
// component and never create a public retry endpoint.
const isTransientOpenAiFailureCode = isTransientAiFailureCode;
const scheduledOpenAiRetry = async (env, date) => (await scheduledAiRetries(env, date))
  .filter((component) => component === 'openai_backup');

const monthBounds = (now) => {
  const start = `${now.toISOString().slice(0, 7)}-01T00:00:00.000Z`;
  const next = new Date(`${now.toISOString().slice(0, 7)}-01T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end: next.toISOString() };
};

const pricingFor = (component, env) => {
  const pricing = PRICING[component];
  const model = component === 'query_structurer'
    ? String(env.GEMINI_QUERY_REFINEMENT_MODEL || pricing.model)
    : component === 'ai_chat_primary'
      ? String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || pricing.model)
      : String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || pricing.model);
  if (model !== pricing.model) throw new Error('CANARY_MODEL_PRICING_UNKNOWN');
  return pricing;
};

const wallClockNow = (clock) => {
  const value = clock();
  const now = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(now.getTime())) throw new Error('CANARY_BILLING_TIME_INVALID');
  return now;
};

const billingNow = (clock) => {
  const now = wallClockNow(clock);
  if (now.getTime() >= PRICING_REVIEW_DEADLINE_MS) throw new Error('CANARY_PRICING_REVIEW_REQUIRED');
  return now;
};

const failureCode = (error) => {
  const status = Number(error?.status || 0);
  const providerCode = String(error?.providerCode || '').toLowerCase();
  if (['insufficient_quota', 'billing_hard_limit_reached', 'billing_not_active',
    'billing_disabled'].includes(providerCode)) return 'CANARY_PROVIDER_BILLING_UNAVAILABLE';
  if (providerCode === 'rate_limit_exceeded') return 'CANARY_PROVIDER_RATE_LIMITED';
  // Keep authentication failure and provider access restriction distinct.
  // Both remain immediate incidents in the production SLI; only the safe HTTP
  // class is persisted, never a provider response body or credential value.
  if (status === 401) return 'CANARY_PROVIDER_UNAUTHORIZED_HTTP_401';
  if (status === 403) return 'CANARY_PROVIDER_FORBIDDEN_HTTP_403';
  if (status === 408) return 'CANARY_PROVIDER_TIMEOUT';
  if (status === 429) return 'CANARY_PROVIDER_RATE_LIMITED';
  if (status >= 400 && status <= 499) return 'CANARY_PROVIDER_REQUEST_REJECTED';
  if (status >= 500 && status <= 599) return 'CANARY_PROVIDER_UPSTREAM_5XX';
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'CANARY_PROVIDER_TIMEOUT';
  if (error?.name === 'SyntaxError') return 'CANARY_PROVIDER_INVALID_JSON';
  if (error?.name === 'TypeError' && /fetch|network|connection|socket/iu.test(String(error?.message || ''))) {
    return 'CANARY_PROVIDER_NETWORK_FAILED';
  }
  return safeCode(error?.message);
};

const costFromUsage = (usage, pricing) => {
  const input = Number(usage?.input_tokens);
  const output = Number(usage?.output_tokens);
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(output) || output <= 0) {
    throw new Error('CANARY_USAGE_MISSING');
  }
  const cost = Math.ceil(input * pricing.input + output * pricing.output);
  if (cost <= 0 || cost > pricing.reservation) throw new Error('CANARY_COST_EXCEEDS_RESERVATION');
  return cost;
};

async function reserveBudget(env, now, runId, component, pricing) {
  // Idempotency is tied to the scheduled slot, not the billing month. A
  // delayed/replayed slot must stay single-charge even across a UTC month
  // boundary; occurred_at still assigns its one charge to the wall-clock month.
  const eventId = `deep-canary-budget:${runId}:${component}`;
  const { start, end } = monthBounds(now);
  const reserved = String(pricing.reservation).padStart(7, '0');
  const result = await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
    SELECT ?1,?2,'JA','worker',?3,'RESERVED',?4,?4,?5,'QA','',''
    WHERE NOT EXISTS (SELECT 1 FROM growth_events WHERE event_id=?1)
      AND NOT EXISTS (SELECT 1 FROM growth_events
        WHERE event_type=?2 AND source='worker' AND traffic_class='QA'
          AND occurred_at>=?7 AND occurred_at<?8
          AND (length(content)<>7 OR content GLOB '*[^0-9]*'
            OR length(marketplace)<>7 OR marketplace GLOB '*[^0-9]*'
            OR campaign NOT IN ('RESERVED','SETTLED','RELEASED')
            OR medium NOT IN ('query_structurer','ai_chat_primary','openai_backup')
            OR marketplace<>CASE medium
              WHEN 'query_structurer' THEN '0100000'
              WHEN 'ai_chat_primary' THEN '0500000'
              WHEN 'openai_backup' THEN '0007000' ELSE '' END
            OR (campaign='RESERVED' AND content<>marketplace)
            OR (campaign='SETTLED' AND (CAST(content AS INTEGER)<=0
              OR CAST(content AS INTEGER)>CAST(marketplace AS INTEGER)))
            OR (campaign='RELEASED' AND content<>'0000000')))
      AND ?6 + COALESCE((SELECT SUM(CAST(content AS INTEGER))
        FROM growth_events WHERE event_type=?2 AND source='worker' AND traffic_class='QA'
          AND campaign IN ('RESERVED','SETTLED')
          AND occurred_at>=?7 AND occurred_at<?8),0) <= ?9`)
    .bind(eventId, BUDGET_EVENT_TYPE, component, reserved, now.toISOString(),
      pricing.reservation, start, end, MONTHLY_LIMIT_MICRO_USD).run();
  if (Number(result?.meta?.changes) === 1) return { reserved: true, eventId };
  const duplicate = await env.PRODUCT_DB.prepare(`SELECT event_id FROM growth_events WHERE event_id=?1 LIMIT 1`)
    .bind(eventId).first();
  return { reserved: false, duplicate: Boolean(duplicate?.event_id), eventId };
}

async function settleBudget(env, eventId, cost, reservation) {
  const reserved = String(reservation).padStart(7, '0');
  const settled = String(cost).padStart(7, '0');
  const result = await env.PRODUCT_DB.prepare(`UPDATE growth_events SET campaign='SETTLED',content=?2
    WHERE event_id=?1 AND event_type=?3 AND campaign='RESERVED' AND marketplace=?4 AND content=?5`)
    .bind(eventId, settled, BUDGET_EVENT_TYPE, reserved, reserved).run();
  if (Number(result?.meta?.changes) !== 1) throw new Error('CANARY_BUDGET_SETTLEMENT_FAILED');
}

async function releaseBudget(env, eventId, reservation) {
  const reserved = String(reservation).padStart(7, '0');
  const result = await env.PRODUCT_DB.prepare(`UPDATE growth_events
    SET campaign='RELEASED',content='0000000'
    WHERE event_id=?1 AND event_type=?2 AND campaign='RESERVED' AND marketplace=?3 AND content=?3`)
    .bind(eventId, BUDGET_EVENT_TYPE, reserved).run();
  if (Number(result?.meta?.changes) !== 1) throw new Error('CANARY_BUDGET_RELEASE_FAILED');
}

async function monthlyBudgetSpend(env, now) {
  const { start, end } = monthBounds(now);
  const row = await env.PRODUCT_DB.prepare(`SELECT COALESCE(SUM(CASE WHEN length(content)=7
    AND content NOT GLOB '*[^0-9]*' THEN CAST(content AS INTEGER) ELSE 0 END),0) AS micro_usd
    FROM growth_events WHERE event_type=?1 AND source='worker' AND traffic_class='QA'
      AND campaign IN ('RESERVED','SETTLED')
      AND occurred_at>=?2 AND occurred_at<?3`).bind(BUDGET_EVENT_TYPE, start, end).first();
  return Math.max(0, Number(row?.micro_usd) || 0);
}

async function missingComponents(env) {
  const rows = await env.PRODUCT_DB.prepare(`SELECT DISTINCT medium AS component
    FROM growth_events WHERE event_type=?1 AND traffic_class='QA' AND source='worker'`).bind(EVENT_TYPE).all();
  const found = new Set((rows?.results || []).map((row) => String(row.component || '')));
  // Bootstrap every component once on a brand-new installation. Once any
  // result exists, cadence is authoritative; a missing/stale component is an
  // incident signal, not permission to call a 6-hour provider every 15 min.
  return found.size === 0 ? [...COMPONENTS] : [];
}

async function writeResult(env, runId, component, status, code, occurredAt) {
  if (!COMPONENTS.has(component)) throw new Error('CANARY_COMPONENT_INVALID');
  await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?1,?2,'JA','worker',?3,?4,?5,'',?6,'QA','','')
    ON CONFLICT(event_id) DO UPDATE SET campaign=excluded.campaign,
      content=excluded.content,occurred_at=excluded.occurred_at`)
    .bind(`deep-canary:${runId}:${component}`, EVENT_TYPE, component,
      ['PASS','DEGRADED'].includes(status) ? status : 'FAIL',
      safeCode(code, status === 'PASS' ? 'CANARY_OK' : 'CANARY_FAILED'), occurredAt)
    .run();
}

function validateAi(result, mode) {
  if (!result || result.needs_clarification === true || !String(result.refined_query || result.candidate_name || '').trim()
    || (mode === 'IDENTIFY' && !String(result.candidate_name || '').trim())) {
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

export async function runDeepCanaryCycle(env, scheduledAt = new Date(), fetchImpl = fetch, {
  clock = () => new Date(), componentsOverride = null
} = {}) {
  if (!env?.PRODUCT_DB) return { skipped: true, reason: 'DATABASE_NOT_CONFIGURED' };
  const now = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (!Number.isFinite(now.getTime())) throw new Error('CANARY_TIME_INVALID');
  const occurredAt = now.toISOString();
  const runId = String(now.getTime());
  let components;
  if (Array.isArray(componentsOverride)) {
    components = [...new Set(componentsOverride.filter((component) => COMPONENTS.has(component)))];
  } else {
    let retryComponents = [];
    try {
      retryComponents = await scheduledAiRetries(env, now);
    } catch (error) {
      // A retry lookup failure must not stop regular checks, and must never
      // default to an extra paid provider request.
      console.warn('DEEP_CANARY_AI_RETRY_LOOKUP_FAILED', { code: failureCode(error) });
    }
    components = [...new Set([
      ...scheduledComponents(now), ...retryComponents, ...await missingComponents(env)
    ])];
  }

  const paidProbe = async (component, provider, probeEnv, mode) => {
    const pricing = pricingFor(component, probeEnv);
    // Billing month is based on wall-clock time immediately before the paid
    // call, not controller.scheduledTime. A delayed month-end cron therefore
    // cannot charge the new month against the old month's ledger.
    const chargedAt = billingNow(clock);
    const reservation = await reserveBudget(env, chargedAt, runId, component, pricing);
    if (reservation.duplicate) return { duplicate: true };
    if (!reservation.reserved) throw new Error('CANARY_MONTHLY_BUDGET_LIMIT');
    let result;
    let actualCost;
    try {
      result = await probeChatIntentProvider(provider, probeEnv, fetchImpl, {
        mode, timeoutMs: component === 'query_structurer' ? 1500 : 5000
      });
      actualCost = costFromUsage(result?._canaryUsage, pricing);
    } catch (error) {
      await releaseBudget(env, reservation.eventId, pricing.reservation);
      throw error;
    }
    await settleBudget(env, reservation.eventId, actualCost, pricing.reservation);
    validateAi(result, mode);
    return { duplicate: false };
  };

  const probes = {
    query_structurer: async () => {
      const probeEnv = { ...env,
        GEMINI_PRODUCT_DISCOVERY_MODEL: String(env.GEMINI_QUERY_REFINEMENT_MODEL || PRICING.query_structurer.model) };
      return paidProbe('query_structurer', 'gemini', probeEnv, 'REFINE');
    },
    ai_chat_primary: async () => paidProbe('ai_chat_primary', 'gemini', env, 'IDENTIFY'),
    openai_backup: async () => openAiBackupEnabled(env)
      ? paidProbe('openai_backup', 'openai', env, 'IDENTIFY')
      : ({ degraded: true, code: 'CANARY_PROVIDER_BILLING_DISABLED' }),
    rakuten: async () => validateMarketplace(
      await searchRakutenMarketplace(env, 'ワイヤレスイヤホン', fetchImpl, runId), 'RAKUTEN_JP'),
    yahoo: async () => validateMarketplace(
      await searchYahooShopping(env, 'ワイヤレスイヤホン', fetchImpl), 'YAHOO_JP')
  };

  const executeComponent = async (component) => {
    try {
      const outcome = await probes[component]();
      if (outcome?.duplicate) return null;
      const status = outcome?.degraded ? 'DEGRADED' : 'PASS';
      const code = outcome?.degraded ? outcome.code : 'CANARY_OK';
      await writeResult(env, runId, component, status, code, occurredAt);
      return { component, status, code };
    } catch (error) {
      const code = failureCode(error);
      const status = code === 'CANARY_MONTHLY_BUDGET_LIMIT' ? 'DEGRADED' : 'FAIL';
      await writeResult(env, runId, component, status, code, occurredAt);
      return { component, status, code };
    }
  };

  const results = [];
  // Record the two primary AI contracts before network-bound marketplace
  // probes. If a scheduled Worker is interrupted, the user-facing AI path
  // must not be the last result left unwritten. Keep paid probes sequential so
  // the monthly fuse remains deterministic; the optional OpenAI backup stays
  // last because it is not required for the live search path.
  const primaryAiComponents = ['ai_chat_primary', 'query_structurer']
    .filter((component) => components.includes(component));
  for (const component of primaryAiComponents) {
    const result = await executeComponent(component);
    if (result) results.push(result);
  }

  // Marketplace probes are free and independent. Launching them together
  // prevents a delayed/terminated first provider from starving the second
  // provider's result row. The regular cron also has a free-only catch-up.
  const marketplaceComponents = components.filter((component) => MARKETPLACE_COMPONENTS.has(component));
  const marketplaceResults = await Promise.allSettled(
    marketplaceComponents.map((component) => executeComponent(component))
  );
  for (const outcome of marketplaceResults) {
    if (outcome.status === 'fulfilled' && outcome.value) results.push(outcome.value);
    else if (outcome.status === 'rejected') console.error('DEEP_CANARY_RESULT_WRITE_FAILED');
  }
  for (const component of components.filter((item) =>
    !MARKETPLACE_COMPONENTS.has(item) && !PRIMARY_AI_COMPONENTS.has(item))) {
    const result = await executeComponent(component);
    if (result) results.push(result);
  }
  results.sort((left, right) => components.indexOf(left.component) - components.indexOf(right.component));
  console.info('DEEP_CANARY_CYCLE', {
    scheduled_at: occurredAt,
    results: results.map(({ component, status, code }) => ({ component, status, code }))
  });
  const spendAt = wallClockNow(clock);
  return { skipped: false, results, monthly_micro_usd: await monthlyBudgetSpend(env, spendAt),
    pricing_revision: PRICING_REVISION };
}

export async function runMarketplaceCanaryCatchup(
  env, scheduledAt = new Date(), fetchImpl = fetch, { clock = () => new Date() } = {}
) {
  if (!env?.PRODUCT_DB) return { skipped: true, reason: 'DATABASE_NOT_CONFIGURED' };
  const now = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (!Number.isFinite(now.getTime())) throw new Error('CANARY_TIME_INVALID');
  const rows = await env.PRODUCT_DB.prepare(`SELECT medium AS component,MAX(occurred_at) AS occurred_at
    FROM growth_events WHERE event_type=?1 AND source='worker' AND traffic_class='QA'
      AND medium IN ('rakuten','yahoo') GROUP BY medium`).bind(EVENT_TYPE).all();
  const latest = new Map((rows?.results || []).map((row) => [
    String(row.component || ''), Date.parse(String(row.occurred_at || ''))
  ]));
  const stale = [...MARKETPLACE_COMPONENTS].filter((component) => {
    const occurredAt = latest.get(component);
    return !Number.isFinite(occurredAt) || now.getTime() - occurredAt > MARKETPLACE_CATCHUP_AFTER_MS;
  });
  if (!stale.length) return { skipped: true, reason: 'MARKETPLACE_CANARY_FRESH' };
  return runDeepCanaryCycle(env, now, fetchImpl, { clock, componentsOverride: stale });
}

export const deepCanaryTest = { scheduledComponents, safeCode, validateMarketplace, costFromUsage, monthBounds,
  billingNow, wallClockNow, failureCode, isTransientAiFailureCode, isTransientOpenAiFailureCode,
  scheduledAiRetries, scheduledOpenAiRetry,
  MARKETPLACE_CATCHUP_AFTER_MS, PRICING_REVISION, PRICING_REVIEW_DEADLINE_MS };
