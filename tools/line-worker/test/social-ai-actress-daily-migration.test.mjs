import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const queueMigration = readFileSync(
  new URL('../migrations/0006_social_post_queue.sql', import.meta.url), 'utf8'
);
const platformJobMigration = readFileSync(
  new URL('../migrations/0014_social_platform_job.sql', import.meta.url), 'utf8'
);
const threadsMigration = readFileSync(
  new URL('../migrations/0052_social_post_queue_threads.sql', import.meta.url), 'utf8'
);
const dailyAiActressMigration = readFileSync(
  new URL('../migrations/0061_social_ai_actress_daily.sql', import.meta.url), 'utf8'
);

function applyAsTransaction(db, sql) {
  db.exec('BEGIN;');
  try {
    db.exec(sql);
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(queueMigration);
  db.exec(platformJobMigration);
  applyAsTransaction(db, threadsMigration);
  applyAsTransaction(db, dailyAiActressMigration);
  return db;
}

test('0061は22歳v2 AI女優の曜日別7本と当日X・Instagramを承認済みで登録する', () => {
  const db = freshDb();
  const assets = db.prepare(`SELECT asset_id,media_sha256,content_format,creative_policy,
    persona_id,persona_age,ai_actress_present,audio_confirmed,rights_confirmed,
    rights_ledger_id,qa_status,ai_generated,ai_disclosure_confirmed,approved_at
    FROM social_creative_assets ORDER BY jst_publish_date`).all();
  assert.equal(assets.length, 7);
  for (const asset of assets) {
    assert.match(asset.asset_id, /^hoshilu_ai_actress_daily_(?:mon|tue|wed|thu|fri|sat|sun)_v1$/u);
    assert.match(asset.media_sha256, /^[0-9a-f]{64}$/u);
    assert.equal(asset.content_format, 'REEL');
    assert.equal(asset.creative_policy, 'DAILY_AI_ACTRESS_22');
    assert.equal(asset.persona_id, 'hoshilu-approved-model-reference-v2');
    assert.equal(asset.persona_age, 22);
    assert.equal(asset.ai_actress_present, 1);
    assert.equal(asset.audio_confirmed, 1);
    assert.equal(asset.rights_confirmed, 1);
    assert.notEqual(asset.rights_ledger_id, '');
    assert.equal(asset.qa_status, 'PASSED');
    assert.equal(asset.ai_generated, 1);
    assert.equal(asset.ai_disclosure_confirmed, 1);
    assert.ok(Number.isFinite(Date.parse(asset.approved_at)));
  }

  const posts = db.prepare(`SELECT post_id,platform,campaign_id,content_id,caption,media_url,
    scheduled_at,status,creative_asset_id,content_format,creative_policy,jst_publish_date,
    ai_generated,crosspost_group_id FROM social_post_queue ORDER BY platform`).all();
  assert.deepEqual(posts.map(row => row.platform), ['INSTAGRAM', 'X']);
  for (const post of posts) {
    assert.equal(post.post_id,
      `hoshilu-ai-actress-daily-v1-${post.platform.toLowerCase()}-2026-08-29`);
    assert.equal(post.campaign_id, 'hoshilu-ai-actress-daily-v1');
    assert.equal(post.content_id, 'hoshilu-ai-actress-daily-2026-08-29');
    assert.match(post.caption, /※この動画はAI生成・AI加工映像です。/u);
    assert.match(post.caption, /#AI生成/u);
    assert.equal(post.media_url,
      'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4');
    assert.equal(post.scheduled_at, '2026-08-29T11:15:00.000Z');
    assert.equal(post.status, 'APPROVED');
    assert.equal(post.creative_asset_id, 'hoshilu_ai_actress_daily_sat_v1');
    assert.equal(post.content_format, 'REEL');
    assert.equal(post.creative_policy, 'DAILY_AI_ACTRESS_22');
    assert.equal(post.jst_publish_date, '2026-08-29');
    assert.equal(post.ai_generated, 1);
    assert.equal(post.crosspost_group_id, post.content_id);
  }
});

test('0061のDBゲートは人物・音源・権利・QA・AI開示の欠損を公開状態遷移時に拒否する', () => {
  const db = freshDb();
  const postId = 'hoshilu-ai-actress-daily-v1-x-2026-08-29';
  db.prepare(`UPDATE social_creative_assets SET qa_status='FAILED'
    WHERE asset_id='hoshilu_ai_actress_daily_sat_v1'`).run();
  assert.throws(() => db.prepare(`UPDATE social_post_queue SET status='PUBLISHING'
    WHERE post_id=?`).run(postId), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);
  assert.equal(db.prepare('SELECT status FROM social_post_queue WHERE post_id=?').get(postId).status,
    'APPROVED');

  db.prepare(`UPDATE social_creative_assets SET qa_status='PASSED',audio_confirmed=0
    WHERE asset_id='hoshilu_ai_actress_daily_sat_v1'`).run();
  assert.throws(() => db.prepare(`UPDATE social_post_queue SET status='PUBLISHING'
    WHERE post_id=?`).run(postId), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);

  db.prepare(`UPDATE social_creative_assets SET audio_confirmed=1,rights_confirmed=0
    WHERE asset_id='hoshilu_ai_actress_daily_sat_v1'`).run();
  assert.throws(() => db.prepare(`UPDATE social_post_queue SET status='PUBLISHING'
    WHERE post_id=?`).run(postId), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);

  db.prepare(`UPDATE social_creative_assets SET rights_confirmed=1,ai_actress_present=0
    WHERE asset_id='hoshilu_ai_actress_daily_sat_v1'`).run();
  assert.throws(() => db.prepare(`UPDATE social_post_queue SET status='PUBLISHING'
    WHERE post_id=?`).run(postId), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);

  db.prepare(`UPDATE social_creative_assets SET ai_actress_present=1
    WHERE asset_id='hoshilu_ai_actress_daily_sat_v1'`).run();
  db.prepare(`UPDATE social_post_queue SET status='PUBLISHING' WHERE post_id=?`).run(postId);
  assert.equal(db.prepare('SELECT status FROM social_post_queue WHERE post_id=?').get(postId).status,
    'PUBLISHING');
});

test('0061は開示欠損・曜日違いを拒否し、非対象投稿と次週の承認済み曜日素材再利用は妨げない', () => {
  const db = freshDb();
  const insert = db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,
     status,created_at,updated_at,creative_asset_id,content_format,creative_policy,
     jst_publish_date,ai_generated,crosspost_group_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const group = 'hoshilu-ai-actress-daily-2026-09-05';
  const base = [
    'future-sat', 'X', 'hoshilu-ai-actress-daily-v1', group,
    '次週も会おう。※この動画はAI生成・AI加工映像です。 #AI生成', '',
    'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
    '2026-09-05T11:15:00.000Z', 'APPROVED',
    '2026-09-05T00:00:00.000Z', '2026-09-05T00:00:00.000Z',
    'hoshilu_ai_actress_daily_sat_v1', 'REEL', 'DAILY_AI_ACTRESS_22',
    '2026-09-05', 1, group
  ];
  assert.doesNotThrow(() => insert.run(...base));

  const duplicateDailySlot = [...base];
  duplicateDailySlot[0] = 'future-sat-duplicate-slot';
  assert.throws(() => insert.run(...duplicateDailySlot), /UNIQUE constraint failed/u);

  const noDisclosure = [...base];
  noDisclosure[0] = 'future-sat-no-disclosure';
  noDisclosure[4] = '次週も会おう。 #AI生成';
  assert.throws(() => insert.run(...noDisclosure), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);

  const wrongWeekday = [...base];
  wrongWeekday[0] = 'future-sat-wrong-asset';
  wrongWeekday[6] = 'https://hoshilu.app/social/hoshilu-ai-actress-daily-fri-v1.mp4';
  wrongWeekday[11] = 'hoshilu_ai_actress_daily_fri_v1';
  assert.throws(() => insert.run(...wrongWeekday), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);

  const bypassPolicy = [...base];
  bypassPolicy[0] = 'future-sat-policy-bypass';
  bypassPolicy[13] = '';
  assert.throws(() => insert.run(...bypassPolicy), /SOCIAL_AI_ACTRESS_POLICY_REQUIRED/u);

  assert.doesNotThrow(() => db.prepare(`INSERT INTO social_post_queue
    (post_id,platform,caption,scheduled_at,status,created_at,updated_at)
    VALUES('legacy-approved','X','従来の承認済み投稿です。','2026-09-05T11:00:00.000Z',
      'APPROVED','2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z')`).run());
});
