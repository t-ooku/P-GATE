import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  handlePromotionDashboardRoutes, promotionDashboardSummary
} from '../src/promotion-dashboard.mjs';

const migration = readFileSync(new URL('../migrations/0006_social_post_queue.sql', import.meta.url), 'utf8');
const unmetMigration = readFileSync(new URL('../migrations/0004_unmet_demand_events.sql', import.meta.url), 'utf8');
const growthMigration = readFileSync(new URL('../migrations/0012_growth_events.sql', import.meta.url), 'utf8');
const trafficMigration = readFileSync(new URL('../migrations/0013_growth_event_traffic_class.sql', import.meta.url), 'utf8');
const visitorMigration = readFileSync(new URL('../migrations/0047_growth_visitor_sessions.sql', import.meta.url), 'utf8');

function d1(db) {
  return {
    async batch(statements) {
      return statements.map(item => ({ results: item.__statement.all(...item.__values) }));
    },
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return {
            __statement: statement,
            __values: values,
            async all() { return { results: statement.all(...values) }; },
            async first() { return statement.get(...values) || null; },
            async run() { statement.run(...values); return { meta: { changes: 1 } }; }
          };
        },
        async all() { return { results: statement.all() }; },
        async first() { return statement.get() || null; },
        async run() { statement.run(); return { meta: { changes: 1 } }; }
      };
    }
  };
}

function setup() {
  const db = new DatabaseSync(':memory:'); db.exec(migration); db.exec(unmetMigration); db.exec(growthMigration); db.exec(trafficMigration); db.exec(visitorMigration);
  db.exec(`CREATE TABLE member_notification_destinations(member_id TEXT,channel TEXT,verified_at TEXT); INSERT INTO member_notification_destinations VALUES('m1','LINE','2026-08-01'),('m1','EMAIL','2026-08-02'),('m2','EMAIL','2026-08-03'),('email-alias','EMAIL','2026-08-04'),('email-alias','IDENTITY_ALIAS','2026-08-04');`);
  const insert = db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,status,published_at,external_post_id,last_error,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insert.run('x-next', 'X', '次のX', '2026-08-10T11:00:00.000Z', 'APPROVED', '', '', '', '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z');
  insert.run('ig-live', 'INSTAGRAM', '公開済みリール', '2026-08-09T11:15:00.000Z', 'PUBLISHED', '2026-08-09T11:16:00.000Z', 'ig-1', '', '2026-08-09T00:00:00Z', '2026-08-09T11:16:00Z');
  insert.run('ig-fail', 'INSTAGRAM', '失敗リール', '2026-08-08T11:15:00.000Z', 'FAILED', '', '', 'API_ERROR', '2026-08-08T00:00:00Z', '2026-08-08T11:16:00Z');
  const event = db.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const v1 = '550e8400-e29b-41d4-a716-446655440000';
  const v2 = '750e8400-e29b-41d4-a716-446655440000';
  const s1 = '650e8400-e29b-41d4-a716-446655440000';
  const s2 = '850e8400-e29b-41d4-a716-446655440000';
  const s3 = '950e8400-e29b-41d4-a716-446655440000';
  const typed1 = `search_${'a'.repeat(64)}`;
  const typed2 = `search_${'b'.repeat(64)}`;
  const typedOrphan = `search_${'c'.repeat(64)}`;
  for (const [id, type, at, marketplace = '', visitor = v1, session = s1] of [
    ['e0', 'landing_view', '2026-08-09T11:59:00Z'],
    ['e1', 'search_started', '2026-08-09T12:00:00Z'],
    [`${typed1}:input`, 'search_input_text', '2026-08-09T12:00:00Z'],
    [`${typed1}:completed`, 'search_completed_text', '2026-08-09T12:01:00Z'],
    [`${typed1}:outbound`, 'search_outbound_text', '2026-08-09T12:02:00Z'],
    ['e2', 'search_completed', '2026-08-09T12:01:00Z'],
    ['continuous1', 'continuous_search_saved', '2026-08-09T12:02:30Z'],
    ['registered1', 'member_registered', '2026-08-09T12:03:00Z'],
    ['e3', 'price_comparison_opened', '2026-08-09T12:01:30Z'],
    ['e4', 'marketplace_click', '2026-08-09T12:02:00Z', 'RAKUTEN_JP'],
    ['e5', 'landing_view', '2026-08-09T13:00:00Z', '', v2, s2],
    ['e6', 'search_started', '2026-08-09T13:01:00Z', '', v2, s2],
    [`${typed2}:input`, 'search_input_screenshot_social_url', '2026-08-09T13:01:00Z', '', v2, s2],
    [`${typedOrphan}:completed`, 'search_completed_text', '2026-08-09T13:01:05Z', '', v2, s2],
    ['e7', 'search_dead_end', '2026-08-09T13:01:10Z', '', v2, s2],
    ['continuous2', 'continuous_search_saved', '2026-08-09T13:02:00Z', '', v2, s2],
    ['e8', 'landing_view', '2026-08-09T14:00:00Z', '', v1, s3]
  ]) event.run(id, type, 'JA', 'instagram', 'social', 'campaign', '', marketplace, at, 'ATTRIBUTED', visitor, session);
  event.run('continuous-enabled1', 'continuous_search_enabled', 'JA', 'worker', 'member_wish',
    'authenticated_enable', '', '', '2026-08-09T12:02:31Z', 'UNATTRIBUTED', '', '');
  for (const [id, type, source] of [
    ['diagnostic-backend', 'search_backend_failed', 'worker'],
    ['diagnostic-provider', 'search_provider_degraded', 'worker'],
    ['diagnostic-client', 'search_client_degraded', 'browser']
  ]) event.run(id, type, 'JA', source, 'search', 'internal_diagnostic', '', '',
    '2026-08-09T12:02:32Z', 'UNATTRIBUTED', '', '');
  const oldSession = 'a50e8400-e29b-41d4-a716-446655440000';
  for (const [id, type, at, marketplace = ''] of [
    ['old0', 'landing_view', '2026-08-01T11:59:00Z'], ['old1', 'search_started', '2026-08-01T12:00:00Z'],
    ['old2', 'search_completed', '2026-08-01T12:01:00Z'], ['old3', 'marketplace_click', '2026-08-01T12:02:00Z', 'AMAZON_JP']
  ]) event.run(id, type, 'JA', 'x', 'social', 'old', '', marketplace, at, 'ATTRIBUTED', v1, oldSession);
  event.run('qa', 'marketplace_click', 'JA', 'instagram', 'qa', 'test', '', 'RAKUTEN_JP', '2026-08-09T12:03:00Z', 'QA', v1, s1);
  return db;
}

test('販促ダッシュボードは各チャネルを分離して予定・公開・失敗を集計する', async () => {
  const db = setup();
  const summary = await promotionDashboardSummary({
    PRODUCT_DB: d1(db), X_USER_ACCESS_TOKEN: 'x',
    INSTAGRAM_ACCESS_TOKEN: 'ig', INSTAGRAM_ACCOUNT_ID: 'account',
    SOCIAL_AUTOPILOT_ENABLED: 'true'
  }, new Date('2026-08-10T00:00:00.000Z'));
  assert.deepEqual(summary.channels.map(channel => channel.platform), ['X', 'INSTAGRAM', 'TIKTOK']);
  assert.equal(summary.channels[0].next.post_id, 'x-next');
  assert.equal(summary.channels[1].counts.published, 1);
  assert.equal(summary.channels[1].counts.failed, 1);
  assert.equal(summary.channels[2].configured, false);
  assert.match(summary.channels[0].schedule, /毎日20:15.*22歳設定v2 AI女優/);
  assert.match(summary.channels[1].schedule, /毎日20:15.*22歳設定v2 AI女優/);
  assert.equal(summary.channels[1].funnel_7d.search_started, 2);
  assert.equal(summary.channels[1].funnel_7d.marketplace_click, 1);
  assert.equal(summary.channels[1].funnel_rates_7d.search_completion, 50);
  assert.equal(summary.channels[1].funnel_rates_7d.marketplace_outbound, 100);
  assert.equal(summary.business_kpis.status, 'READY');
  assert.equal(summary.business_kpis.registered_members, 2);
  assert.equal(summary.business_kpis.annual_traffic_goal.visitors, 1000000);
  assert.equal(summary.business_kpis.annual_traffic_goal.daily_pace, 2740);
  assert.equal(summary.business_kpis.annual_traffic_goal.monthly_pace, 83334);
  assert.equal(summary.business_kpis.annual_traffic_goal.actual_visitors, 0);
  const period = summary.business_kpis.periods['7d'];
  assert.equal(period.current.visitors, 2);
  assert.equal(period.current.sessions, 3);
  assert.equal(period.current.repeat_visitors, 1);
  assert.equal(period.current.search_sessions, 2);
  assert.equal(period.current.completed_search_sessions, 1);
  assert.equal(period.current.registration_sessions, 1);
  assert.equal(period.current.rates.registration, 33.3);
  assert.equal(period.current.failed_search_sessions, 1);
  assert.equal(period.current.value_sessions, 1);
  assert.equal(period.current.outbound_sessions, 1);
  assert.equal(period.current.wish_sessions, 1);
  assert.equal(period.current.continuous_search_save_sessions, 2);
  assert.equal(period.current.continuous_search_enabled_count, 1);
  assert.equal(period.current.sessions, 3, 'server-owned enabled event must not create a synthetic session');
  assert.equal(period.current.rates.tracking_coverage, 100,
    'server-owned and diagnostic events are not eligible for anonymous browser identity coverage');
  assert.equal(period.current.identity_eligible_events, period.current.identified_events,
    'the coverage numerator and denominator exclude the same internal event types');
  assert.equal(period.current.avg_value_seconds, 90);
  assert.equal(period.current.rates.search_completion, 50);
  assert.equal(period.current.rates.value_realization, 100);
  assert.equal(period.previous.value_sessions, 1);
  assert.equal(period.sources[0].source, 'instagram');
  assert.equal(period.marketplaces[0].marketplace, 'RAKUTEN_JP');
  assert.equal(period.daily.at(-1).value_sessions, 1);
  assert.equal(period.search_input_mix.total_searches, 2);
  assert.equal(period.search_input_mix.counts.TEXT, 1);
  assert.equal(period.search_input_mix.counts.SCREENSHOT_SOCIAL_URL, 1);
  assert.equal(period.search_input_mix.counts.TEXT_SCREENSHOT_SOCIAL_URL, 0);
  assert.equal(period.search_input_mix.rates.TEXT, 50);
  assert.equal(period.search_input_mix.rates.SCREENSHOT_SOCIAL_URL, 50);
  assert.equal(period.search_input_mix.performance.TEXT.attempts, 1);
  assert.equal(period.search_input_mix.performance.TEXT.completed, 1);
  assert.equal(period.search_input_mix.performance.TEXT.outbound, 1);
  assert.equal(period.search_input_mix.performance.TEXT.success_rate, 100);
  assert.equal(period.search_input_mix.performance.TEXT.outbound_rate, 100);
  assert.equal(period.search_input_mix.performance.SCREENSHOT_SOCIAL_URL.success_rate, 0);
  assert.equal(period.search_input_mix.performance.SCREENSHOT_SOCIAL_URL.outbound_rate, 0);
  assert.match(period.search_input_mix.rate_definition, /成功率=成功÷受理/);
  assert.match(period.search_input_mix.rate_definition, /送客CVR=送客した検索÷受理/);
  assert.deepEqual(summary.business_kpis.search_input_mix['7d'], period.search_input_mix);
  assert.equal(summary.business_kpis.search_input_mix['30d'].total_searches, 2);
});

test('カメラ検索の固定入力区分ごとに受理・成功・送客CVを分離して集計する', async () => {
  const db = setup();
  const event = db.prepare(`INSERT INTO growth_events
    (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const visitor = '750e8400-e29b-41d4-a716-446655440000';
  const session = '850e8400-e29b-41d4-a716-446655440000';
  const cameraExecutions = [
    [`search_${'d'.repeat(64)}`, [
      ['input', 'search_input_camera'],
      ['completed', 'search_completed_camera'],
      ['outbound', 'search_outbound_camera']
    ]],
    [`search_${'e'.repeat(64)}`, [
      ['input', 'search_input_text_camera'],
      ['completed', 'search_completed_text_camera']
    ]],
    [`search_${'f'.repeat(64)}`, [
      ['input', 'search_input_camera_social_url'],
      ['outbound', 'search_outbound_camera_social_url']
    ]],
    [`search_${'1'.repeat(64)}`, [
      ['input', 'search_input_text_camera_social_url']
    ]]
  ];
  for (const [executionKey, stages] of cameraExecutions) {
    for (const [stage, type] of stages) {
      event.run(`${executionKey}:${stage}`, type, 'JA', 'instagram', 'social', 'camera-search', '', '',
        '2026-08-09T15:00:00Z', 'ATTRIBUTED', visitor, session);
    }
  }

  const summary = await promotionDashboardSummary({
    PRODUCT_DB: d1(db), SOCIAL_AUTOPILOT_ENABLED: 'false'
  }, new Date('2026-08-10T00:00:00.000Z'));
  const mix = summary.business_kpis.periods['7d'].search_input_mix;

  assert.equal(mix.total_searches, 6);
  assert.equal(mix.counts.CAMERA, 1);
  assert.equal(mix.counts.TEXT_CAMERA, 1);
  assert.equal(mix.counts.CAMERA_SOCIAL_URL, 1);
  assert.equal(mix.counts.TEXT_CAMERA_SOCIAL_URL, 1);
  assert.deepEqual(mix.performance.CAMERA, {
    attempts: 1, completed: 1, outbound: 1,
    mix_rate: 16.7, success_rate: 100, outbound_rate: 100, attempt_to_outbound_rate: 100
  });
  assert.deepEqual(mix.performance.TEXT_CAMERA, {
    attempts: 1, completed: 1, outbound: 0,
    mix_rate: 16.7, success_rate: 100, outbound_rate: 0, attempt_to_outbound_rate: 0
  });
  assert.deepEqual(mix.performance.CAMERA_SOCIAL_URL, {
    attempts: 1, completed: 0, outbound: 1,
    mix_rate: 16.7, success_rate: 0, outbound_rate: 100, attempt_to_outbound_rate: 100
  });
  assert.deepEqual(mix.performance.TEXT_CAMERA_SOCIAL_URL, {
    attempts: 1, completed: 0, outbound: 0,
    mix_rate: 16.7, success_rate: 0, outbound_rate: 0, attempt_to_outbound_rate: 0
  });
});

test('経営KPIが未移行でもSNS運用部分は表示できる', async () => {
  const db = setup();
  db.exec('DROP TABLE growth_events');
  const summary = await promotionDashboardSummary({ PRODUCT_DB: d1(db), SOCIAL_AUTOPILOT_ENABLED: 'false' }, new Date('2026-08-10T00:00:00.000Z'));
  assert.equal(summary.ok, true);
  assert.equal(summary.business_kpis.status, 'UNAVAILABLE');
  assert.equal(summary.channels.length, 3);
  assert.ok(summary.social_warnings.includes('social_funnel'));
});

test('販促ダッシュボードAPIは管理認証が無ければ拒否する', async () => {
  const response = await handlePromotionDashboardRoutes(
    new Request('https://hoshilu.app/api/admin/promotion-dashboard'),
    { PRODUCT_DB: d1(setup()) }
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});
