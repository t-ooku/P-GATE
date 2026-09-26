import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  OUTREACH_PER_CYCLE_LIMIT, OUTREACH_REQUIRED_SENTENCES, OUTREACH_SUBJECT, composeOutreachText, emailHash, findForbiddenPhrases, findMissingTemplateSentences,
  handleSellerOutreachRoutes, jstBusinessHours, jstDayRange, newUnsubscribeToken,
  outreachReadiness, runSellerOutreachCycle, unsubscribeUrl
} from '../src/seller-outreach.mjs';

// 本番で実際に送られている型（2026-09-24 短い版）。hook の1文だけを会社ごとに変える。
const GOOD_BODY = (shop, hook) => `${shop} ご担当者様

突然のご連絡失礼いたします。買い物検索サービス HOSHILU（ホシル）の大久津です。楽天商品情報ページに記載の連絡先へお送りしています。

${hook}

HOSHILU は Amazon・楽天・Yahoo!ショッピング・Qoo10 をまとめて探せるサービスです。御社の商品も、同じ検索結果に並べることができます。

ショップページの作成と商品の登録はこちらで代行します。今のモール出店はそのままで構いません。

最初の3か月は無料です。その後も続ける場合のみ月額4,980円（税込）で、いつでも解約できます。

ご興味があれば、このメールに「興味あり」とひと言だけご返信ください。こちらから詳しくご案内いたします。`;

function databaseEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0072_seller_outreach.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0087_seller_contact_permissions.sql', import.meta.url), 'utf8'));
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
    body: GOOD_BODY('テスト商店', 'テスト用の1文です。'),
    status: 'QUEUED', scheduled_at: '2026-09-07T00:00:00.000Z', unsubscribe_token: 'a'.repeat(32),
    sent_at: '', created_at: '2026-09-06T00:00:00.000Z', updated_at: '2026-09-06T00:00:00.000Z', ...overrides };
  db.prepare(`INSERT INTO seller_outreach_contacts (contact_id,shop_name,contact_email,email_hash,subject,body,status,scheduled_at,sent_at,unsubscribe_token,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.contact_id, row.shop_name, row.contact_email, row.email_hash,
    row.subject, row.body, row.status, row.scheduled_at, row.sent_at, row.unsubscribe_token, row.created_at, row.updated_at);
  if (overrides.consent !== false) db.prepare(`INSERT OR IGNORE INTO seller_contact_permissions VALUES (?,'SELLER_MARKETING','2026-09-01T00:00:00Z','fixture:explicit-opt-in','test-operator','')`).run(row.email_hash);
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
  assert.match(text, /HOSHILU（ホシル） 運営: 大久津/u);
  assert.match(text, /https:\/\/hoshilu\.app\/for-sellers\?utm_source=seller_outreach&utm_medium=email&utm_campaign=initial_outreach/u);
  assert.match(text, /owner@example\.com/u);
  assert.ok(text.includes(unsubscribeUrl(token)), '配信停止リンク');
  assert.match(text, /セラー向け案内に同意いただいた方へお送りしています/u);
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
  assert.match(sent[0].body.headers['List-Unsubscribe'], /^<https:\/\/hoshilu\.app\/seller-outreach\/unsubscribe\/a{32}>$/u);
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
  const response = await handleSellerOutreachRoutes(new Request(`https://hoshilu.app/seller-outreach/unsubscribe/${'a'.repeat(32)}`), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /配信停止を受け付けました/u);
  assert.equal(db.prepare(`SELECT status FROM seller_outreach_contacts WHERE contact_id='c1'`).get().status, 'OPTED_OUT');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seller_outreach_suppressions').get().n, 1);
  // 同じアドレスで新しい行を積んでも送らない
  await insertContact(db, { contact_id: 'later', unsubscribe_token: '9'.repeat(32) });
  const sent = [];
  await runSellerOutreachCycle(env, MONDAY_10AM_JST, async (url, init) => { sent.push(init); return new Response('{}', { status: 200 }); });
  assert.equal(sent.length, 0);
  // 配信停止リンクを踏んだ人に404を見せない（案内ページとして200で返す）。
  const bad = await handleSellerOutreachRoutes(new Request('https://hoshilu.app/seller-outreach/unsubscribe/zzz'), env);
  assert.equal(bad.status, 200);
  assert.match(await bad.text(), /リンクが無効です/u);
  assert.match(await (await handleSellerOutreachRoutes(new Request('https://hoshilu.app/seller-outreach/unsubscribe/zzz'), env)).text(), /<!-- unsubscribe: token_format -->/u);
  const unknown = await handleSellerOutreachRoutes(new Request(`https://hoshilu.app/seller-outreach/unsubscribe/${'0'.repeat(32)}`), env);
  assert.equal(unknown.status, 200);
  assert.match(await unknown.text(), /<!-- unsubscribe: not_found len=32 -->/u);
  assert.equal(await handleSellerOutreachRoutes(new Request('https://hoshilu.app/'), env), null);
});

// 2026-09-06: 本番で ?t= だけが経路で除去され、配信停止が常に「リンクが無効」になっていた
//（?debug=1 は届くのに ?t= は届かない）。トークンはパスに置く。旧形式のリンクも受ける。
test('配信停止トークンはパスで受け取り、旧クエリ形式も受ける', async () => {
  const { db, env } = databaseEnv();
  await insertContact(db);
  assert.match(unsubscribeUrl('a'.repeat(32)), /\/seller-outreach\/unsubscribe\/a{32}$/u);
  const legacy = await handleSellerOutreachRoutes(new Request(`https://hoshilu.app/seller-outreach/unsubscribe?t=${'a'.repeat(32)}`), env);
  assert.match(await legacy.text(), /配信停止を受け付けました/u);
  await insertContact(db, { contact_id: 'c2', contact_email: 'c2@example.com', unsubscribe_token: 'b'.repeat(32) });
  const named = await handleSellerOutreachRoutes(new Request(`https://hoshilu.app/seller-outreach/unsubscribe?token=${'b'.repeat(32)}`), env);
  assert.match(await named.text(), /配信停止を受け付けました/u);
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

test('2026-09-14 事故: 型の文が一字一句そのまま無い本文（誤字・文字化け）は送らず SKIPPED', async () => {
  assert.deepEqual(findMissingTemplateSentences(GOOD_BODY('良い商店', '雑貨を取り扱っている貴店と相性が良いと思い、ご連絡しました。')), []);
  assert.ok(OUTREACH_REQUIRED_SENTENCES.length >= 7);
  const garbled = GOOD_BODY('誤字商店', 'x').replace('突然のご連絡失礼いたします', '弁然のご連絡失箰いたします').replace('代行します', '代行しまず');
  assert.deepEqual(findMissingTemplateSentences(garbled), [
    '突然のご連絡失礼いたします。買い物検索サービス HOSHILU（ホシル）の大久津です。',
    'ショップページの作成と商品の登録はこちらで代行します。今のモール出店はそのままで構いません。'
  ]);
  const { db, env } = databaseEnv();
  await insertContact(db, { contact_id: 'g1', contact_email: 'g1@example.com', body: garbled, unsubscribe_token: 'g'.repeat(32) });
  await insertContact(db, { contact_id: 'g2', contact_email: 'g2@example.com', body: GOOD_BODY('良い商店', 'ok'), unsubscribe_token: 'h'.repeat(32) });
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'r' }), { status: 200 }); };
  await runSellerOutreachCycle(env, MONDAY_10AM_JST, fetchImpl);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0], 'g2@example.com');
  const skipped = db.prepare(`SELECT status,last_error FROM seller_outreach_contacts WHERE contact_id='g1'`).get();
  assert.equal(skipped.status, 'SKIPPED');
  assert.match(skipped.last_error, /^template_mismatch:突然のご連絡失礼いたします/u);
});

// 2026-09-23 大隆さん指示「営業メールを1日30社に増やして」。
// 本番の上限は wrangler.jsonc の vars で持つ（コードの既定10は据え置き）。
// 平日09:00〜18:00 JST・1サイクル3通のままなので、30通は10サイクルに分かれて出る。
test('本番の1日の送信上限は50通（コード側の頭打ちと同じ。窓と1サイクルの本数は変えない）', () => {
  const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(wrangler.vars.SELLER_OUTREACH_DAILY_LIMIT, '50');
  assert.equal(OUTREACH_PER_CYCLE_LIMIT, 3);
  // 09:00〜18:00 JST を15分ごとに回すと36サイクル。3通ずつなら50通も入りきる。
  assert.ok(36 * OUTREACH_PER_CYCLE_LIMIT >= 50);
  assert.equal(jstBusinessHours(new Date('2026-09-23T00:05:00Z')), true);
  assert.equal(jstBusinessHours(new Date('2026-09-23T09:05:00Z')), false);
});

// 2026-09-23 大隆さん指示「RIZAPグループ株式会社のグループ企業や店舗には絶対送らない」。
// 選定は人と AI の両方がやるので、送る直前にも機械で止める。
test('送らないと決めた相手は、送信直前に止めて理由を残す', async () => {
  const { findExcludedOrganization } = await import('../src/seller-outreach.mjs');
  assert.equal(findExcludedOrganization('RIZAP株式会社', 'info@example.com'), 'RIZAP');
  assert.equal(findExcludedOrganization('chocoZAP 出店', 'shop@chocozap.jp'), 'chocozap.jp');
  assert.equal(findExcludedOrganization('夢展望株式会社', 'a@example.com'), '夢展望');
  // 無関係の店を巻き込まない（ブランド名としての言及だけでは止めない）
  assert.equal(findExcludedOrganization('帽子専門店 冠屋', 'info@kanmuriya.com'), '');
  assert.equal(findExcludedOrganization('雑貨店', 'info@example.jp', 'BRUNO のホットプレートを扱っています'), '');

  const { env: e, db } = databaseEnv();
  await insertContact(db, { contact_id: 'rz1', shop_name: 'RIZAP株式会社', contact_email: 'rz1@example.com', unsubscribe_token: 'a'.repeat(32) });
  const posts = [];
  const okFetch = async (url, init) => { posts.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  await runSellerOutreachCycle(e, MONDAY_10AM_JST, okFetch);
  assert.equal(posts.length, 0, '送らない');
  const row = db.prepare('SELECT status,last_error FROM seller_outreach_contacts WHERE contact_id=?').get('rz1');
  assert.equal(row.status, 'SKIPPED');
  assert.match(row.last_error, /^excluded_organization:RIZAP$/u);
});

// 2026-09-23 大隆さん追加指示「その孫会社とかもあるからそれも全てng」
// 「とにかくRIZAPグループ株式会社の連結会社は全てng」。
// 親会社の名前が出ない相手（孫会社・ブランド名・店舗名）が本題なので、そこを名指しで確かめる。
test('RIZAPグループの孫会社・ブランド名・店舗名も送らない', async () => {
  const { findExcludedOrganization } = await import('../src/seller-outreach.mjs');
  // 孫会社（親会社の名前がどこにも出ない）
  assert.equal(findExcludedOrganization('マルコ株式会社', 'info@example.com'), 'マルコ株式会社');
  assert.equal(findExcludedOrganization('株式会社ALTIQS', 'a@example.com'), '株式会社ALTIQS');
  assert.equal(findExcludedOrganization('新星堂WonderGOO楽天市場店', 'a@example.com'), 'WonderGOO');
  assert.equal(findExcludedOrganization('エムシーツー株式会社', 'a@example.com'), 'エムシーツー株式会社');
  // ブランド名・自社ドメインだけで分かる相手
  assert.equal(findExcludedOrganization('雑貨店', 'info@bruno-onlineshop.com'), 'bruno-onlineshop.com');
  assert.equal(findExcludedOrganization('通販', 'a@example.com', '出典 https://dreamvs.jp/shop/pages/brand.aspx'), 'dreamvs.jp');
  assert.equal(findExcludedOrganization('MILESTO 公式', 'a@example.com'), 'MILESTO');
  assert.equal(findExcludedOrganization('Auntie Rosa Holiday', 'a@shop-arholiday.jp'), 'shop-arholiday.jp');
  // 資本が抜けたばかりの相手も送らない
  assert.equal(findExcludedOrganization('堀田丸正株式会社', 'a@example.com'), '堀田丸正');

  // ドメインは前後の切れ目を見る（似た綴りの無関係な店を巻き込まない）
  assert.equal(findExcludedOrganization('時計店 きっしん', 'info@kisshin.com'), '');
  assert.equal(findExcludedOrganization('一新時計', 'info@isshin.com'), 'isshin.com');
  assert.equal(findExcludedOrganization('雑貨店', 'info@xdreamvs.jp'), '');
  // 一般語は入れていない（無関係の店を止めない）
  assert.equal(findExcludedOrganization('株式会社フォー', 'info@four-you.example.com'), '');
  assert.equal(findExcludedOrganization('ミセル雑貨', 'info@misel-zakka.example.jp'), '');
});

// 2026-09-23 大隆さん指示「ITグループ株式会社の関連企業もね」。
// 主グループ企業は SDエンターテイメント・エムシーツー・株式会社フォーユー・合同会社TAISETSU
// （https://it-group.jp/company/ 2026-09-23 確認）。施設名「リバイブ」は一般語なので入れず、
// ドメインで当てる。
test('ITグループ株式会社の関連企業も送らない', async () => {
  const { findExcludedOrganization } = await import('../src/seller-outreach.mjs');
  assert.equal(findExcludedOrganization('ITグループ株式会社', 'a@example.com'), 'ITグループ株式会社');
  assert.equal(findExcludedOrganization('合同会社TAISETSU', 'a@example.com'), '合同会社TAISETSU');
  assert.equal(findExcludedOrganization('カメリアキッズ', 'a@example.com'), 'カメリアキッズ');
  assert.equal(findExcludedOrganization('就労支援事業所', 'info@revive-support.jp'), 'revive-support.jp');
  assert.equal(findExcludedOrganization('保育園', 'a@example.com', '出典 https://it-group.jp/company/'), 'it-group.jp');
  // 一般語は入れない（同名の無関係な店を止めない）
  assert.equal(findExcludedOrganization('リバイブ 中古品店', 'info@revive-used.example.jp'), '');
});

// 2026-09-23 大隆さん指示「ちゃんと参入したくなる内容でよろしくね」。
// 「何ができるか」だけでなく「始めるのに何を失うか」に先に答える型にした。
// 2026-09-24 大隆さん「短い版で出し直す」。135通送って返信0だったので、950字から短くした。
// 残すのは「手間が要らない」「今の出店と競合しない」「試すのにお金がかからない」「抜けられる」
// 「どう返せばいいか」の5つだけ。機能の説明・掲載順の方針は、返信があってから伝える。
test('営業メールの型は短く、始める側の不安に先に答え、返し方まで書く', () => {
  const text = OUTREACH_REQUIRED_SENTENCES.join('\n');
  assert.match(text, /こちらで代行します/u, '手間が要らないこと');
  assert.match(text, /今のモール出店はそのままで構いません/u, '今の出店と競合しないこと');
  assert.match(text, /最初の3か月は無料です/u, '試すのにお金がかからないこと');
  assert.match(text, /いつでも解約できます/u, '抜けられること');
  assert.match(text, /「興味あり」とひと言だけご返信ください/u, '返信のハードルを下げる');
  assert.doesNotMatch(text, /クリック/u, '2026-09-21 に廃止したクリック課金を書かない');
  assert.doesNotMatch(text, /ユーザー数|人以上/u, '人数には触れない');
  assert.deepEqual(findForbiddenPhrases(text), [], '成果を約束しない');
  // 短いこと。hook と連絡先の出典を入れても、フッター抜きで500字に収まる
  const body = GOOD_BODY('株式会社サンプル商店（サンプルストア）', '日用品を「素材・サイズ・用途」で探している方に、条件が合った時にだけ見つけてもらえます。');
  assert.ok(body.length < 500, `本文が長すぎる: ${body.length}字`);
  assert.equal(OUTREACH_SUBJECT, '商品掲載のご相談｜HOSHILU（ホシル）');
});


test('許諾証跡がない営業だけSKIPPEDにして残し、Resendを呼ばない', async () => {
  const {db,env}=databaseEnv();
  await insertContact(db,{consent:false});
  await runSellerOutreachCycle(env,MONDAY_10AM_JST,()=>{throw new Error('must not send');});
  assert.deepEqual({...db.prepare('SELECT status,last_error FROM seller_outreach_contacts').get()}, {status:'SKIPPED',last_error:'consent_unverified'});
});
test('許諾テーブル未適用・撤回済みは送信しない', async () => {
  for (const drop of [true,false]) {
    const {db,env}=databaseEnv(); await insertContact(db);
    if(drop) db.exec('DROP TABLE seller_contact_permissions');
    else db.exec("UPDATE seller_contact_permissions SET revoked_at='2026-09-06T00:00:00Z'");
    let sent=0; await runSellerOutreachCycle(env,MONDAY_10AM_JST,()=>{sent++;throw Error();});
    assert.equal(sent,0);
    assert.equal(db.prepare('SELECT status FROM seller_outreach_contacts').get().status,'SKIPPED');
  }
});
test('返信先が未設定・不正なら営業送信経路は起動しない', () => {
  const {env}=databaseEnv({SELLER_OUTREACH_REPLY_TO:''});
  assert.equal(outreachReadiness(env).ok,false);
});
