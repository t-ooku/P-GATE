import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { normalizeSocialPost, publishSocialPost, runDueSocialPosts } from '../src/social-publisher.mjs';

const env = { THREADS_USER_ID: '123', THREADS_ACCESS_TOKEN: 'test', THREADS_INITIAL_DELAY_MS: 0, THREADS_POLL_DELAY_MS: 0 };

test('Threadsは長いURL・広告表記を含む実際の送信本文が500以内になる', async () => {
  for (const caption of ['欲しい価格になったら教えます。'.repeat(40), '🛍️'.repeat(180)]) {
    let text;
    const link = 'https://hoshilu.app/?q=' + encodeURIComponent('洗える水筒'.repeat(8));
    const post = { platform: 'THREADS', caption, link, affiliate: true, status: 'APPROVED' };
    const normalized = normalizeSocialPost(post);
    assert.ok(normalized.caption.includes('アフィリエイト'));
    await publishSocialPost(normalized, env, async (url, options) => {
      if (url.endsWith('/123/threads')) { text = JSON.parse(options.body).text; return Response.json({ id: 'job' }); }
      if (url.includes('/job?')) return Response.json({ status: 'FINISHED' });
      return Response.json({ id: 'published' });
    });
    assert.ok(text.length <= 500);
    assert.ok(text.endsWith(link));
    assert.ok(text.includes('※リンク先にはアフィリエイト広告を含む場合があります。'));
    assert.equal(text.isWellFormed(), true);
  }
});

test('URLだけで上限を超える投稿はAPIへ送信しない', async () => {
  let requests = 0;
  await assert.rejects(publishSocialPost({ platform: 'THREADS', caption: '欲しいものを探そう',
    link: 'https://hoshilu.app/?q=' + 'x'.repeat(510), status: 'APPROVED' }, env,
  async () => { requests++; }), /SOCIAL_THREADS_TEXT_TOO_LONG/);
  assert.equal(requests, 0);
});

function queue() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE social_post_queue(post_id TEXT PRIMARY KEY,platform,caption,status,scheduled_at,updated_at,
    platform_job_id DEFAULT '',external_post_id DEFAULT '',published_at DEFAULT '',last_error DEFAULT '');
    INSERT INTO social_post_queue(post_id,platform,caption,status,scheduled_at,updated_at)
    VALUES('post','THREADS','欲しい価格になったら教えます。','APPROVED','2026-09-07T00:00:00.000Z','2026-09-07T00:00:00.000Z');`);
  return { db, PRODUCT_DB: { prepare(sql) { return { bind(...values) {
    const s = db.prepare(sql); const bindings = Object.fromEntries(values.map((v,i) => [String(i+1),v]));
    return { all: async () => ({ results: s.all(bindings) }), run: async () => ({ meta: { changes: s.run(bindings).changes } }) };
  } }; } } };
}

test('HTTP500の文字数エラーは1回でFAILEDとなり次のcronで送信しない', async () => {
  const q = queue(); let requests = 0;
  const fetcher = async () => { requests++; return Response.json({ error: { message: 'Param text must be at most 500 characters long.' } }, { status: 500 }); };
  await runDueSocialPosts({ ...env, PRODUCT_DB: q.PRODUCT_DB }, new Date('2026-09-07T00:00:00Z'), fetcher);
  assert.equal(q.db.prepare('SELECT status FROM social_post_queue').get().status, 'FAILED');
  await runDueSocialPosts({ ...env, PRODUCT_DB: q.PRODUCT_DB }, new Date('2026-09-07T00:05:00Z'), fetcher);
  assert.equal(requests, 1);
  q.db.close();
});

test('一時障害はプロセスをまたいで最大3回で停止し、別の一時エラーに変わっても上限を回避しない', async () => {
  const q = queue(); let requests = 0;
  const fetcher = async () => { requests++; return Response.json({}, { status: requests === 2 ? 429 : 503 }); };
  for (let i = 0; i < 4; i++) await runDueSocialPosts({ ...env, PRODUCT_DB: q.PRODUCT_DB },
    new Date(Date.parse('2026-09-07T00:00:00Z') + i * 300000), fetcher);
  const row = q.db.prepare('SELECT * FROM social_post_queue').get();
  assert.equal(requests, 3);
  assert.equal(row.status, 'FAILED');
  assert.match(row.last_error, /^SOCIAL_RETRY_EXHAUSTED_3:/);
  q.db.close();
});

test('2026-09-14実例: Threads公開時のHTTP500(is_transient:true)は1回で終了せず再試行に回る', async () => {
  // watch-toiletpaper-price（2026-09-14 Threads 18:45）が THREADS_PUBLISH_500 の
  // OAuthException（本文に "is_transient":true）を受けて即FAILEDになり、無限リトライ
  // ではないぶん一見安全に見えたが、実際には一時障害1回で再試行なく終了していた欠陥。
  // isTransientSocialPublishError が THREADS_PUBLISH の5xxを対象コード名に含んでいな
  // かったことが原因（429だけ拾っていた）。is_transient:true の明示を安全網として
  // 追加したので、この形の失敗は最大試行回数まで再試行されることを確認する。
  const q = queue(); let publishAttempts = 0;
  const fetcher = async (url) => {
    if (url.endsWith('/123/threads')) return Response.json({ id: 'job1' });
    if (url.includes('/job1?')) return Response.json({ status: 'FINISHED' });
    publishAttempts++;
    return Response.json({
      error: {
        message: 'An unexpected error has occurred. Please retry your request later.',
        type: 'OAuthException', is_transient: true, code: 2, fbtrace_id: 'AzkI-8o44KOqNC-aTQ4_yqP'
      }
    }, { status: 500 });
  };
  await runDueSocialPosts({ ...env, PRODUCT_DB: q.PRODUCT_DB }, new Date('2026-09-14T09:45:00Z'), fetcher);
  let row = q.db.prepare('SELECT * FROM social_post_queue').get();
  assert.equal(publishAttempts, 1);
  assert.equal(row.status, 'APPROVED');
  assert.match(row.last_error, /^THREADS_PUBLISH_500_.*is_transient.*true/);
  assert.notEqual(row.platform_job_id, '');

  await runDueSocialPosts({ ...env, PRODUCT_DB: q.PRODUCT_DB }, new Date('2026-09-14T09:50:00Z'), fetcher);
  await runDueSocialPosts({ ...env, PRODUCT_DB: q.PRODUCT_DB }, new Date('2026-09-14T09:55:00Z'), fetcher);
  row = q.db.prepare('SELECT * FROM social_post_queue').get();
  assert.equal(publishAttempts, 3);
  assert.equal(row.status, 'FAILED');
  assert.match(row.last_error, /^SOCIAL_RETRY_EXHAUSTED_3:THREADS_PUBLISH_500_/);
  q.db.close();
});

// 2026-09-19 大隆さん指示「9,800円の旧料金体系の記事は取り下げ」: 公開済みの旧料金投稿だけをプラットフォームから削除する
test('旧料金（9,800円・送客料のみ）の公開済み X/Threads 投稿だけを DELETE し、CANCELLED+RETRACTED_OLD_PRICING で残す', async () => {
  const { retractOldPricingPosts } = await import('../src/social-publisher.mjs');
  const q = queue();
  q.db.exec(`DELETE FROM social_post_queue;
    INSERT INTO social_post_queue(post_id,platform,caption,status,scheduled_at,updated_at,external_post_id) VALUES
    ('old-x','X','Seller ¥9,800/月（税込）、最初の3か月は月額0円・送客料のみ。','PUBLISHED','2026-09-18T03:35:00Z','2026-09-18T03:40:00Z','2100792662391460294'),
    ('old-threads','THREADS','Seller 9,800円/月、最初の3か月は月額0円・送客料のみ。','PUBLISHED','2026-09-17T03:35:00Z','2026-09-17T03:40:00Z','18051652484799935'),
    ('new-x','X','HOSHILU Sellerは月額4,980円、最初の3か月は月額0円。','PUBLISHED','2026-09-19T03:35:00Z','2026-09-19T03:40:00Z','2101'),
    ('old-cancelled','X','Business 9,800円','CANCELLED','2026-09-22T11:00:00Z','2026-09-19T00:00:00Z',''),
    ('old-ig','INSTAGRAM','Seller 9,800円','PUBLISHED','2026-09-10T11:00:00Z','2026-09-10T11:05:00Z','ig1');`);
  const calls = [];
  const fetcher = async (url, options) => { calls.push([options.method, url]); return Response.json({ data: { deleted: true } }); };
  const envRetract = { PRODUCT_DB: q.PRODUCT_DB, THREADS_ACCESS_TOKEN: 'threads-token', X_USER_ACCESS_TOKEN: 'x-token', SOCIAL_RETRACT_OLD_PRICING: 'true' };
  const off = await retractOldPricingPosts({ ...envRetract, SOCIAL_RETRACT_OLD_PRICING: 'false' }, new Date('2026-09-19T06:00:00Z'), fetcher);
  assert.deepEqual(off, { checked: 0, retracted: 0, failed: 0, post_ids: [] }, 'フラグが無い間は何もしない');
  assert.equal(calls.length, 0);
  const result = await retractOldPricingPosts(envRetract, new Date('2026-09-19T06:00:00Z'), fetcher);
  assert.deepEqual([result.checked, result.retracted, result.failed], [2, 2, 0]);
  assert.deepEqual(calls.sort(), [
    ['DELETE', 'https://api.x.com/2/tweets/2100792662391460294'],
    ['DELETE', 'https://graph.threads.net/v1.0/18051652484799935?access_token=threads-token']
  ].sort());
  const rows = Object.fromEntries(q.db.prepare('SELECT post_id,status,last_error,external_post_id FROM social_post_queue').all().map((r) => [r.post_id, { ...r }]));
  assert.deepEqual(rows['old-x'], { post_id: 'old-x', status: 'CANCELLED', last_error: 'RETRACTED_OLD_PRICING', external_post_id: '2100792662391460294' }, '監査用に external_post_id は残す');
  assert.equal(rows['old-threads'].status, 'CANCELLED');
  assert.equal(rows['new-x'].status, 'PUBLISHED', '新料金の投稿には触れない');
  assert.equal(rows['old-ig'].status, 'PUBLISHED', 'Instagram は対象外（手動）');
  assert.equal(rows['old-cancelled'].status, 'CANCELLED');
  // 2回目は対象が無いので API を呼ばない（冪等）
  const again = await retractOldPricingPosts(envRetract, new Date('2026-09-19T06:05:00Z'), fetcher);
  assert.equal(again.checked, 0); assert.equal(calls.length, 2);
  q.db.close();
});

test('取り下げに失敗した投稿は PUBLISHED のまま理由を残し、次回また試す', async () => {
  const { retractOldPricingPosts } = await import('../src/social-publisher.mjs');
  const q = queue();
  q.db.exec(`DELETE FROM social_post_queue;
    INSERT INTO social_post_queue(post_id,platform,caption,status,scheduled_at,updated_at,external_post_id) VALUES
    ('old-threads','THREADS','Seller 9,800円/月・送客料のみ。','PUBLISHED','2026-09-17T03:35:00Z','2026-09-17T03:40:00Z','18051652484799935');`);
  let requests = 0;
  const fetcher = async () => { requests++; return Response.json({ error: { message: 'temporarily unavailable' } }, { status: 403 }); };
  const envRetract = { PRODUCT_DB: q.PRODUCT_DB, THREADS_ACCESS_TOKEN: 'threads-token', SOCIAL_RETRACT_OLD_PRICING: 'true' };
  const result = await retractOldPricingPosts(envRetract, new Date('2026-09-19T06:00:00Z'), fetcher);
  assert.deepEqual([result.checked, result.retracted, result.failed], [1, 0, 1]);
  const row = { ...q.db.prepare('SELECT status,last_error FROM social_post_queue').get() };
  assert.equal(row.status, 'PUBLISHED');
  assert.match(row.last_error, /^RETRACT_FAILED_THREADS_DELETE_403_/u, '失敗理由に API の本文要点を残す');
  await retractOldPricingPosts(envRetract, new Date('2026-09-19T06:05:00Z'), fetcher);
  assert.equal(requests, 2);
  q.db.close();
});

test('権限不足で失敗した Threads 行は cron では飛ばし、X を先に処理する。force なら再試行する', async () => {
  const { retractOldPricingPosts } = await import('../src/social-publisher.mjs');
  const q = queue();
  q.db.exec(`DELETE FROM social_post_queue;
    INSERT INTO social_post_queue(post_id,platform,caption,status,scheduled_at,updated_at,external_post_id,last_error) VALUES
    ('t1','THREADS','Seller 9,800円/月・送客料のみ。','PUBLISHED','2026-09-18T03:35:00Z','2026-09-19T07:42:00Z','181','RETRACT_FAILED_THREADS_DELETE_500_error message Application does not have permission for this action code 10'),
    ('x-old','X','Seller 9,800円/月・送客料のみ。','PUBLISHED','2026-09-07T03:35:00Z','2026-09-07T03:40:00Z','2096','');`);
  const calls = [];
  const fetcher = async (url, options) => { calls.push([options.method, url]); return Response.json({ data: { deleted: true } }); };
  const envRetract = { PRODUCT_DB: q.PRODUCT_DB, THREADS_ACCESS_TOKEN: 'threads-token', X_USER_ACCESS_TOKEN: 'x-token', SOCIAL_RETRACT_OLD_PRICING: 'true' };
  const cron = await retractOldPricingPosts(envRetract, new Date('2026-09-19T08:00:00Z'), fetcher, { limit: 1 });
  assert.deepEqual([cron.checked, cron.retracted, cron.post_ids], [1, 1, ['x-old']], 'limit 1 でも X の古い行が先に処理される');
  assert.equal(calls.length, 1); assert.match(calls[0][1], /api\.x\.com/u);
  const forced = await retractOldPricingPosts(envRetract, new Date('2026-09-19T08:05:00Z'), fetcher, { force: true });
  assert.deepEqual(forced.post_ids, ['t1']);
  q.db.close();
});
