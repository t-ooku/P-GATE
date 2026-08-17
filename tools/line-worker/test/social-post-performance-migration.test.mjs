import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const queueMigration = readFileSync(new URL('../migrations/0006_social_post_queue.sql', import.meta.url), 'utf8');
const platformJobMigration = readFileSync(new URL('../migrations/0014_social_platform_job.sql', import.meta.url), 'utf8');
const performanceMigration = readFileSync(new URL('../migrations/0029_social_post_performance.sql', import.meta.url), 'utf8');
const queueThreadsMigration = readFileSync(new URL('../migrations/0052_social_post_queue_threads.sql', import.meta.url), 'utf8');
const performanceThreadsMigration = readFileSync(new URL('../migrations/0053_social_post_performance_threads.sql', import.meta.url), 'utf8');

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

function freshDbBeforeThreadsMigrations() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(queueMigration);
  db.exec(platformJobMigration);
  db.exec(performanceMigration);
  return db;
}

// D1 applies each migration file as a single transaction (confirmed against
// production: https://developers.cloudflare.com/d1/sql-api/foreign-keys/ ,
// https://github.com/cloudflare/workers-sdk/issues/5438). node:sqlite's
// db.exec() on a multi-statement string does NOT do this on its own - each
// statement autocommits - so 0052's PRAGMA defer_foreign_keys=on would only
// defer within a statement, not across the whole file, unless the whole
// file is wrapped in an explicit BEGIN/COMMIT here to match D1's real
// behaviour.
function applyMigrationAsSingleTransaction(db, sql) {
  db.exec('BEGIN;');
  try {
    db.exec(sql);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

test('0052/0053マイグレーション前はTHREADSがqueueとperformanceの両方で拒否される', () => {
  const db = freshDbBeforeThreadsMigrations();
  assert.throws(() => db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`).run('post-too-early', 'THREADS', 'caption', '2026-08-04', '2026-08-04', '2026-08-04'),
    /CHECK constraint failed/);

  db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`).run('post-existing', 'X', 'caption', '2026-08-02', '2026-08-02', '2026-08-02');
  assert.throws(() => db.prepare(`INSERT INTO social_post_performance
    (snapshot_id,post_id,platform,snapshot_at,traffic_class,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).run('snap-too-early', 'post-existing', 'THREADS', '2026-08-04', 'ATTRIBUTED', '2026-08-04', '2026-08-04'),
    /CHECK constraint failed/);
});

test('0052/0053マイグレーションはTHREADSを許可しつつ既存データと制約を保つ、かつ再実行しても安全', () => {
  const db = freshDbBeforeThreadsMigrations();
  db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`).run('post-pre-existing', 'X', 'caption', '2026-08-02', '2026-08-02', '2026-08-02');
  db.prepare(`INSERT INTO social_post_performance
    (snapshot_id,post_id,platform,snapshot_at,traffic_class,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).run('snap-pre-existing', 'post-pre-existing', 'X', '2026-08-03', 'ATTRIBUTED', '2026-08-03', '2026-08-03');

  // social_post_performance.post_id は social_post_queue.post_id への外部キーなので、
  // 先に子(performance)、次に親(queue)の順で適用しても、その逆でも安全であること。
  // 各ファイルはD1と同じく単一トランザクションとして適用する(上のヘルパー参照)。
  applyMigrationAsSingleTransaction(db, queueThreadsMigration);
  applyMigrationAsSingleTransaction(db, performanceThreadsMigration);
  applyMigrationAsSingleTransaction(db, queueThreadsMigration); // 再実行しても壊れないこと
  applyMigrationAsSingleTransaction(db, performanceThreadsMigration);

  // 既存データが失われていないこと。
  const preExistingQueue = db.prepare('SELECT platform FROM social_post_queue WHERE post_id=?').get('post-pre-existing');
  assert.equal(preExistingQueue.platform, 'X');
  const preExistingPerf = db.prepare('SELECT platform,traffic_class FROM social_post_performance WHERE snapshot_id=?').get('snap-pre-existing');
  assert.equal(preExistingPerf.platform, 'X');
  assert.equal(preExistingPerf.traffic_class, 'ATTRIBUTED');

  // platform_job_id (0014で追加された列) が引き継がれていること。
  db.prepare(`UPDATE social_post_queue SET platform_job_id=? WHERE post_id=?`).run('job-123', 'post-pre-existing');
  assert.equal(db.prepare('SELECT platform_job_id FROM social_post_queue WHERE post_id=?').get('post-pre-existing').platform_job_id, 'job-123');

  db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`).run('post-threads', 'THREADS', 'caption', '2026-08-05', '2026-08-05', '2026-08-05');
  db.prepare(`INSERT INTO social_post_performance
    (snapshot_id,post_id,platform,snapshot_at,traffic_class,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).run('snap-threads', 'post-threads', 'THREADS', '2026-08-05', 'ATTRIBUTED', '2026-08-05', '2026-08-05');
  assert.equal(db.prepare('SELECT platform FROM social_post_queue WHERE post_id=?').get('post-threads').platform, 'THREADS');
  assert.equal(db.prepare('SELECT platform FROM social_post_performance WHERE snapshot_id=?').get('snap-threads').platform, 'THREADS');

  // 数値カラムの負値禁止と、対応外プラットフォームの拒否は維持されていること。
  assert.throws(() => db.prepare(`UPDATE social_post_performance SET reach=-1 WHERE snapshot_id='snap-threads'`).run(), /CHECK constraint failed/);
  assert.throws(() => db.prepare(`INSERT INTO social_post_performance
    (snapshot_id,post_id,platform,snapshot_at,traffic_class,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).run('snap-bad-platform', 'post-threads', 'BLUESKY', '2026-08-06', 'ATTRIBUTED', '2026-08-06', '2026-08-06'),
    /CHECK constraint failed/);
  assert.throws(() => db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`).run('post-bad-platform', 'BLUESKY', 'caption', '2026-08-06', '2026-08-06', '2026-08-06'),
    /CHECK constraint failed/);
});
