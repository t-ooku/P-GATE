import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const queueMigration = readFileSync(new URL('../migrations/0006_social_post_queue.sql', import.meta.url), 'utf8');
const performanceMigration = readFileSync(new URL('../migrations/0029_social_post_performance.sql', import.meta.url), 'utf8');

test('投稿成果は未取得をNULLのまま保存しQAと社内アクセスを分類できる', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(queueMigration);
  db.exec(performanceMigration);
  db.exec(performanceMigration);
  db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`).run('post-1', 'X', 'caption', '2026-08-02', '2026-08-02', '2026-08-02');
  db.prepare(`INSERT INTO social_post_performance
    (snapshot_id,post_id,platform,snapshot_at,traffic_class,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).run('snap-1', 'post-1', 'X', '2026-08-03', 'INTERNAL', '2026-08-03', '2026-08-03');

  const row = db.prepare('SELECT impressions,free_registrations,traffic_class FROM social_post_performance').get();
  assert.equal(row.impressions, null);
  assert.equal(row.free_registrations, null);
  assert.equal(row.traffic_class, 'INTERNAL');
  assert.throws(() => db.prepare(`UPDATE social_post_performance SET reach=-1`).run(), /CHECK constraint failed/);
});
