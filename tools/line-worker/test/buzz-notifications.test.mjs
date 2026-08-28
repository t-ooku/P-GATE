import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { queueBuzzThemeNotifications } from '../src/buzz-notifications.mjs';

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of ['0002_member_wishes.sql', '0005_mywatch_notifications.sql', '0031_member_notification_destinations.sql', '0059_buzz_theme_notifications.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(sql) { this.statement = sqlite.prepare(sql); this.values = []; }
    bind(...values) { this.values = values; return this; }
    async run() { const result = this.statement.run(...this.values); return { meta: { changes: result.changes } }; }
    async first() { return this.statement.get(...this.values) || null; }
    async all() { return { results: this.statement.all(...this.values) }; }
  }
  return { sqlite, env: { PRODUCT_DB: { prepare(sql) { return new Statement(sql); } } } };
}

test('BUZZテーマ通知は有効会員だけへ火・金のテーマごとに一度だけ作る', async (t) => {
  const { sqlite, env } = database(t);
  sqlite.prepare(`INSERT INTO member_buzz_preferences
    (member_id,enabled,delivery_channels,language,created_at,updated_at)
    VALUES('enabled',1,'APP','JA','2026-08-20','2026-08-20'),
          ('disabled',0,'APP','JA','2026-08-20','2026-08-20')`).run();

  const tuesday = new Date('2026-08-25T00:15:00+09:00');
  const first = await queueBuzzThemeNotifications(env, tuesday);
  const duplicate = await queueBuzzThemeNotifications(env, tuesday);
  assert.equal(first.queued, 1);
  assert.equal(duplicate.queued, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM mywatch_notifications').get().count, 1);
  const notification = sqlite.prepare('SELECT member_id,wish_id,event_type,channel,title,body,status FROM mywatch_notifications').get();
  assert.equal(notification.member_id, 'enabled');
  assert.equal(notification.wish_id, 'HOSHILU_BUZZ');
  assert.equal(notification.event_type, 'BUZZ_THEME_CHANGED');
  assert.equal(notification.channel, 'APP');
  assert.equal(notification.status, 'DELIVERED');
  assert.match(notification.title, /BUZZ.*テーマ/u);
  assert.match(notification.body, /火曜・金曜/u);
  assert.match(notification.body, /https:\/\/hoshilu\.app\/buzz/u);

  const friday = await queueBuzzThemeNotifications(env, new Date('2026-08-28T00:15:00+09:00'));
  assert.equal(friday.queued, 1);
  assert.notEqual(friday.theme_id, first.theme_id);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM mywatch_notifications').get().count, 2);
});

test('韓国コスメを含む現在テーマの通知は外部通知先にもPENDINGで積む', async (t) => {
  const { sqlite, env } = database(t);
  sqlite.prepare(`INSERT INTO member_buzz_preferences
    (member_id,enabled,delivery_channels,language,created_at,updated_at)
    VALUES('member',1,'APP,EMAIL','JA','2026-08-20','2026-08-20')`).run();
  sqlite.prepare(`INSERT INTO member_notification_destinations
    (member_id,channel,encrypted_destination,verified_at,updated_at)
    VALUES('member','EMAIL','encrypted','2026-08-20','2026-08-20')`).run();
  const result = await queueBuzzThemeNotifications(env, new Date('2026-08-25T00:15:00+09:00'));
  assert.equal(result.queued, 2);
  assert.deepEqual(sqlite.prepare('SELECT channel,status FROM mywatch_notifications ORDER BY channel').all()
    .map((row) => ({ ...row })), [
    { channel: 'APP', status: 'DELIVERED' },
    { channel: 'EMAIL', status: 'PENDING' }
  ]);
});
