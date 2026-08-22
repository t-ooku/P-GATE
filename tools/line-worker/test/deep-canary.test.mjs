import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  deepCanaryTest, runDeepCanaryCycle, runMarketplaceCanaryCatchup
} from '../src/deep-canary.mjs';
import { normalizeGrowthEvent } from '../src/growth-events.mjs';

const migration = (name) => readFileSync(
  new URL(`../migrations/${name}`, import.meta.url),
  'utf8'
);

const COMPONENTS = [
  'query_structurer', 'ai_chat_primary', 'openai_backup', 'rakuten', 'yahoo'
];

function sqliteEnvironment(overrides = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration('0012_growth_events.sql'));
  sqlite.exec(migration('0004_unmet_demand_events.sql'));
  sqlite.exec(migration('0013_growth_event_traffic_class.sql'));
  sqlite.exec(migration('0047_growth_visitor_sessions.sql'));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            run: async () => {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes || 0) } };
            },
            first: async () => statement.get(...values) || null,
            all: async () => ({ results: statement.all(...values) })
          };
        }
      };
    }
  };
  return {
    sqlite,
    env: {
      GEMINI_API_KEY: 'g'.repeat(32),
      OPENAI_API_KEY: 'o'.repeat(32),
      OPENAI_BACKUP_ENABLED: 'true',
      RAKUTEN_APPLICATION_ID: 'app',
      RAKUTEN_ACCESS_KEY: 'access',
      YAHOO_SHOPPING_CLIENT_ID: 'yahoo',
      PRODUCT_DB: db,
      ...overrides
    }
  };
}

function seedPriorResults(sqlite, occurredAt = '2026-08-13T00:00:00.000Z') {
  const insert = sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?, 'deep_canary_result', 'JA', 'worker', ?, 'PASS', 'CANARY_OK', '', ?, 'QA', '', '')`);
  for (const component of COMPONENTS) insert.run(`prior:${component}`, component, occurredAt);
}

function seedBudget(sqlite, microUsd, occurredAt = '2026-08-13T00:00:00.000Z') {
  const insert = sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?, 'deep_canary_budget', 'JA', 'worker', ?,
      'SETTLED', ?, ?, ?, 'QA', '', '')`);
  let remaining = microUsd;
  let index = 0;
  for (const [component, maximum] of [['ai_chat_primary', 500_000], ['query_structurer', 100_000], ['openai_backup', 7_000]]) {
    while (remaining > 0 && (remaining >= maximum || component === 'openai_backup')) {
      const cost = Math.min(remaining, maximum);
      insert.run(`prior-budget-${index++}`, component, String(cost).padStart(7, '0'),
        String(maximum).padStart(7, '0'), occurredAt);
      remaining -= cost;
    }
  }
  assert.equal(remaining, 0);
}

function providerHarness({ usage = true } = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const target = String(url);
    let body = null;
    try { body = options.body ? JSON.parse(options.body) : null; } catch {}
    calls.push({ target, body });
    if (target.includes('generativelanguage.googleapis.com')) {
      const prompt = String(body?.contents?.[0]?.parts?.[0]?.text || '');
      const identify = prompt.includes('"candidate_name"');
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          needs_clarification: false,
          candidate_name: identify ? 'Test Brand Earbuds' : '',
          refined_query: '軽い ワイヤレスイヤホン'
        }) }] } }],
        ...(usage ? { usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          thoughtsTokenCount: 5
        } } : {})
      });
    }
    if (target.includes('api.openai.com')) {
      const identify = String(body?.input || '').includes('"candidate_name"');
      return Response.json({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
          needs_clarification: false,
          candidate_name: identify ? 'Test Brand Earbuds' : '',
          refined_query: '軽い ワイヤレスイヤホン'
        }) }] }],
        ...(usage ? { usage: { input_tokens: 100, output_tokens: 25 } } : {})
      });
    }
    if (target.includes('openapi.rakuten.co.jp')) {
      return Response.json({ items: [{
        itemName: 'イヤホン', itemCode: 'shop:item', itemPrice: 1000,
        itemUrl: 'https://item.rakuten.co.jp/shop/item/'
      }] });
    }
    if (target.includes('shopping.yahooapis.jp')) {
      return Response.json({ hits: [{
        name: 'イヤホン', code: 'shop_item', price: 1000,
        url: 'https://store.shopping.yahoo.co.jp/shop/item.html'
      }] });
    }
    throw new Error(`UNEXPECTED_${new URL(target).hostname}`);
  };
  return { fetcher, calls };
}

const callsTo = (calls, hostname) => calls.filter((call) => call.target.includes(hostname));

test('deep canary frequency is 15m marketplaces/1h Gemini/6h backup without a public endpoint', () => {
  assert.deepEqual(deepCanaryTest.scheduledComponents(new Date('2026-08-13T01:22:00Z')),
    ['rakuten', 'yahoo']);
  assert.deepEqual(deepCanaryTest.scheduledComponents(new Date('2026-08-13T01:07:00Z')),
    ['rakuten', 'yahoo', 'query_structurer', 'ai_chat_primary']);
  assert.deepEqual(deepCanaryTest.scheduledComponents(new Date('2026-08-13T06:07:00Z')),
    ['rakuten', 'yahoo', 'query_structurer', 'ai_chat_primary', 'openai_backup']);
  assert.deepEqual(deepCanaryTest.scheduledComponents(new Date('2026-08-13T06:22:00Z')),
    ['rakuten', 'yahoo']);
});

test('only transient OpenAI result codes are eligible for the one delayed retry', () => {
  for (const code of [
    'CANARY_PROVIDER_TIMEOUT', 'CANARY_PROVIDER_RATE_LIMITED', 'CANARY_PROVIDER_UPSTREAM_5XX',
    'CANARY_PROVIDER_NETWORK_FAILED', 'CANARY_PROVIDER_INVALID_JSON',
    'GEMINI_CHAT_INTENT_INVALID_JSON', 'OPENAI_CHAT_INTENT_INVALID_JSON',
    'CANARY_AI_RESPONSE_INVALID'
  ]) assert.equal(deepCanaryTest.isTransientOpenAiFailureCode(code), true, code);

  for (const code of [
    'OPENAI_NOT_CONFIGURED', 'CANARY_PROVIDER_AUTH_FAILED', 'CANARY_MODEL_PRICING_UNKNOWN',
    'CANARY_PRICING_REVIEW_REQUIRED', 'CANARY_MONTHLY_BUDGET_LIMIT', 'CANARY_USAGE_MISSING',
    'CANARY_COST_EXCEEDS_RESERVATION', 'CANARY_PROMPT_TOO_LARGE',
    'OPENAI_CHAT_INTENT_OUTPUT_LIMIT', 'CANARY_BUDGET_SETTLEMENT_FAILED', 'CANARY_FAILED',
    'CANARY_PROVIDER_REQUEST_REJECTED', 'OPENAI_CHAT_INTENT_FAILED', 'canary_provider_timeout'
  ]) assert.equal(deepCanaryTest.isTransientOpenAiFailureCode(code), false, code);
});

test('a missed hourly Gemini slot is caught up once at the next deep-canary offset', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite, '2026-08-13T10:07:00.000Z');
  seedBudget(sqlite, 5_000_000, '2026-08-13T10:08:00.000Z');
  const { fetcher, calls } = providerHarness();

  const catchup = await runDeepCanaryCycle(env, new Date('2026-08-13T11:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T11:22:01.000Z')
  });
  assert.deepEqual(catchup.results.map((row) => row.component),
    ['rakuten', 'yahoo', 'query_structurer', 'ai_chat_primary']);
  for (const component of ['query_structurer', 'ai_chat_primary']) {
    assert.equal(catchup.results.find((row) => row.component === component)?.code,
      'CANARY_MONTHLY_BUDGET_LIMIT');
  }
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);

  const laterOffset = await runDeepCanaryCycle(env, new Date('2026-08-13T11:37:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T11:37:01.000Z')
  });
  assert.deepEqual(laterOffset.results.map((row) => row.component), ['rakuten', 'yahoo']);
});

test('provider status classification retries only transient HTTP failures', () => {
  assert.equal(deepCanaryTest.failureCode({ status: 408, message: 'OPENAI_CHAT_INTENT_FAILED' }),
    'CANARY_PROVIDER_TIMEOUT');
  assert.equal(deepCanaryTest.failureCode({ status: 429, message: 'OPENAI_CHAT_INTENT_FAILED' }),
    'CANARY_PROVIDER_RATE_LIMITED');
  assert.equal(deepCanaryTest.failureCode({ status: 429, providerCode: 'insufficient_quota' }),
    'CANARY_PROVIDER_BILLING_UNAVAILABLE');
  assert.equal(deepCanaryTest.failureCode({ status: 429, providerCode: 'billing_hard_limit_reached' }),
    'CANARY_PROVIDER_BILLING_UNAVAILABLE');
  assert.equal(deepCanaryTest.failureCode({ status: 503, message: 'OPENAI_CHAT_INTENT_FAILED' }),
    'CANARY_PROVIDER_UPSTREAM_5XX');
  assert.equal(deepCanaryTest.failureCode({ status: 400, message: 'OPENAI_CHAT_INTENT_FAILED' }),
    'CANARY_PROVIDER_REQUEST_REJECTED');
  assert.equal(deepCanaryTest.failureCode({ status: 404, message: 'OPENAI_CHAT_INTENT_FAILED' }),
    'CANARY_PROVIDER_REQUEST_REJECTED');
  assert.equal(deepCanaryTest.isTransientOpenAiFailureCode('CANARY_PROVIDER_REQUEST_REJECTED'), false);
});

test('a transient regular OpenAI failure is retried once at minute 22 and then stops', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const harness = providerHarness();
  let openAiCalls = 0;
  const fetcher = async (url, options) => {
    if (String(url).includes('api.openai.com') && openAiCalls++ === 0) {
      return new Response('temporary', { status: 503 });
    }
    return harness.fetcher(url, options);
  };
  const primary = await runDeepCanaryCycle(env, new Date('2026-08-13T06:07:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T06:07:01.000Z')
  });
  assert.equal(primary.results.find((row) => row.component === 'openai_backup')?.code,
    'CANARY_PROVIDER_UPSTREAM_5XX');

  const retry = await runDeepCanaryCycle(env, new Date('2026-08-13T06:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T06:22:01.000Z')
  });
  assert.deepEqual(retry.results.map((row) => row.component),
    ['rakuten', 'yahoo', 'openai_backup']);
  assert.equal(retry.results.at(-1)?.status, 'PASS');

  const replay = await runDeepCanaryCycle(env, new Date('2026-08-13T06:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T06:23:01.000Z')
  });
  assert.deepEqual(replay.results.map((row) => row.component), ['rakuten', 'yahoo']);
  assert.equal(openAiCalls, 2);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget' AND medium='openai_backup'`).get().count, 2);
  const stored = JSON.stringify(sqlite.prepare('SELECT * FROM growth_events').all());
  assert.doesNotMatch(stored, /軽い|ワイヤレス|イヤホン|authorization|response/iu);
});

test('an hourly Gemini primary transient failure gets one confirmation at the next available offset', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const harness = providerHarness();
  let primaryFailures = 0;
  const fetcher = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    const identify = String(body?.contents?.[0]?.parts?.[0]?.text || '').includes('"candidate_name"');
    if (String(url).includes('generativelanguage.googleapis.com') && identify && primaryFailures++ === 0) {
      return new Response('temporary', { status: 503 });
    }
    return harness.fetcher(url, options);
  };
  const regular = await runDeepCanaryCycle(env, new Date('2026-08-13T11:07:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T11:07:01.000Z')
  });
  assert.equal(regular.results.find((row) => row.component === 'ai_chat_primary')?.code,
    'CANARY_PROVIDER_UPSTREAM_5XX');

  // Simulate GitHub/Cloudflare missing the :22 offset: :37 must still be able
  // to perform the one confirmation, while a replay cannot pay twice.
  const retry = await runDeepCanaryCycle(env, new Date('2026-08-13T11:37:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T11:37:01.000Z')
  });
  assert.deepEqual(retry.results.map((row) => row.component), ['rakuten', 'yahoo', 'ai_chat_primary']);
  assert.equal(retry.results.at(-1)?.status, 'PASS');

  const replay = await runDeepCanaryCycle(env, new Date('2026-08-13T11:37:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T11:38:01.000Z')
  });
  assert.deepEqual(replay.results.map((row) => row.component), ['rakuten', 'yahoo']);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget' AND medium='ai_chat_primary'`).get().count, 2);
});

test('a non-transient Gemini primary failure never schedules a paid confirmation', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?, 'deep_canary_result', 'JA', 'worker', 'ai_chat_primary', 'FAIL',
      'CANARY_PROVIDER_AUTH_FAILED', '', ?, 'QA', '', '')`)
    .run(`deep-canary:${Date.parse('2026-08-13T11:07:00.000Z')}:ai_chat_primary`,
      '2026-08-13T11:07:00.000Z');
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T11:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T11:22:01.000Z')
  });
  assert.deepEqual(result.results.map((row) => row.component), ['rakuten', 'yahoo']);
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
});

test('the monthly fuse blocks a qualified Gemini confirmation before fetch', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  seedBudget(sqlite, 5_000_000);
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?, 'deep_canary_result', 'JA', 'worker', 'ai_chat_primary', 'FAIL',
      'CANARY_PROVIDER_TIMEOUT', '', ?, 'QA', '', '')`)
    .run(`deep-canary:${Date.parse('2026-08-13T11:07:00.000Z')}:ai_chat_primary`,
      '2026-08-13T11:07:00.000Z');
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T11:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T11:22:01.000Z')
  });
  assert.equal(result.results.find((row) => row.component === 'ai_chat_primary')?.code,
    'CANARY_MONTHLY_BUDGET_LIMIT');
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
  assert.equal(result.monthly_micro_usd, 5_000_000);
});

test('overlapping minute-22 invocations make only one paid OpenAI retry', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?, 'deep_canary_result', 'JA', 'worker', 'openai_backup', 'FAIL',
      'OPENAI_CHAT_INTENT_INVALID_JSON', '', ?, 'QA', '', '')`)
    .run(`deep-canary:${Date.parse('2026-08-13T06:07:00.000Z')}:openai_backup`,
      '2026-08-13T06:07:00.000Z');
  const { fetcher, calls } = providerHarness();
  const retrySlot = new Date('2026-08-13T06:22:00.000Z');
  await Promise.all([
    runDeepCanaryCycle(env, retrySlot, fetcher, {
      clock: () => new Date('2026-08-13T06:22:01.000Z')
    }),
    runDeepCanaryCycle(env, retrySlot, fetcher, {
      clock: () => new Date('2026-08-13T06:22:01.000Z')
    })
  ]);
  assert.equal(callsTo(calls, 'api.openai.com').length, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget' AND medium='openai_backup'`).get().count, 1);
});

test('non-transient OpenAI failures never schedule the delayed paid retry', async (t) => {
  const codes = [
    'OPENAI_NOT_CONFIGURED', 'CANARY_PROVIDER_AUTH_FAILED', 'CANARY_MODEL_PRICING_UNKNOWN',
    'CANARY_PRICING_REVIEW_REQUIRED', 'CANARY_MONTHLY_BUDGET_LIMIT', 'CANARY_USAGE_MISSING',
    'CANARY_COST_EXCEEDS_RESERVATION', 'CANARY_PROMPT_TOO_LARGE',
    'OPENAI_CHAT_INTENT_OUTPUT_LIMIT', 'CANARY_PROVIDER_REQUEST_REJECTED',
    'OPENAI_CHAT_INTENT_FAILED'
  ];
  for (const code of codes) {
    await t.test(code, async (t) => {
      const { sqlite, env } = sqliteEnvironment();
      t.after(() => sqlite.close());
      seedPriorResults(sqlite);
      sqlite.prepare(`INSERT INTO growth_events
        (event_id,event_type,locale,source,medium,campaign,content,marketplace,
          occurred_at,traffic_class,visitor_id,session_id)
        VALUES(?, 'deep_canary_result', 'JA', 'worker', 'openai_backup', 'FAIL', ?, '', ?, 'QA', '', '')`)
        .run(`deep-canary:${Date.parse('2026-08-13T06:07:00.000Z')}:openai_backup`, code,
          '2026-08-13T06:07:00.000Z');
      const { fetcher, calls } = providerHarness();
      const result = await runDeepCanaryCycle(env, new Date('2026-08-13T06:22:00.000Z'), fetcher, {
        clock: () => new Date('2026-08-13T06:22:01.000Z')
      });
      assert.deepEqual(result.results.map((row) => row.component), ['rakuten', 'yahoo']);
      assert.equal(callsTo(calls, 'api.openai.com').length, 0);
    });
  }
});

test('retry lookup fails closed when the newest OpenAI result is not the exact regular slot', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES('unexpected-newer-row', 'deep_canary_result', 'JA', 'worker', 'openai_backup',
      'FAIL', 'CANARY_PROVIDER_TIMEOUT', '', '2026-08-13T06:08:00.000Z', 'QA', '', '')`).run();
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T06:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T06:22:01.000Z')
  });
  assert.deepEqual(result.results.map((row) => row.component), ['rakuten', 'yahoo']);
  assert.equal(callsTo(calls, 'api.openai.com').length, 0);
});

test('the five-dollar fuse blocks a qualified retry before the OpenAI request', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  seedBudget(sqlite, 5_000_000);
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES(?, 'deep_canary_result', 'JA', 'worker', 'openai_backup', 'FAIL',
      'CANARY_PROVIDER_TIMEOUT', '', ?, 'QA', '', '')`)
    .run(`deep-canary:${Date.parse('2026-08-13T06:07:00.000Z')}:openai_backup`,
      '2026-08-13T06:07:00.000Z');
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T06:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T06:22:01.000Z')
  });
  assert.equal(result.results.find((row) => row.component === 'openai_backup')?.code,
    'CANARY_MONTHLY_BUDGET_LIMIT');
  assert.equal(callsTo(calls, 'api.openai.com').length, 0);
  assert.equal(result.monthly_micro_usd, 5_000_000);
});

test('an existing result prevents missing components from bypassing provider cadence', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES('prior-rakuten','deep_canary_result','JA','worker','rakuten','PASS',
      'CANARY_OK','',?,'QA','','')`).run('2026-08-13T01:00:00.000Z');
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T01:22:00Z'), fetcher,
    { clock: () => new Date('2026-08-13T01:22:01Z') });
  assert.deepEqual(result.results.map((row) => row.component), ['rakuten', 'yahoo']);
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
  assert.equal(callsTo(calls, 'api.openai.com').length, 0);
});

test('deep canary has an offset cron and is isolated from the existing job fanout', () => {
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(wrangler, /"7,22,37,52 \* \* \* \*"/u);
  assert.match(worker,
    /controller\.cron === '7,22,37,52 \* \* \* \*'[\s\S]*?runDeepCanaryCycle\(env, scheduledAt\)[\s\S]*?return;/u);
  assert.match(worker, /'cloudflare_regular'[\s\S]*?runMarketplaceCanaryCatchup\(env, scheduledAt\)[\s\S]*?Promise\.allSettled\(\[/u);
  assert.doesNotMatch(worker.match(/'cloudflare_regular'([\s\S]*?)\)\);/u)?.[1] || '', /runDeepCanaryCycle/u);
});

test('marketplace probes run independently so one provider cannot starve the other result', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher: providerFetch } = providerHarness();
  let yahooStarted = false;
  let yahooStartedBeforeRakutenFinished = false;
  const fetcher = async (url, options) => {
    if (String(url).includes('openapi.rakuten.co.jp')) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      yahooStartedBeforeRakutenFinished = yahooStarted;
    }
    if (String(url).includes('shopping.yahooapis.jp')) yahooStarted = true;
    return providerFetch(url, options);
  };
  const result = await runDeepCanaryCycle(
    env,
    new Date('2026-08-13T01:22:00.000Z'),
    fetcher,
    { componentsOverride: ['rakuten', 'yahoo'] }
  );
  assert.equal(yahooStartedBeforeRakutenFinished, true);
  assert.deepEqual(result.results.map((row) => row.component), ['rakuten', 'yahoo']);
});

test('regular-cron catch-up retries only stale free marketplace canaries', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite, '2026-08-13T00:52:00.000Z');
  sqlite.prepare(`UPDATE growth_events SET occurred_at='2026-08-13T01:07:00.000Z'
    WHERE medium='rakuten' AND event_type='deep_canary_result'`).run();
  const { fetcher, calls } = providerHarness();
  const result = await runMarketplaceCanaryCatchup(
    env, new Date('2026-08-13T01:15:00.000Z'), fetcher
  );
  assert.deepEqual(result.results, [{ component: 'yahoo', status: 'PASS', code: 'CANARY_OK' }]);
  assert.equal(callsTo(calls, 'shopping.yahooapis.jp').length, 1);
  assert.equal(callsTo(calls, 'openapi.rakuten.co.jp').length, 0);
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
  assert.equal(callsTo(calls, 'api.openai.com').length, 0);
});

test('paid probes atomically reserve, settle from provider usage, and persist no query or product payload', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  const { fetcher } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T06:07:00Z'), fetcher);
  assert.equal(result.results.every((row) => row.status === 'PASS'), true);
  assert.equal(result.monthly_micro_usd, 776);

  const budget = sqlite.prepare(`SELECT medium,campaign,content,marketplace
    FROM growth_events WHERE event_type='deep_canary_budget' ORDER BY medium`).all()
    .map((row) => ({ ...row }));
  assert.deepEqual(budget, [
    { medium: 'ai_chat_primary', campaign: 'SETTLED', content: '0000338', marketplace: '0500000' },
    { medium: 'openai_backup', campaign: 'SETTLED', content: '0000375', marketplace: '0007000' },
    { medium: 'query_structurer', campaign: 'SETTLED', content: '0000063', marketplace: '0100000' }
  ]);
  const stored = JSON.stringify(sqlite.prepare('SELECT * FROM growth_events').all());
  assert.doesNotMatch(stored, /軽い|ワイヤレス|イヤホン|api-key|authorization|response/iu);
});

test('same paid slot cannot call AI twice even when two cron invocations overlap', async (t) => {
  const { sqlite, env } = sqliteEnvironment({
    GEMINI_PRODUCT_DISCOVERY_MODEL: 'primary-disabled-for-query-test'
  });
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher, calls } = providerHarness();
  const slot = new Date('2026-08-13T01:07:00Z');
  await Promise.all([
    runDeepCanaryCycle(env, slot, fetcher),
    runDeepCanaryCycle(env, slot, fetcher)
  ]);
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget' AND medium='query_structurer'`).get().count, 1);
});

test('monthly five-dollar cap rejects the next reservation before any AI call', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  seedBudget(sqlite, 4_900_001);
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T01:07:00Z'), fetcher);
  assert.equal(result.results.find((row) => row.component === 'query_structurer')?.code,
    'CANARY_MONTHLY_BUDGET_LIMIT');
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
  assert.equal(result.results.find((row) => row.component === 'rakuten')?.status, 'PASS');
  assert.equal(result.monthly_micro_usd, 4_900_001);
});

test('provider failure releases its reservation instead of poisoning the monthly budget', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher } = providerHarness({ usage: false });
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T01:07:00Z'), fetcher);
  assert.equal(result.results.find((row) => row.component === 'query_structurer')?.code,
    'CANARY_USAGE_MISSING');
  const held = sqlite.prepare(`SELECT campaign,content,marketplace FROM growth_events
    WHERE event_type='deep_canary_budget' AND medium='query_structurer'`).get();
  assert.deepEqual({ ...held }, {
    campaign: 'RELEASED', content: '0000000', marketplace: '0100000'
  });
  assert.equal(result.monthly_micro_usd, 0);
});

test('a semantically corrupted budget row fails closed before any paid provider call', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  sqlite.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,
      occurred_at,traffic_class,visitor_id,session_id)
    VALUES('corrupt-budget','deep_canary_budget','JA','worker','query_structurer',
      'RESERVED','0000001','0000001','2026-08-13T00:00:00.000Z','QA','','')`).run();
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T01:07:00Z'), fetcher, {
    clock: () => new Date('2026-08-13T01:07:01Z')
  });
  assert.equal(result.results.find((row) => row.component === 'query_structurer')?.code,
    'CANARY_MONTHLY_BUDGET_LIMIT');
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget'`).get().count, 1);
});

test('unknown model is rejected before reservation and provider invocation', async (t) => {
  const { sqlite, env } = sqliteEnvironment({
    GEMINI_QUERY_REFINEMENT_MODEL: 'gemini-unknown',
    GEMINI_PRODUCT_DISCOVERY_MODEL: 'gemini-primary-unknown'
  });
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T01:07:00Z'), fetcher);
  assert.equal(result.results.find((row) => row.component === 'query_structurer')?.code,
    'CANARY_MODEL_PRICING_UNKNOWN');
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget'`).get().count, 0);
});

test('AI chat primary canary exercises IDENTIFY rather than the cheaper REFINE contract', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T01:07:00Z'), fetcher);
  assert.equal(result.results.find((row) => row.component === 'ai_chat_primary')?.status, 'PASS');
  const geminiBodies = callsTo(calls, 'generativelanguage.googleapis.com').map((call) => call.body);
  assert.equal(geminiBodies.length, 2);
  const identify = geminiBodies.find((body) => body?.generationConfig?.maxOutputTokens === 256);
  assert.ok(identify);
  assert.match(String(identify.contents?.[0]?.parts?.[0]?.text || ''), /product-identification assistant/u);
  assert.match(String(identify.contents?.[0]?.parts?.[0]?.text || ''), /"candidate_name"/u);
});

test('a delayed month-end cron charges the wall-clock month, not its scheduled month', async (t) => {
  const { sqlite, env } = sqliteEnvironment({
    GEMINI_PRODUCT_DISCOVERY_MODEL: 'primary-disabled-for-month-boundary-test'
  });
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher } = providerHarness();
  const result = await runDeepCanaryCycle(
    env,
    new Date('2026-08-31T23:07:00.000Z'),
    fetcher,
    { clock: () => new Date('2026-09-01T00:00:30.000Z') }
  );
  const budget = sqlite.prepare(`SELECT event_id,occurred_at FROM growth_events
    WHERE event_type='deep_canary_budget'`).all().map((row) => ({ ...row }));
  assert.equal(budget.length, 1);
  assert.match(budget[0].event_id, /^deep-canary-budget:\d+:query_structurer$/u);
  assert.match(budget[0].occurred_at, /^2026-09-01T/u);
  assert.equal(result.monthly_micro_usd, 63);
});

test('the same scheduled slot remains idempotent when replayed across a UTC month boundary', async (t) => {
  const { sqlite, env } = sqliteEnvironment({
    GEMINI_PRODUCT_DISCOVERY_MODEL: 'primary-disabled-for-cross-month-replay-test'
  });
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher, calls } = providerHarness();
  const slot = new Date('2026-08-31T23:07:00.000Z');
  await runDeepCanaryCycle(env, slot, fetcher, {
    clock: () => new Date('2026-08-31T23:59:50.000Z')
  });
  await runDeepCanaryCycle(env, slot, fetcher, {
    clock: () => new Date('2026-09-01T00:00:30.000Z')
  });
  assert.equal(callsTo(calls, '/gemini-3.1-flash-lite:generateContent').length, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget' AND medium='query_structurer'`).get().count, 1);
});

test('a completely new installation runs one explicit all-component bootstrap cycle', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  const { fetcher } = providerHarness();
  const result = await runDeepCanaryCycle(env, new Date('2026-08-13T01:22:00.000Z'), fetcher, {
    clock: () => new Date('2026-08-13T01:22:01.000Z')
  });
  assert.deepEqual(result.results.map((row) => row.component),
    ['rakuten', 'yahoo', 'query_structurer', 'ai_chat_primary', 'openai_backup']);
});

test('expired pricing revision blocks every paid AI probe while marketplace probes continue', async (t) => {
  const { sqlite, env } = sqliteEnvironment();
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher, calls } = providerHarness();
  const result = await runDeepCanaryCycle(
    env,
    new Date('2026-09-13T00:07:00.000Z'),
    fetcher,
    { clock: () => new Date('2026-09-13T00:07:01.000Z') }
  );
  for (const component of ['query_structurer', 'ai_chat_primary', 'openai_backup']) {
    assert.equal(result.results.find((row) => row.component === component)?.code,
      'CANARY_PRICING_REVIEW_REQUIRED');
  }
  assert.equal(callsTo(calls, 'generativelanguage.googleapis.com').length, 0);
  assert.equal(callsTo(calls, 'api.openai.com').length, 0);
  assert.equal(callsTo(calls, 'openapi.rakuten.co.jp').length, 1);
  assert.equal(callsTo(calls, 'shopping.yahooapis.jp').length, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM growth_events
    WHERE event_type='deep_canary_budget'`).get().count, 0);
});

test('different paid run IDs atomically compete for the remaining monthly budget', async (t) => {
  const { sqlite, env } = sqliteEnvironment({
    GEMINI_PRODUCT_DISCOVERY_MODEL: 'primary-disabled-for-budget-race-test'
  });
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  seedBudget(sqlite, 4_900_000);
  const { fetcher, calls } = providerHarness();
  const clock = () => new Date('2026-08-13T02:08:00.000Z');
  const results = await Promise.all([
    runDeepCanaryCycle(env, new Date('2026-08-13T01:07:00.000Z'), fetcher, { clock }),
    runDeepCanaryCycle(env, new Date('2026-08-13T02:07:00.000Z'), fetcher, { clock })
  ]);
  assert.equal(callsTo(calls, '/gemini-3.1-flash-lite:generateContent').length, 1);
  assert.equal(results.flatMap((result) => result.results)
    .filter((row) => row.component === 'query_structurer' && row.code === 'CANARY_MONTHLY_BUDGET_LIMIT').length, 1);
  const spent = sqlite.prepare(`SELECT SUM(CAST(content AS INTEGER)) AS total
    FROM growth_events WHERE event_type='deep_canary_budget'`).get().total;
  assert.ok(spent <= 5_000_000, `budget exceeded: ${spent}`);
});

test('deep canary uses the production marketplace and query structurer deadlines', async (t) => {
  const { sqlite, env } = sqliteEnvironment({
    GEMINI_PRODUCT_DISCOVERY_MODEL: 'primary-disabled-for-timeout-test'
  });
  t.after(() => sqlite.close());
  seedPriorResults(sqlite);
  const { fetcher } = providerHarness();
  const timeouts = [];
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (milliseconds) => {
    timeouts.push(milliseconds);
    return originalTimeout(milliseconds);
  };
  try {
    await runDeepCanaryCycle(
      env,
      new Date('2026-08-13T01:07:00.000Z'),
      fetcher,
      { clock: () => new Date('2026-08-13T01:08:00.000Z') }
    );
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
  assert.deepEqual(timeouts, [7000, 2500, 1500]);
});

test('public growth endpoint cannot forge deep canary result or budget rows', () => {
  assert.throws(() => normalizeGrowthEvent({ event_type: 'deep_canary_result' }), /GROWTH_EVENT_INVALID/u);
  assert.throws(() => normalizeGrowthEvent({ event_type: 'deep_canary_budget' }), /GROWTH_EVENT_INVALID/u);
});
