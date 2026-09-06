import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  OUTREACH_PER_CYCLE_LIMIT, composeOutreachText, emailHash, findForbiddenPhrases,
  handleSellerOutreachRoutes, jstBusinessHours, jstDayRange, newUnsubscribeToken,
  outreachReadiness, runSellerOutreachCycle, unsubscribeUrl
} from '../src/seller-outreach.mjs';

function databaseEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0072_seller_outreach.sql', import.meta.url), 'utf8'));
  const env = {
    RESEND_API_KEY: 're_test_key', SELLER_OUTREACH_FROM: 'sellers@auth.hoshilu.app',
    SELLER_OUTREACH_REPLY_TO: 'owner@example.com', ...extra,
    PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
      return { bind(...next) { values = next; return this; },
        async run() { const info = statement.run(...values); return { success: true, meta: { changes: Number(info.changes || 0) } }; },
        async all() { return { results: statement.all(...values) }; } }; } }
  };
  return { db, env };
}

async function insertContact(db, overrides = {}) {
  const email = overrides.contact_email || 'shop@example.com';
  const row = { contact_id: 'c1', shop_name: 'テスト商店', contact_email: 'shop@example.com',
    email_hash: await emailHash(email), subject: '商品を探している人に、見つけてもらいませんか',
    body: 'テスト商店 ご担当者様\n\nHOSHILU では商品・ジャンル・ショップの3方向から見つけてもらえます。',
    status: 'QUEUED', scheduled_at: '2026-09-07T00:00:00.000Z', unsubscribe_token: 'a'.repeat(32),
    sent_at: '', created_at: '2026-09-06T00:00:00.000Z', updated_at: '2026-09-06T00:00:00.000Z', ...overrides };
  db.prepare(`INSERT INTO seller_outreach_contacts (contact_id,shop_name,contact_email,email_hash,subject,body,status,scheduled_at,sent_at,unsubscribe_token,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.contact_id, row.shop_name, row.contact_email, row.email_hash,
    row.subject, row.body, row.status, row.scheduled_at, row.sent_at, row.unsubscribe_token, row.created_at, row.updated_at);
  return row;
}

const MONDAY_10AM_JST = new Date('2026-09-07T01:00:00Z');

test('平日 09:00〜18:00 JST の外では送らない（土日・早朝・夜間）', () => {
  assert.equal(jstBusinessHours(MONDAY_10AM_JST), true);
  assert.equal(jstBusinessHours(new Date('2026-09-06T01:00:00Z')), false, '日曜');
  assert.equal(jstBusinessHours(new Date('2026-09-07T23:00:00Z')), false, '月曜 08:00 JST');
  assert.equal(jstBusinessHours(new Date('2026-09-07T09:30:00Z')), false, '月曜 18:30 JST');
  const day = jstDayRange(MONDAY_10AM_JST);
  assert.equal(day.from, '2026-09-06T15:00:00.000Z');
  assert.equal(day.to, '2026-09-07T15:00:00.000Z');
});

test('本文には必ず送信者表示と配信停止リンクが付く（特定電子メール法）', () => {
  const token = 'b'.repeat(32);
  const text = composeOutreachText('本文です。', token, { SELLER_OUTREACH_REPLY_TO: 'owner@example.com' });
  assert.match(text, /本文です。/u);
  assert.match(text, /HOSHILU（ホシル） 運営: 大隆/u);
  assert.match(text, /https:\/\/hoshilu\.app\/for-sellers/u);
  assert.match(text, /owner@example\.com/u);
  assert.ok(text.includes(unsubscribeUrl(token)), '配信停止リンク');
  assert.match(text, /公開されている事業者向けの連絡先に、1回だけお送りしています/u);
  assert.match(newUnsubscribeToken(), /^[0-9a-f]{32}$/u);
});

test('emailHash は Web Crypto の SHA-256（大文字小文字と前後空白を無視）', async () => {
  assert.equal(await emailHash(' Shop@Example.com '), await emailHash('shop@example.com'));
  assert.match(await emailHash('shop@example.com'), /^[0-9a-f]{64}$/u);
  const source = readFileSync(new URL('../src/seller-outreach.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import .*from '(?:node:|.*node:crypto)/mu, 'Workers に無い node: の組み込みモジュールを import しない');
});

test('§33 の禁止表現は送信前に落とす', () => {
  assert.deepEqual(findForbiddenPhrases('掲載すれば必ず売れます'), ['必ず売れ']);
  assert.deepEqual(findForbiddenPhrases('多数のユーザーがいます'), ['多数のユーザー']);
  assert.deepEqual(findForbiddenPhrases('商品・ジャンル・ショップの3方向から見つけてもらえます'), []);
});

test('未設定・営業時間外では何もしない', async () => {
  const { env } = databaseEnv({ RESEND_API_KEY: '' });
  assert.deepEqual(await runSellerOutreachCycle(env, MONDAY_10AM_JST), { action: 'skipped', reason: 'not_configured' });
  const ready = databaseEnv();
  assert.equal(outreachReadiness(ready.env).ok, true);
  assert.deepEqual(await runSellerOutreachCycle(ready.env, new Date('2026-09-06T01:00:00Z')), { action: 'skipped', reason: 'outside_business_hours' });
});

test('QUEUED を送って SENT にする。禁止表現の行は送らず SKIPPED', async () => {
  const { db, env } = databaseEnv();
  await insertContact(db);
  await insertContact(db, { contact_id: 'c2', contact_email: 'bad@example.com',
    body: '掲載すれば必ず売れます。', unsubscribe_token: 'c'.repeat(32) });
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 }); };
  const result = await runSellerOutreachCycle(env, MONDAY_10AM_JST, fetchImpl);
  assert.equal(result.action, 'processed');
  assert.equal(sent.length, 1, '禁止表現の行は送らない');
  assert.equal(sent[0].body.to[0], 'shop@example.com');
  assert.match(sent[0].body.from, /^HOSHILU Seller担当 <sellers@auth\.hoshilu\.app>$/u);
  assert.equal(sent[0].body.reply_to, 'owner@example.com');
  assert.match(sent[0].body.headers['List-Unsubscribe'], /^<https:\/\/hoshilu\.app\/seller-outreach\/unsubscribe\?t=a{32}>$/u);
  assert.equal(db.prepare(`SELECT status,resend_id FROM seller_outreach_contacts WHERE contact_id='c1'`).get().status, 'SENT');
  assert.equal(db.prepare(`SELECT resend_id FROM seller_outreach_contacts WHERE contact_id='c1'`).get().resend_id, 'resend-1');
  const skipped = db.prepare(`SELECT status,last_error FROM seller_outreach_contacts WHERE contact_id='c2'`).get();
  assert.equal(skipped.status, 'SKIPPED');
  assert.match(skipped.last_error, /forbidden_phrase:必ず売れ/u);
});

test('同じアドレスへは2回目を送らない。1サイクル・1日の上限を守る', async () => {
  const { db, env } = databaseEnv();
  await insertContact(db, { contact_id: 'sent-1', status: 'SENT', sent_at: '2026-09-07T00:30:00.000Z' });
  await insertContact(db, { contact_id: 'again', unsubscribe_token: 'd'.repeat(32) });
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  await runSellerOutreachCycle(env, MONDAY_10AM_JST, fetchImpl);
  assert.equal(sent.length, 0, '同一アドレスは生涯1回だけ');
  assert.equal(db.prepare(`SELECT status FROM seller_outreach_contacts WHERE contact_id='again'`).get().status, 'QUEUED');

  const many = databaseEnv();
  for (let i = 0; i < 5; i += 1) {
    await insertContact(many.db, { contact_id: `m${i}`, contact_email: `m${i}@example.com`, unsubscribe_token: String(i).repeat(32) });
  }
  const posts = [];
  const okFetch = async (url, init) => { posts.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  await runSellerOutreachCycle(many.env, MONDAY_10AM_JST, okFetch);
  assert.equal(posts.length, OUTREACH_PER_CYCLE_LIMIT, '1サイクル3通まで');

  const capped = databaseEnv({ SELLER_OUTREACH_DAILY_LIMIT: '2' });
  await insertContact(capped.db, { contact_id: 'x1', status: 'SENT', sent_at: '2026-09-07T00:10:00.000Z' });
  await insertContact(capped.db, { contact_id: 'x2', contact_email: 'x2@example.com', status: 'SENT', sent_at: '2026-09-07T00:20:00.000Z', unsubscribe_token: 'e'.repeat(32) });
  await insertContact(capped.db, { contact_id: 'x3', contact_email: 'x3@example.com', unsubscribe_token: 'f'.repeat(32) });
  assert.deepEqual((await runSellerOutreachCycle(capped.env, MONDAY_10AM_JST, okFetch)), { action: 'skipped', reason: 'daily_limit', sent_today: 2 });
});

test('Resend が失敗したら FAILED として理由を残す（他の行は止めない）', async () => {
  const { db, env } = databaseEnv();
  await insertContact(db);
  const fetchImpl = async () => new Response('{}', { status: 422 });
  await runSellerOutreachCycle(env, MONDAY_10AM_JST, fetchImpl);
  const row = db.prepare(`SELECT status,last_error FROM seller_outreach_contacts WHERE contact_id='c1'`).get();
  assert.equal(row.status, 'FAILED');
  assert.equal(row.last_error, 'resend_http_422');
});

test('配信停止リンクは OPTED_OUT にして、以後そのアドレスへ送らない', async () => {
  const { db, env } = databaseEnv();
  await insertContact(db);
  const response = await handleSellerOutreachRoutes(new Request(`https://hoshilu.app/seller-outreach/unsubscribe?t=${'a'.repeat(32)}`), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /配信停止を受け付けました/u);
  assert.equal(db.prepare(`SELECT status FROM seller_outreach_contacts WHERE contact_id='c1'`).get().status, 'OPTED_OUT');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seller_outreach_suppressions').get().n, 1);
  // 同じアドレスで新しい行を積んでも送らない
  await insertContact(db, { contact_id: 'later', unsubscribe_token: '9'.repeat(32) });
  const sent = [];
  await runSellerOutreachCycle(env, MONDAY_10AM_JST, async (url, init) => { sent.push(init); return new Response('{}', { status: 200 }); });
  assert.equal(sent.length, 0);
  const bad = await handleSellerOutreachRoutes(new Request('https://hoshilu.app/seller-outreach/unsubscribe?t=zzz'), env);
  assert.equal(bad.status, 404);
  assert.equal(await handleSellerOutreachRoutes(new Request('https://hoshilu.app/'), env), null);
});

test('Workerに配線されている（配信停止ルートと15分cron）', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /import \{ handleSellerOutreachRoutes, outreachReadiness, runSellerOutreachCycle \} from '\.\/seller-outreach\.mjs';/u);
  assert.match(index, /const sellerOutreachResponse = await handleSellerOutreachRoutes\(request, env\);/u);
  assert.match(index, /runSellerOutreachCycle\(env, scheduledAt\),/u);
});

test('/health にセラー営業メールの送信可否を出す', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /seller_outreach: outreachReadiness\(env\)\.ok/u);
  assert.match(index, /import \{ handleSellerOutreachRoutes, outreachReadiness, runSellerOutreachCycle \}/u);
});
