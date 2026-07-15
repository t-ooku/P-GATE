import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import fs from 'node:fs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const workerModule = await import('../src/index.mjs');
const {
  verifyLineSignature, createTrackToken, verifyTrackToken,
  isAllowedDestination, candidateDestination, buildReplyMessages, validateKnowledgeRequest, sanitizePublicCandidate,
  getEnvironmentReadiness
} = workerModule;

async function lineSignature(body, secret) {
  return cryptoModule.createHmac('sha256', secret).update(body).digest('base64');
}

test('LINE署名は正しい本文だけを許可する', async () => {
  const body = JSON.stringify({ events: [] });
  const signature = await lineSignature(body, 'secret');
  assert.equal(await verifyLineSignature(body, signature, 'secret'), true);
  assert.equal(await verifyLineSignature(`${body} `, signature, 'secret'), false);
  assert.equal(await verifyLineSignature(body, signature, 'wrong'), false);
  assert.equal(await verifyLineSignature(body, 'not-valid-base64%%%', 'secret'), false);
});

test('追跡トークンは改ざんと期限切れを拒否する', async () => {
  const token = await createTrackToken({ exp: 2000, d: 'https://www.amazon.co.jp/dp/B000000001' }, 'secret');
  const payload = await verifyTrackToken(token, 'secret', 1000);
  assert.equal(payload.exp, 2000);
  await assert.rejects(() => verifyTrackToken(`${token}x`, 'secret', 1000), /SIGNATURE|FORMAT/);
  await assert.rejects(() => verifyTrackToken(token, 'secret', 3000), /EXPIRED/);
});

test('送客先は許可した複数ECのHTTPSドメインだけ', () => {
  assert.equal(isAllowedDestination('https://www.amazon.co.jp/dp/B000000001'), true);
  assert.equal(isAllowedDestination('https://amazon.com/dp/B000000001'), true);
  assert.equal(isAllowedDestination('https://item.rakuten.co.jp/shop/item-1'), true);
  assert.equal(isAllowedDestination('https://store.shopping.yahoo.co.jp/shop/item-1.html'), true);
  assert.equal(isAllowedDestination('http://amazon.co.jp/dp/B000000001'), false);
  assert.equal(isAllowedDestination('https://amazon.co.jp.evil.example/item'), false);
  assert.equal(isAllowedDestination('https://rakuten.co.jp.evil.example/item'), false);
  assert.equal(isAllowedDestination('https://user:pass@item.rakuten.co.jp/item'), false);
});

test('承認済み複数EC購入先を従来Amazon URLより優先する', () => {
  const selected = candidateDestination({
    amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000001',
    offers: [
      { marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item-1', stock_status: 'IN_STOCK' }
    ]
  });
  assert.equal(selected.offer.marketplace, 'RAKUTEN_JP');
  assert.equal(selected.url, 'https://item.rakuten.co.jp/shop/item-1');
});

test('LINE返信は説明1件と商品最大3件', async () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    rank: index + 1, asin: `B00000000${index + 1}`,
    display_name: `商品${index + 1}`,
    amazon_jp_url: `https://www.amazon.co.jp/dp/B00000000${index + 1}`
  }));
  const messages = await buildReplyMessages(
    { message: '候補です', query_id: 'q1', candidates }, 'https://line.example',
    { LINK_SIGNING_SECRET: 'secret' },
    { webhookEventId: 'w1', source: { userId: 'U123' } }
  );
  assert.equal(messages.length, 4);
  assert.equal(messages[0].text, '候補です');
  assert.match(messages[1].text, /\/go\?token=/);
});

test('PWA公開質問は同意・文字数・匿名セッション・Turnstileを必須にする', () => {
  const valid = validateKnowledgeRequest({
    query: ' breakfast cereal ', consent: true,
    session_id: 'abcdef0123456789abcdef0123456789', turnstile_token: 'verified-token'
  });
  assert.equal(valid.query, 'breakfast cereal');
  assert.throws(() => validateKnowledgeRequest({ ...valid, consent: false }), /CONSENT_REQUIRED/);
  assert.throws(() => validateKnowledgeRequest({ ...valid, query: 'x' }), /QUERY_LENGTH_INVALID/);
  assert.throws(() => validateKnowledgeRequest({ ...valid, session_id: 'email@example.com' }), /SESSION_ID_INVALID/);
  assert.throws(() => validateKnowledgeRequest({ ...valid, turnstile_token: '' }), /TURNSTILE_TOKEN_INVALID/);
});

test('PWAはインストール可能なmanifestとオフラインshellを持つ', () => {
  const publicDir = new URL('../public/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', publicDir), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.some((icon) => icon.sizes === '192x192'), true);
  assert.equal(manifest.icons.some((icon) => icon.sizes === '512x512'), true);
  const app = fs.readFileSync(new URL('app.js', publicDir), 'utf8');
  assert.equal(/innerHTML/.test(app), false);
  ['JA', 'EN', 'ZH', 'KO'].forEach((language) => assert.match(app, new RegExp(`${language}:`)));
  ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP'].forEach((marketplace) => assert.match(app, new RegExp(marketplace)));
  assert.match(app, /candidate\.selected_offer/);
});

test('PWA公開回答は内部SKU・在庫数・元URL・取込証跡を除外する', () => {
  const result = sanitizePublicCandidate({
    asin: 'B000000001', sku: 'INTERNAL-SKU', stock: 17,
    amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000001',
    offers: [{ marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item', seller_name: '非公開店舗', external_product_id: 'secret', price: 1000, shipping_fee: 200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK', delivery_days: 2 }],
    evidence: { matched_terms: ['朝食'], information_score: 90, source_hash: 'secret-hash', imported_at: 'now' }
  });
  assert.equal(result.asin, 'B000000001');
  assert.equal(result.available, true);
  assert.equal('sku' in result, false);
  assert.equal('stock' in result, false);
  assert.equal('amazon_jp_url' in result, false);
  assert.equal(result.offers[0].total_cost, 1200);
  assert.equal('product_url' in result.offers[0], false);
  assert.equal('seller_name' in result.offers[0], false);
  assert.equal('external_product_id' in result.offers[0], false);
  assert.equal('source_hash' in result.evidence, false);
});

test('PWAは最大3購入先を個別の署名付きURLへ変換し元URLを返さない', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const gasResult = {
    query_id: 'q-multi', candidates: [{
      asin: 'B000000001', offers: [
        { marketplace: 'AMAZON_JP', product_url: 'https://amazon.co.jp/dp/B000000001', price: 1200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' },
        { marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item', price: 1000, shipping_fee: 200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' },
        { marketplace: 'YAHOO_JP', product_url: 'https://shopping.yahoo.co.jp/products/item', price: 1100, shipping_fee: 100, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' }
      ]
    }]
  };
  const decorated = await workerModule.decoratePwaResultForTest(gasResult, new Request('https://p-gate.example/api/knowledge'), env, 'session-hash');
  assert.equal(decorated.candidates[0].offers.length, 3);
  decorated.candidates[0].offers.forEach((offer) => {
    assert.match(offer.tracking_url, /^https:\/\/p-gate\.example\/go\?token=/);
    assert.equal('product_url' in offer, false);
  });
});

test('PWA公開設定はSite Keyだけを返し、無効な質問をAPI境界で拒否する', async () => {
  const ctx = { waitUntil() {} };
  const configResponse = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/config'),
    { TURNSTILE_SITE_KEY: 'public-site-key', TURNSTILE_SECRET_KEY: 'must-not-leak' }, ctx
  );
  const config = await configResponse.json();
  assert.deepEqual(config, { turnstile_site_key: 'public-site-key' });
  assert.equal(JSON.stringify(config).includes('must-not-leak'), false);

  const invalidResponse = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/knowledge', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://p-gate.example' },
      body: JSON.stringify({ query: 'x', consent: false, session_id: 'bad', turnstile_token: '' })
    }), {}, ctx
  );
  assert.equal(invalidResponse.status, 400);
});

test('公開前ヘルスチェックはSecret値を返さず不足・弱い鍵・LINE片側設定を検出する', async () => {
  const base = {
    GAS_BACKEND_URL: 'https://script.google.com/macros/s/example/exec',
    GAS_BRIDGE_SECRET: 'g'.repeat(32), LINK_SIGNING_SECRET: 'l'.repeat(32),
    TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'turnstile-secret'
  };
  assert.equal(getEnvironmentReadiness(base).ready, true);
  assert.equal(getEnvironmentReadiness({ ...base, GAS_BACKEND_URL: 'http://example.com' }).ready, false);
  assert.deepEqual(getEnvironmentReadiness({ ...base, LINK_SIGNING_SECRET: 'short' }).weak, ['LINK_SIGNING_SECRET']);
  assert.equal(getEnvironmentReadiness({ ...base, LINE_CHANNEL_SECRET: 'only-one-side' }).checks.line_partial, true);

  const ctx = { waitUntil() {} };
  const response = await workerModule.default.fetch(
    new Request('https://p-gate.example/health'), base, ctx
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.release, '1.14.0');
  assert.equal(JSON.stringify(payload).includes(base.GAS_BRIDGE_SECRET), false);
  assert.equal(JSON.stringify(payload).includes(base.TURNSTILE_SECRET_KEY), false);
});

test('公開設定はTurnstile Site Key未設定時に503を返す', async () => {
  const response = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/config'), {}, { waitUntil() {} }
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { turnstile_site_key: '' });
});
