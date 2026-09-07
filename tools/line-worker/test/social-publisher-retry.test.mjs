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
