import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSellerBusinessInquiry, handleSellerBusinessInquiryRoutes,
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
