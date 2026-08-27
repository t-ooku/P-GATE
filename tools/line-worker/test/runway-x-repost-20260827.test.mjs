import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeSocialPost, xWeightedLength } from '../src/social-publisher.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, '..');
const root = path.resolve(worker, '..', '..');
const read = (relative, base = worker) => fs.readFileSync(path.join(base, relative), 'utf8');

const stage = read('ops/runway/stage_x_reposts_20260827.sql');
const release = read('ops/runway/release_x_reposts_20260827.sql');
const workflow = read('.github/workflows/ci.yml', root);
const ciScript = read('ops/runway/x_repost_20260827_ci.mjs');

const posts = [
  {
    job: 'runway-hoshilu-name-forgotten-20260819-v1',
    oldPost: 'hoshilu-runway-name-forgotten-20260819-v1-x',
    oldExternal: '2092837231291502616',
    post: 'hoshilu-runway-name-forgotten-20260819-v1-x-repost-20260827',
    caption: 'Qoo10やSHEINで見たのに、商品名を忘れた。覚えている色・形・使い方を話すだけ。AIが特徴を理解し、HOSHILUが商品を探します。※この動画はAI生成・AI加工映像です。 #Qoo10購入品 #SHEIN購入品',
    utm: 'runway_name_forgotten_20260819_v1_x_repost'
  },
  {
    job: 'runway-hoshilu-overseas-find-20260819-v2',
    oldPost: 'hoshilu-runway-overseas-find-20260819-v2-x',
    oldExternal: '2092874950390718829',
    post: 'hoshilu-runway-overseas-find-20260819-v2-x-repost-20260827',
    caption: '海外やQoo10・SHEINで見かけた「あれ」、日本でも探せる。覚えている特徴を話すだけ。AIが理解し、HOSHILUが探します。※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #海外通販',
    utm: 'runway_overseas_find_20260819_v2_x_repost'
  }
];

function fixture() {
  const database = new DatabaseSync(':memory:');
  database.exec(read('migrations/0006_social_post_queue.sql'));
  database.exec(read('migrations/0014_social_platform_job.sql'));
  database.exec(read('migrations/0050_runway_video_generation.sql'));
  const now = '2026-08-27T00:00:00.000Z';
  for (const [index, item] of posts.entries()) {
    database.prepare(`INSERT INTO runway_generation_jobs (
      job_id,post_id,request_fingerprint,status,recipe,character_image_url,product_image_url,
      duration_seconds,ratio,audio,product_info,user_concept,expected_credits,rights_confirmed,
      ai_disclosure_confirmed,storage_key,storage_size_bytes,storage_content_type,qa_status,
      created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      item.job, item.oldPost, `fingerprint-${index}`, 'APPROVED_FOR_POST', 'product_ugc',
      'https://hoshilu.app/character.jpg', 'https://hoshilu.app/product.jpg', 8, '720:1280', 1,
      'product', 'concept', 336, 1, 1, `runway/${item.job}/reviewed.mp4`, 1234,
      'video/mp4', 'PASSED', now, now
    );
    database.prepare(`INSERT INTO social_post_queue (
      post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
      affiliate,external_post_id,published_at,created_at,updated_at
    ) VALUES (?, 'X', 'hoshilu-runway-video', ?, 'old caption', '', ?, ?, 'PUBLISHED', 0, ?, ?, ?, ?)`)
      .run(item.oldPost, item.job, `https://hoshilu.app/api/social/media/runway/${item.job}.mp4`, now,
        item.oldExternal, now, now, now);
  }
  return database;
}

test('stageは旧公開履歴を保ったまま新しい2行を確認待ちで作る', () => {
  const database = fixture();
  database.exec(stage);
  const staged = database.prepare(`SELECT * FROM social_post_queue
    WHERE post_id LIKE '%-x-repost-20260827' ORDER BY post_id`).all();
  assert.equal(staged.length, 2);
  for (const item of posts) {
    const row = staged.find((candidate) => candidate.post_id === item.post);
    assert.equal(row.status, 'REVIEW_REQUIRED');
    assert.equal(row.platform, 'X');
    assert.equal(row.caption, item.caption);
    assert.equal(row.affiliate, 0);
    assert.equal(row.external_post_id, '');
    assert.equal(row.platform_job_id, '');
    assert.equal(row.published_at, '');
    assert.equal(new URL(row.link).searchParams.get('utm_source'), 'x');
    assert.equal(new URL(row.link).searchParams.get('utm_content'), item.utm);
    const old = database.prepare('SELECT status,external_post_id,published_at FROM social_post_queue WHERE post_id=?').get(item.oldPost);
    assert.equal(old.status, 'PUBLISHED');
    assert.equal(old.external_post_id, item.oldExternal);
    assert.equal(old.published_at, '2026-08-27T00:00:00.000Z');
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM runway_audit_log WHERE event='X_POST_DELETED_BY_OWNER'").get().count, 2);
});

test('releaseは2行の完全一致時だけ両方をAPPROVEDにする', () => {
  const database = fixture();
  database.exec(stage);
  database.exec(release);
  const rows = database.prepare(`SELECT status,approved_at FROM social_post_queue
    WHERE post_id LIKE '%-x-repost-20260827'`).all();
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.status, 'APPROVED');
    assert.ok(row.approved_at);
  }
});

test('片方の本文が変わっていたらreleaseは2行とも止める', () => {
  const database = fixture();
  database.exec(stage);
  database.prepare('UPDATE social_post_queue SET caption=? WHERE post_id=?').run('tampered caption', posts[0].post);
  database.exec(release);
  const statuses = database.prepare(`SELECT status FROM social_post_queue
    WHERE post_id LIKE '%-x-repost-20260827' ORDER BY post_id`).all().map((row) => row.status);
  assert.deepEqual(statuses, ['REVIEW_REQUIRED', 'REVIEW_REQUIRED']);
});

test('Xの最終整形後も誤メンションがなく、若者向けタグとリンクを280以内で保つ', () => {
  for (const item of posts) {
    const normalized = normalizeSocialPost({
      platform: 'X', caption: item.caption,
      link: `https://hoshilu.app/?utm_source=x&utm_medium=organic_social&utm_content=${item.utm}`,
      status: 'APPROVED'
    });
    assert.doesNotMatch(normalized.caption, /@hoshilu(?:\.app)?/iu);
    assert.match(normalized.caption, /#Qoo10/u);
    assert.match(normalized.caption, /#SHEIN/u);
    assert.ok(xWeightedLength(normalized.caption) + 1 + 23 <= 280);
  }
});

test('stageとreleaseは別のcommit markerでのみ起動する', () => {
  assert.match(workflow, /\[stage-hoshilu-x-reposts-20260827-approved\]/);
  assert.match(workflow, /\[release-hoshilu-x-reposts-20260827-approved\]/);
  assert.match(workflow, /x_repost_20260827_ci\.mjs stage/);
  assert.match(workflow, /x_repost_20260827_ci\.mjs release/);
  assert.match(ciScript, /stage_x_reposts_20260827\.sql/);
  assert.match(ciScript, /release_x_reposts_20260827\.sql/);
  assert.doesNotMatch(stage, /SET\s+status='APPROVED'/iu);
  assert.equal(release.trimEnd().lastIndexOf('UPDATE social_post_queue'), release.trimEnd().indexOf('UPDATE social_post_queue'));
  assert.match(release.trimEnd(), /UPDATE social_post_queue[\s\S]+;$/u);
  for (const item of posts) {
    assert.ok(stage.includes(item.post));
    assert.ok(release.includes(item.post));
    assert.ok(stage.includes(item.caption));
    assert.ok(release.includes(item.caption));
  }
});
