import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  handlePromotionDashboardRoutes, promotionDashboardSummary
} from '../src/promotion-dashboard.mjs';

const migration = readFileSync(new URL('../migrations/0006_social_post_queue.sql', import.meta.url), 'utf8');

function d1(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return {
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
  const db = new DatabaseSync(':memory:'); db.exec(migration);
  const insert = db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,status,published_at,external_post_id,last_error,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insert.run('x-next', 'X', '次のX', '2026-08-10T11:00:00.000Z', 'APPROVED', '', '', '', '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z');
  insert.run('ig-live', 'INSTAGRAM', '公開済みリール', '2026-08-09T11:15:00.000Z', 'PUBLISHED', '2026-08-09T11:16:00.000Z', 'ig-1', '', '2026-08-09T00:00:00Z', '2026-08-09T11:16:00Z');
  insert.run('ig-fail', 'INSTAGRAM', '失敗リール', '2026-08-08T11:15:00.000Z', 'FAILED', '', '', 'API_ERROR', '2026-08-08T00:00:00Z', '2026-08-08T11:16:00Z');
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
  assert.match(summary.channels[1].schedule, /月・火・土 20:15/);
});

test('販促ダッシュボードAPIは管理認証が無ければ拒否する', async () => {
  const response = await handlePromotionDashboardRoutes(
    new Request('https://hoshilu.app/api/admin/promotion-dashboard'),
    { PRODUCT_DB: d1(setup()) }
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});
