import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { operationalDiagnostics, assertReadOnlySql } from '../scripts/read-codex-kpi-snapshot.mjs';

function d1(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(assertReadOnlySql(sql));
      const result = values => ({
        async all() { return { results: statement.all(...values) }; }
      });
      return {
        ...result([]),
        bind(...values) { return result(values); }
      };
    }
  };
}

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  const now = Date.now();
  const at = minutes => new Date(now + minutes * 60_000).toISOString();
  const currentJstDate = new Date(now + 9 * 60 * 60_000).toISOString().slice(0, 10);
  const jstNoonUtc = Date.parse(`${currentJstDate}T03:00:00.000Z`);
  const times = {
    queued: at(-60),
    sent: at(-55),
    optedOut: at(-54),
    replied: at(-53),
    socialFirst: new Date(jstNoonUtc).toISOString(),
    socialLast: new Date(jstNoonUtc + 60_000).toISOString(),
    landing: at(-50),
    article: at(-49),
    articleClick: at(-48),
    search: at(-47),
    watchStarted: at(-46),
    watchSet: at(-45),
    mallClick: at(-44),
    notificationReturn: at(-43),
    notificationMallClick: at(-42),
    qaResult: at(-41),
    qaTrace: at(-40)
  };
  sqlite.testTimes = times;
  sqlite.exec(`
    CREATE TABLE products(id TEXT);
    CREATE TABLE marketplace_offers(id TEXT);
    CREATE TABLE sp_api_listings(id TEXT);
    CREATE TABLE d1_migrations(id INTEGER,name TEXT,applied_at TEXT);
    CREATE TABLE seller_outreach_contacts(contact_id TEXT,status TEXT,sent_at TEXT,scheduled_at TEXT,email_hash TEXT);
    CREATE TABLE seller_outreach_suppressions(email_hash TEXT);
    CREATE TABLE social_post_queue(post_id TEXT,platform TEXT,status TEXT,external_post_id TEXT,published_at TEXT,scheduled_at TEXT,last_error TEXT);
    CREATE TABLE social_post_performance(post_id TEXT,public_url TEXT,snapshot_at TEXT);
    CREATE TABLE growth_events(event_type TEXT,traffic_class TEXT,source TEXT,visitor_id TEXT,session_id TEXT,medium TEXT,campaign TEXT,content TEXT,occurred_at TEXT);
    CREATE TABLE mywatch_notifications(event_type TEXT,event_key TEXT,member_id TEXT,channel TEXT,status TEXT,delivered_at TEXT);
    CREATE TABLE marketplace_price_cache(marketplace TEXT,expires_at TEXT,fetched_at TEXT);
    CREATE TABLE member_wishes(member_id TEXT,watch_price INTEGER,condition_snapshot TEXT);

    INSERT INTO seller_outreach_contacts VALUES
      ('queued','QUEUED',NULL,'${times.queued}','queued-hash'),
      ('sent','SENT','${times.sent}','${times.sent}','sent-hash'),
      ('opted-out','OPTED_OUT','${times.optedOut}','${times.optedOut}','opted-out-hash'),
      ('replied','REPLIED','${times.replied}','${times.replied}','replied-hash'),
      ('failed','FAILED',NULL,'${times.sent}','failed-hash');
    INSERT INTO d1_migrations VALUES
      (1,'0001_initial.sql','2026-09-07T00:00:00Z'),
      (2,'0002_private_name.sql','2026-09-08T00:00:00Z');
    INSERT INTO social_post_queue VALUES
      ('private-post-id-1','X','PUBLISHED','private-external-id','${times.socialFirst}','${times.socialFirst}',''),
      ('private-post-id-2','X','PUBLISHED','private-external-id-2','${times.socialLast}','${times.socialLast}','');
    INSERT INTO social_post_performance VALUES
      ('private-post-id-1','https://example.invalid/private-post','2026-09-08T00:06:00Z');
    INSERT INTO growth_events VALUES
      ('landing_view','ATTRIBUTED','seo_article','visitor-general','article-session','','','','${times.landing}'),
      ('seo_article_view','ATTRIBUTED','seo_article','visitor-general','article-session','','','','${times.article}'),
      ('seo_search_transition','ATTRIBUTED','seo_article','visitor-general','article-session','','','','${times.articleClick}'),
      ('search_started','ATTRIBUTED','seo_article','visitor-general','article-session','','','','${times.search}'),
      ('target_price_watch_started','ATTRIBUTED','seo_article','visitor-general','article-session','','','','${times.watchStarted}'),
      ('target_price_watch_set','ATTRIBUTED','seo_article','visitor-general','article-session','','','','${times.watchSet}'),
      ('marketplace_click','ATTRIBUTED','seo_article','visitor-general','article-session','','','','${times.mallClick}'),
      ('landing_view','ATTRIBUTED','price_watch_notification','visitor-return','return-session','','','','${times.notificationReturn}'),
      ('marketplace_click','ATTRIBUTED','price_watch_notification','visitor-return','return-session','','','','${times.notificationMallClick}'),
      ('search_started','ATTRIBUTED','seo_article','visitor-reverse','reverse-session','','','','${times.article}'),
      ('seo_article_view','ATTRIBUTED','seo_article','visitor-reverse','reverse-session','','','','${times.articleClick}'),
      ('seo_article_view','QA','seo_article','visitor-internal','qa-session','','','','${times.article}'),
      ('target_price_watch_set','QA','seo_article','visitor-internal','qa-session','','','','${times.watchSet}'),
      ('search_qa_result','QA','qa','visitor-internal','qa-session','private-query-id','PASS','private product text','${times.qaResult}'),
      ('search_qa_trace','QA','qa','visitor-internal','qa-session','private-query-id','PASS','private trace text','${times.qaTrace}');
    INSERT INTO mywatch_notifications VALUES
      ('PRICE_DROP','TARGET:general','general-member','EMAIL','SENT','2026-09-08T00:10:00Z'),
      ('PRICE_DROP','TARGET:internal','internal-1','EMAIL','SENT','2026-09-08T00:11:00Z');
    INSERT INTO member_wishes VALUES
      ('general-member',1,'{"price_condition":{"target_price_jpy":1000}}'),
      ('internal-1',1,'{"price_condition":{"target_price_jpy":1000}}');
  `);
  return sqlite;
}

test('運用診断は記事→希望価格と通知再訪を同一セッションで集計し内部会員を除外する', async () => {
  const sqlite = setup();
  const result = await operationalDiagnostics(d1(sqlite), ['internal-1']);

  assert.deepEqual(result.article_watch_journey_7d.rows.map(row => ({ ...row })), [{
    article_sessions: 2,
    article_to_search_click_sessions: 1,
    article_to_search_started_sessions: 1,
    article_to_watch_started_sessions: 1,
    article_to_watch_set_sessions: 1,
    article_to_mall_click_sessions: 1
  }]);
  assert.deepEqual(result.site_watch_journey_7d.rows.map(row => ({ ...row })), [{
    landing_sessions: 2,
    search_sessions: 1,
    watch_started_sessions: 1,
    watch_set_sessions: 1,
    notification_return_sessions: 1,
    notification_return_to_mall_click_sessions: 1,
    mall_click_sessions: 2
  }]);
  assert.equal(result.general_user_watch_set.rows[0].watches, 1);
  assert.equal(result.general_user_watch_set.rows[0].users, 1);
  assert.equal(result.notifications.rows.length, 1);
  assert.equal(result.notifications.rows[0].count, 1);
  assert.deepEqual(result.outreach_lifecycle, {
    sent: { status: 'AVAILABLE', count: 3 },
    delivered: { status: 'UNAVAILABLE', reason: 'RESEND_DELIVERY_EVENT_NOT_CONNECTED' },
    bounce: { status: 'UNAVAILABLE', reason: 'RESEND_BOUNCE_EVENT_NOT_CONNECTED' },
    unsubscribe: { status: 'AVAILABLE', count: 1 },
    response: { status: 'AVAILABLE', count: 1 },
    failed: { status: 'AVAILABLE', count: 1 },
    queued: { status: 'AVAILABLE', count: 1 },
    eligible_now: { status: 'AVAILABLE', count: 1 },
    next_scheduled_at: sqlite.testTimes.queued
  });
  assert.deepEqual(result.migrations.rows.map(row => ({ ...row })), [{
    applied_count: 2,
    last_applied_at: '2026-09-08T00:00:00Z'
  }]);
  assert.deepEqual(result.social.rows.map(row => ({ ...row })), [{
    platform: 'X', status: 'PUBLISHED', error_code: 'NONE', count: 2,
    last_published_at: sqlite.testTimes.socialLast, next_scheduled_at: null
  }]);
  assert.deepEqual(result.search_qa.rows.map(row => ({ ...row })), [{
    outcome: 'PASS', count: 1, last_observed_at: sqlite.testTimes.qaResult
  }]);
  const serialized = JSON.stringify(result);
  for (const forbidden of ['private-post-id', 'private-external-id', 'private product text',
    'private trace text', 'private-query-id', '0002_private_name.sql']) {
    assert.equal(serialized.includes(forbidden), false, `aggregate diagnostics must omit ${forbidden}`);
  }
});

test('過去日付のThreads再試行とStoryを匿名集計し、未接続をゼロとしない', async () => {
  const sqlite=setup();
  sqlite.exec(`ALTER TABLE social_post_queue ADD COLUMN content_id TEXT DEFAULT '';
    ALTER TABLE social_post_queue ADD COLUMN content_format TEXT DEFAULT '';
    ALTER TABLE social_post_queue ADD COLUMN updated_at TEXT DEFAULT '';
    ALTER TABLE growth_events ADD COLUMN marketplace TEXT DEFAULT '';
    INSERT INTO social_post_queue(post_id,platform,status,external_post_id,published_at,scheduled_at,last_error,content_id)
    VALUES('old-retry','THREADS','APPROVED','','','2026-01-01','THREADS_CREATE_500_Param text must be at most 500 characters','private content'),
      ('story','INSTAGRAM','APPROVED','','',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'','today_story_example');
    INSERT INTO growth_events(event_type,traffic_class,campaign,marketplace,occurred_at) VALUES
      ('target_price_provider_result','QA','HTTP_400','RAKUTEN_JP',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      ('target_price_provider_result','QA','PRIVATE_QUERY','RAKUTEN_JP',strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
  const result=await operationalDiagnostics(d1(sqlite),['internal-1']);
  assert.equal(result.threads_retry_audit.status,'AVAILABLE');
  assert.equal(result.threads_retry_audit.rows[0].error_code,'TEXT_TOO_LONG');
  assert.equal(result.threads_retry_audit.rows[0].count,1);
  assert.equal(result.instagram_formats_today.rows.find(r=>r.format==='STORY').published_with_three_fields,0);
  assert.equal(result.target_price_providers_24h.rows.length,1);
  assert.equal(result.target_price_providers_24h.rows[0].outcome,'HTTP_400');
  assert.equal(JSON.stringify(result).includes('PRIVATE_QUERY'),false);
  assert.equal(JSON.stringify(result).includes('private content'),false);
  const unavailable=await operationalDiagnostics({prepare(){throw Error('unavailable');}},[]);
  assert.equal(unavailable.threads_retry_audit.status,'UNAVAILABLE');
  assert.equal(unavailable.instagram_formats_today.status,'UNAVAILABLE');
});

test('内部会員IDがない場合は通知・一般利用者ウォッチを0件に偽装しない', async () => {
  const result = await operationalDiagnostics(d1(setup()));
  assert.deepEqual(result.notifications, {
    status: 'UNVERIFIED', reason: 'INTERNAL_MEMBER_EXCLUSION_NOT_CONFIGURED'
  });
  assert.equal(result.general_user_watch_set.status, 'UNVERIFIED');
  assert.equal(result.general_user_watch_set.reason, 'INTERNAL_MEMBER_EXCLUSION_NOT_CONFIGURED');
});
