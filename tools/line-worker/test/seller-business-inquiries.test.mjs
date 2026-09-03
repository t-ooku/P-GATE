import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSellerBusinessInquiry, fallbackInquiryAllowed, handleSellerBusinessInquiryRoutes,
  normalizeSellerBusinessInquiry } from '../src/seller-business-inquiries.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0058_seller_business_inquiries.sql', import.meta.url), 'utf8'));
  return { db, env: { TURNSTILE_VERIFY: async token => token === 'test-token', PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; }, async run() { statement.run(...values); return { success: true }; },
      async all() { return { results: statement.all(...values) }; } }; } } } };
}

const valid = { inquiry_type: 'ACCOUNT_APPLICATION', organization_type: 'MAKER',
  organization_name: '星商事株式会社', contact_name: '星 太郎', contact_email: 'sales@example.com',
  storefront_url: 'https://example.com/store', marketplaces: ['AMAZON', 'YAHOO', 'UNKNOWN'],
  monthly_order_range: '50_199', plan_interest: 'BUSINESS', payment_preference: 'INVOICE',
  message: '掲載と分析について相談したいです。', privacy_consent: true };

test('メーカー・セラー問い合わせは必要項目だけを正規化しSecretを要求しない', () => {
  const result = normalizeSellerBusinessInquiry(valid);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value.marketplaces, ['AMAZON', 'YAHOO']);
  assert.equal(result.value.contact_email, 'sales@example.com');
  assert.equal('password' in result.value, false);
  assert.equal('api_key' in result.value, false);
});

test('同意なし・不正URL・不正メールの問い合わせを拒否する', () => {
  const result = normalizeSellerBusinessInquiry({ ...valid, privacy_consent: false,
    contact_email: 'invalid', storefront_url: 'http://example.com' });
  assert.deepEqual(result.errors, ['CONTACT_EMAIL_INVALID', 'STOREFRONT_URL_INVALID', 'PRIVACY_CONSENT_REQUIRED']);
});

test('有効な登録申請をD1へNEWとして保存する', async () => {
  const { db, env } = databaseEnv();
  const result = await createSellerBusinessInquiry(env, valid, new Date('2026-08-21T00:00:00Z'));
  assert.equal(result.accepted, true);
  const row = db.prepare('SELECT * FROM seller_business_inquiries').get();
  assert.equal(row.status, 'NEW');
  assert.equal(row.organization_name, '星商事株式会社');
  assert.equal(row.created_at, '2026-08-21T00:00:00.000Z');
});

test('公開問い合わせAPIは同一Originだけを受け付ける', async () => {
  const { env } = databaseEnv();
  const blocked = await handleSellerBusinessInquiryRoutes(new Request('https://hoshilu.app/api/seller-business/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ ...valid, turnstile_token: 'test-token' })
  }), env);
  assert.equal(blocked.status, 403);
  const accepted = await handleSellerBusinessInquiryRoutes(new Request('https://hoshilu.app/api/seller-business/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' }, body: JSON.stringify({ ...valid, turnstile_token: 'test-token' })
  }), env);
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).status, 'RECEIVED');
});

test('公開LPは相談・登録・支払い準備を明示し機密情報を要求しない', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(html, /相談・登録申請/u);
  assert.match(html, /カード・銀行振込・請求書払い/u);
  assert.match(html, /フォーム送信だけで課金されることはありません/u);
  assert.match(html, /月額9,800円/u);
  assert.match(html, /1法人単位ではなく、1事業者アカウント単位/u);
  assert.match(html, /ファッション<\/td><td>25円/u);
  assert.match(html, /コスメ<\/td><td>38円/u);
  assert.doesNotMatch(html, /name="(?:password|api_key|secret|access_token)"/iu);
});

test('公開LPはスマホで見出しを3行以上に崩さず余白を圧縮する', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/for-sellers-pricing.css', import.meta.url), 'utf8');
  assert.match(css, /\.hero h1,\.hero h1 span\{white-space:nowrap\}/u);
  assert.match(css, /\.hero\{min-height:auto;padding:36px 4px 42px\}/u);
  assert.match(css, /\.values\{gap:10px;margin-bottom:38px\}/u);
  assert.match(css, /\.form-shell\{margin:38px 0/u);
  assert.match(css, /\.flow h2\{[^}]*white-space:nowrap/u);
  assert.match(css, /\.price-table-wrap table\{min-width:0;table-layout:fixed\}/u);
  assert.match(html, /Businessあり/u);
  assert.match(html, /Businessなし/u);
});

test('値下げ待ちと見つからなかった検索を匿名需要としてBusinessへ届ける', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(html, /値下げ通知に登録された商品条件/u);
  assert.match(html, /見つからなかった需要/u);
  assert.match(html, /仕入れ・商品開発・価格判断/u);
  assert.match(html, /検索文そのものや個人情報は共有しません/u);
  assert.match(html, /匿名需要が5件以上/u);
});

// 2026-09-03 セラー獲得の運用開始: これまで問い合わせはD1に入るだけで通知が
// 無く、管理APIを人が見に行かない限り気づけなかった。届いた時点でメールを
// 1通送る。通知に失敗しても問い合わせ自体は必ず受け付ける。
test('セラー問い合わせは届いた時点で通知メールを送る', async () => {
  const { env } = databaseEnv();
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{}', { status: 200 });
  };
  try {
    const result = await createSellerBusinessInquiry({
      ...env, RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app',
      SELLER_INQUIRY_NOTIFY_EMAIL: 'owner@example.com'
    }, valid, new Date('2026-09-03T00:00:00Z'));
    assert.equal(result.accepted, true);
    assert.equal(result.notified, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails');
    assert.deepEqual(sent[0].body.to, ['owner@example.com']);
    // そのまま返信できるようにする(対応は手作業のため)。
    assert.equal(sent[0].body.reply_to, 'sales@example.com');
    assert.match(sent[0].body.subject, /星商事株式会社/u);
    assert.match(sent[0].body.text, /sales@example\.com/u);
    assert.match(sent[0].body.text, /掲載と分析について相談したいです。/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('通知先が未設定でも、通知が失敗しても問い合わせは受け付ける', async () => {
  const { db, env } = databaseEnv();
  const noConfig = await createSellerBusinessInquiry(env, valid, new Date('2026-09-03T00:00:00Z'));
  assert.equal(noConfig.accepted, true);
  assert.equal(noConfig.notified, false);

  const { db: db2, env: env2 } = databaseEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('NETWORK_DOWN'); };
  try {
    const failed = await createSellerBusinessInquiry({
      ...env2, RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app',
      SELLER_INQUIRY_NOTIFY_EMAIL: 'owner@example.com'
    }, valid, new Date('2026-09-03T00:00:00Z'));
    assert.equal(failed.accepted, true, '通知の失敗で見込み客を落とさない');
    assert.equal(failed.notified, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM seller_business_inquiries').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seller_business_inquiries').get().n, 1);
});

// 2026-09-03: 実機(iOS Safari)でTurnstileが読み込めず、フォームを一切送信でき
// なかった。問い合わせ口が塞がる損失の方が大きいので、確認欄を通らない送信も
// 件数を絞って受け付ける。通常の受付とはsourceで区別し、通知の件名にも出す。
test('確認欄を通らない送信も件数を絞って受け付け、sourceで区別する', async () => {
  const { db, env } = databaseEnv();
  const result = await createSellerBusinessInquiry(env, valid, new Date('2026-09-03T00:00:00Z'), { verified: false });
  assert.equal(result.accepted, true);
  assert.equal(result.verified, false);
  const row = db.prepare('SELECT * FROM seller_business_inquiries').get();
  assert.equal(row.source, 'FOR_SELLERS_FALLBACK');
  assert.equal(row.status, 'NEW');

  const verified = await createSellerBusinessInquiry(env, { ...valid, contact_email: 'a@example.com' },
    new Date('2026-09-03T00:00:01Z'));
  assert.equal(verified.verified, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM seller_business_inquiries WHERE source='FOR_SELLERS'").get().n, 1);
});

test('確認欄なしの受付は1時間3件・1日10件で打ち切る', async () => {
  const { env } = databaseEnv();
  const now = new Date('2026-09-03T12:00:00Z');
  assert.equal(await fallbackInquiryAllowed(env, now), true);
  for (let index = 0; index < 3; index += 1) {
    await createSellerBusinessInquiry(env, { ...valid, contact_email: `spam${index}@example.com` },
      new Date(now.getTime() - index * 60_000), { verified: false });
  }
  assert.equal(await fallbackInquiryAllowed(env, now), false, '1時間で3件を超えたら受け付けない');
  // 1時間より前の分は時間枠から外れるが、24時間の上限には残る。
  const later = new Date(now.getTime() + 2 * 3600_000);
  assert.equal(await fallbackInquiryAllowed(env, later), true);
});

test('確認欄を通った受付は件数制限の対象にしない', async () => {
  const { env } = databaseEnv();
  const now = new Date('2026-09-03T12:00:00Z');
  for (let index = 0; index < 12; index += 1) {
    await createSellerBusinessInquiry(env, { ...valid, contact_email: `ok${index}@example.com` },
      new Date(now.getTime() - index * 1000));
  }
  assert.equal(await fallbackInquiryAllowed(env, now), true, '通常の受付で枠を消費してはいけない');
});

test('確認欄が通らなくても公開APIは受け付け、通知の件名に要確認と出す', async () => {
  const { env } = databaseEnv();
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  try {
    const response = await handleSellerBusinessInquiryRoutes(new Request('https://hoshilu.app/api/seller-business/inquiries', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ ...valid, turnstile_token: '' })
    }), { ...env, RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app',
      SELLER_INQUIRY_NOTIFY_EMAIL: 'owner@example.com' });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.verified, false);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /要確認/u);
    assert.match(sent[0].text, /未通過/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
