import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { operationalDiagnostics } from '../scripts/read-codex-kpi-snapshot.mjs';

function d1(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
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
      ('queued','QUEUED',NULL,'2026-09-07T00:00:00Z','queued-hash'),
      ('sent','SENT','2026-09-08T00:05:00Z','2026-09-08T00:00:00Z','sent-hash'),
      ('opted-out','OPTED_OUT','2026-09-08T00:06:00Z','2026-09-08T00:00:00Z','opted-out-hash'),
      ('replied','REPLIED','2026-09-08T00:07:00Z','2026-09-08T00:00:00Z','replied-hash'),
      ('failed','FAILED',NULL,'2026-09-08T00:00:00Z','failed-hash');
    INSERT INTO growth_events VALUES
      ('landing_view','ATTRIBUTED','seo_article','visitor-general','article-session','','','','2026-09-07T23:59:00Z'),
      ('seo_article_view','ATTRIBUTED','seo_article','visitor-general','article-session','','','','2026-09-08T00:00:00Z'),
      ('seo_search_transition','ATTRIBUTED','seo_article','visitor-general','article-session','','','','2026-09-08T00:01:00Z'),
      ('search_started','ATTRIBUTED','seo_article','visitor-general','article-session','','','','2026-09-08T00:02:00Z'),
      ('target_price_watch_started','ATTRIBUTED','seo_article','visitor-general','article-session','','','','2026-09-08T00:03:00Z'),
      ('target_price_watch_set','ATTRIBUTED','seo_article','visitor-general','article-session','','','','2026-09-08T00:04:00Z'),
      ('marketplace_click','ATTRIBUTED','seo_article','visitor-general','article-session','','','','2026-09-08T00:05:00Z'),
      ('landing_view','ATTRIBUTED','price_watch_notification','visitor-return','return-session','','','','2026-09-08T00:06:00Z'),
      ('marketplace_click','ATTRIBUTED','price_watch_notification','visitor-return','return-session','','','','2026-09-08T00:07:00Z'),
      ('search_started','ATTRIBUTED','seo_article','visitor-reverse','reverse-session','','','','2026-09-08T00:00:00Z'),
      ('seo_article_view','ATTRIBUTED','seo_article','visitor-reverse','reverse-session','','','','2026-09-08T00:01:00Z'),
      ('seo_article_view','QA','seo_article','visitor-internal','qa-session','','','','2026-09-08T00:00:00Z'),
      ('target_price_watch_set','QA','seo_article','visitor-internal','qa-session','','','','2026-09-08T00:04:00Z');
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
  const result = await operationalDiagnostics(d1(setup()), ['internal-1']);

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
    next_scheduled_at: '2026-09-07T00:00:00Z'
  });
});

test('内部会員IDがない場合は通知・一般利用者ウォッチを0件に偽装しない', async () => {
  const result = await operationalDiagnostics(d1(setup()));
  assert.deepEqual(result.notifications, {
    status: 'UNVERIFIED', reason: 'INTERNAL_MEMBER_EXCLUSION_NOT_CONFIGURED'
  });
  assert.equal(result.general_user_watch_set.status, 'UNVERIFIED');
  assert.equal(result.general_user_watch_set.reason, 'INTERNAL_MEMBER_EXCLUSION_NOT_CONFIGURED');
});
