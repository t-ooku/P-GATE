import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import fs from 'node:fs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const workerModule = await import('../src/index.mjs');
const { rankMerchantCandidates: rankMerchantCandidatesForTest } = await import('../src/knowledge-search.mjs');
const {
  verifyLineSignature, createTrackToken, verifyTrackToken,
  isAllowedDestination, isProductDetailDestination, productMarketplaceOffers, candidateDestination, marketplaceForDestination, buildReplyMessages, validateKnowledgeRequest, sanitizePublicCandidate,
  getEnvironmentReadiness, buildAmazonSearchDestination, buildRakutenSearchDestination,
  buildQoo10SearchDestination, buildQoo10SearchKeywords, buildSheinSearchDestination,
  buildAmazonSearchKeywords, trackingEventsForPayload, rankSellerOffers
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
  assert.equal(isAllowedDestination('https://www.qoo10.jp/s/?keyword=socks'), true);
  assert.equal(isAllowedDestination('https://jp.shein.com/pdsearch/socks/'), true);
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

test('未承認の従来Amazon URLへは送客しない', () => {
  const selected = candidateDestination({ amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000001' });
  assert.equal(selected.url, '');
  assert.equal(selected.offer, null);
});

test('重複ASINの出品先はプラン順、同一プランは先登録順にする', () => {
  const offers = rankSellerOffers([
    { seller_id: 'lite-first', plan: 'lite', registered_at: '2026-01-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=lite' },
    { seller_id: 'pro-later', plan: 'pro', registered_at: '2026-02-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=pro2' },
    { seller_id: 'partner', plan: 'partner', registered_at: '2026-03-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=partner' },
    { seller_id: 'pro-first', plan: 'pro', registered_at: '2026-01-15T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=pro1' },
    { seller_id: 'growth', plan: 'growth', registered_at: '2025-12-01T00:00:00Z', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=growth' }
  ]);
  assert.deepEqual(offers.map((offer) => offer.seller_id), [
    'partner', 'pro-first', 'pro-later', 'growth', 'lite-first'
  ]);
});

test('優先セラーが出品停止または在庫切れなら次順位へ自動繰り上げする', () => {
  const selected = candidateDestination({
    asin: 'B000000001',
    offers: [
      { seller_id: 'partner', plan: 'partner', status: 'INACTIVE', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=partner' },
      { seller_id: 'pro', plan: 'pro', stock_status: 'OUT_OF_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=pro' },
      { seller_id: 'unavailable', plan: 'pro', stock_status: 'UNAVAILABLE', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=unavailable' },
      { seller_id: 'growth', plan: 'growth', active: true, stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=growth' },
      { seller_id: 'lite', plan: 'lite', stock_status: 'IN_STOCK', product_url: 'https://www.amazon.co.jp/dp/B000000001?m=lite' }
    ]
  });
  assert.equal(selected.offer.seller_id, 'growth');
});

test('許可URLからMarketplace計測値を決定する', () => {
  assert.equal(marketplaceForDestination('https://amazon.co.jp/dp/B000000001'), 'AMAZON_JP');
  assert.equal(marketplaceForDestination('https://item.rakuten.co.jp/shop/item'), 'RAKUTEN_JP');
  assert.equal(marketplaceForDestination('https://store.shopping.yahoo.co.jp/shop/item'), 'YAHOO_JP');
  assert.equal(marketplaceForDestination('https://www.qoo10.jp/s/?keyword=socks'), 'QOO10_JP');
  assert.equal(marketplaceForDestination('https://jp.shein.com/pdsearch/socks/'), 'SHEIN_JP');
  assert.equal(marketplaceForDestination('https://evil.example/item'), '');
});

test('Amazon検索フォールバックは個人情報を除いて検索URLを作る', () => {
  const destination = buildAmazonSearchDestination(
    '青い 小型 加湿器 user@example.com 090-1234-5678'
  );
  const url = new URL(destination);
  assert.equal(url.origin, 'https://www.amazon.co.jp');
  assert.equal(url.pathname, '/s');
  assert.match(url.searchParams.get('k'), /humidifier/);
  assert.match(url.searchParams.get('k'), /blue/);
  assert.doesNotMatch(url.searchParams.get('k'), /example|090|5678/);
});

test('楽天・Qoo10・SHEINの公式検索URLへ同じ整理済み条件を渡す', () => {
  const query = '韓国っぽい靴下';
  const rakuten = new URL(buildRakutenSearchDestination(query));
  const qoo10 = new URL(buildQoo10SearchDestination(query));
  const shein = new URL(buildSheinSearchDestination(query));
  assert.equal(rakuten.origin, 'https://search.rakuten.co.jp');
  assert.match(decodeURIComponent(rakuten.pathname), /sock/);
  assert.equal(qoo10.origin, 'https://www.qoo10.jp');
  assert.match(qoo10.searchParams.get('keyword'), /sock/);
  assert.equal(shein.origin, 'https://jp.shein.com');
  assert.match(decodeURIComponent(shein.pathname), /sock/);
});
test('Amazon検索フォールバックに承認済みアソシエイトIDを付ける', () => {
  const destination = buildAmazonSearchDestination('光るスマホケース', 'hoshilu-22');
  const url = new URL(destination);
  assert.equal(url.searchParams.get('tag'), 'hoshilu-22');
  assert.match(url.searchParams.get('k'), /phone/);
});

test('AmazonへはHOSHILUが整理した商品条件を引き継ぐ', () => {
  const keywords = buildAmazonSearchKeywords(
    'SNSで見た blue の小さい table lamp'
  );
  assert.match(keywords, /lamp/);
  assert.match(keywords, /light/);
  assert.match(keywords, /blue/);
  assert.doesNotMatch(keywords, /SNSで見た/);
});

test('カメラの手がかりは用途を追加してもAmazon検索語から落とさない', () => {
  const keywords = buildAmazonSearchKeywords(
    'SNSで見た、ピンクの小さいカメラみたいなもの / 遊び・趣味に使う'
  );
  assert.match(keywords, /camera/);
  assert.match(keywords, /pink/);
  assert.match(keywords, /toy/);
});

test('中国語と韓国語をAmazon.co.jpで探しやすい商品語へ変換する', () => {
  const chinese = buildAmazonSearchKeywords('想找可以放进包里的轻量折叠雨伞');
  assert.match(chinese, /折りたたみ傘/);
  assert.match(chinese, /軽量/);
  assert.match(chinese, /umbrella/);

  const korean = buildAmazonSearchKeywords('틱톡에서 본 투명하고 빛나는 휴대폰 케이스');
  assert.match(korean, /スマホケース/);
  assert.match(korean, /透明/);
  assert.match(korean, /LED/);
  assert.match(korean, /phone/);
});

test('Amazon検索流出は未充足需要として契約成果と分離する', () => {
  const events = trackingEventsForPayload({
    j: 'q1:AMAZON_SEARCH',
    u: 'anonymous-hash',
    r: 'q1',
    a: '',
    d: 'https://www.amazon.co.jp/s?k=humidifier',
    m: 'AMAZON_JP',
    t: 'SEARCH_FALLBACK'
  }, '2026-07-24T00:00:00.000Z');
  assert.equal(events.length, 2);
  events.forEach((event) => {
    assert.equal(event.asin, 'SEARCHFALL');
    assert.equal(event.destination_type, 'AMAZON_SEARCH_FALLBACK');
    assert.equal(event.contract_match, false);
    assert.equal(event.demand_status, 'UNMET');
  });
});

test('LINE返信は説明1件と商品最大3件', async () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    rank: index + 1, asin: `B00000000${index + 1}`,
    display_name: `商品${index + 1}`,
    offers: [{ marketplace: 'AMAZON_JP', product_url: `https://www.amazon.co.jp/dp/B00000000${index + 1}`, stock_status: 'IN_STOCK' }]
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

test('PWAは実在する複数モール購入先を個別の署名付きURLへ変換し元URLを返さない', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const gasResult = {
    query_id: 'q-multi', candidates: [{
      asin: 'B000000001', offers: [
        { marketplace: 'AMAZON_JP', product_url: 'https://amazon.co.jp/dp/B000000001', price: 1200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' },
        { marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item', price: 1000, shipping_fee: 200, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' },
        { marketplace: 'QOO10_JP', product_url: 'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=987654321', price: 1100, shipping_fee: 100, total_cost: 1200, currency: 'JPY', stock_status: 'IN_STOCK' }
      ]
    }]
  };
  const decorated = await workerModule.decoratePwaResultForTest(gasResult, new Request('https://p-gate.example/api/knowledge'), env, 'session-hash');
  assert.equal(decorated.candidates[0].offers.length, 3);
  decorated.candidates[0].offers.forEach((offer) => {
    assert.match(offer.tracking_url, /^https:\/\/p-gate\.example\/go\?token=/);
    assert.equal('product_url' in offer, false);
  });
  const firstToken = new URL(decorated.candidates[0].offers[0].tracking_url).searchParams.get('token');
  assert.equal((await verifyTrackToken(firstToken, env.LINK_SIGNING_SECRET)).m, 'AMAZON_JP');
});

test('PWAはAmazon検索フォールバックを署名付きURLで返す', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-fallback', candidates: [] },
    new Request('https://p-gate.example/api/knowledge'),
    env,
    'session-hash',
    '青い 小型 加湿器'
  );
  assert.match(
    decorated.amazon_search_url,
    /^https:\/\/p-gate\.example\/go\?token=/
  );
  const token = new URL(decorated.amazon_search_url).searchParams.get('token');
  const payload = await verifyTrackToken(token, env.LINK_SIGNING_SECRET);
  assert.equal(payload.t, 'SEARCH_FALLBACK');
  assert.equal(payload.m, 'AMAZON_JP');
  assert.match(payload.d, /^https:\/\/www\.amazon\.co\.jp\/s\?k=/);
  assert.match(decorated.amazon_search_keywords, /humidifier/);
});

test('商品カードには実出品でないモール検索ボタンを付けない', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-candidate-fallback', candidates: [{
      asin: 'B000000001',
      product_name: 'DC Icons Black Adam Action Figure',
      marketplace_search_links: [{ marketplace: 'QOO10_JP', url: 'https://example.invalid' }],
      amazon_search_url: 'https://example.invalid'
    }] },
    new Request('https://p-gate.example/api/knowledge'),
    env,
    'session-hash',
    '黒いフィギュア'
  );
  const candidate = decorated.candidates[0];
  assert.equal('marketplace_search_links' in candidate, false);
  assert.equal('amazon_search_url' in candidate, false);
  assert.equal(candidate.offers.length, 0);

  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /candidate\.marketplace_search_links|candidate\.amazon_search_url/);
});
test('PWA公開設定はSite Keyだけを返し、無効な質問をAPI境界で拒否する', async () => {
  const ctx = { waitUntil() {} };
  const configResponse = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/config'),
    { TURNSTILE_SITE_KEY: 'public-site-key', TURNSTILE_SECRET_KEY: 'must-not-leak' }, ctx
  );
  const config = await configResponse.json();
  assert.deepEqual(config, { turnstile_site_key: 'public-site-key', line_login_configured: false, email_login_configured: false, sms_login_configured: false });
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
  const optional = getEnvironmentReadiness({
    ...base,
    MYWATCH_CRON_SECRET: 'm'.repeat(32),
    UNMET_DEMAND_SYNC_SECRET: 'u'.repeat(32),
    SPAPI_LWA_CLIENT_ID: 'client',
    SPAPI_LWA_CLIENT_SECRET: 'secret',
    SPAPI_REFRESH_TOKEN_ITG: 'refresh',
    AMAZON_CREATORS_CREDENTIAL_ID: 'amazon-id',
    AMAZON_CREATORS_CREDENTIAL_SECRET: 'amazon-secret',
    AMAZON_ASSOCIATE_TAG: 'hoshilu-22',
    RAKUTEN_APPLICATION_ID: 'rakuten-app',
    RAKUTEN_ACCESS_KEY: 'rakuten-key'
  });
  assert.equal(optional.checks.mywatch_configured, true);
  assert.equal(optional.checks.unmet_demand_sync_configured, true);
  assert.deepEqual(optional.checks.sp_api_configured_tenants, ['itg']);
  assert.equal(optional.checks.amazon_creators_configured, true);
  assert.equal(optional.checks.rakuten_marketplace_configured, true);
  assert.equal(JSON.stringify(optional.checks).includes('refresh'), false);

  const ctx = { waitUntil() {} };
  const response = await workerModule.default.fetch(
    new Request('https://p-gate.example/health'), base, ctx
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.release, '1.15.0');
  assert.equal(payload.checks.database_features.mywatch_notifications, false);
  assert.equal(JSON.stringify(payload).includes(base.GAS_BRIDGE_SECRET), false);
  assert.equal(JSON.stringify(payload).includes(base.TURNSTILE_SECRET_KEY), false);
});

test('公開設定はTurnstile Site Key未設定時に503を返す', async () => {
  const response = await workerModule.default.fetch(
    new Request('https://p-gate.example/api/config'), {}, { waitUntil() {} }
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { turnstile_site_key: '', line_login_configured: false, email_login_configured: false, sms_login_configured: false });
});

test('Qoo10の商品検索はASINと末尾ノイズを除き短い商品条件へ整える', () => {
  const keywords = buildQoo10SearchKeywords(
    'B09NKLIJ57 black casetify iphone arson banana'
  );
  assert.equal(keywords, 'iPhoneケース');
  assert.doesNotMatch(keywords, /B09NKLIJ57|arson|banana/i);
  assert.ok(keywords.split(/\s+/).length <= 4);
});
test('横断検索語はスラッシュで追加した日本語条件をすべて保持する', () => {
  const query = '推し活で使える小さな写真プリンター / 写真を撮る / 手のひらサイズ / アクションカメラ';
  const amazonKeywords = buildAmazonSearchKeywords(query);
  const qoo10Keywords = buildQoo10SearchKeywords(query);
  for (const keywords of [amazonKeywords, qoo10Keywords]) {
    assert.match(keywords, /写真プリンター/);
    assert.match(keywords, /写真を撮る/);
    assert.match(keywords, /手のひらサイズ/);
    assert.match(keywords, /アクションカメラ/);
    assert.notEqual(keywords, 'camera');
  }
});

test('商品カードは4モールの実在商品ページを1モール1件だけ購入先にする', async () => {
  const env = { LINK_SIGNING_SECRET: 'secret' };
  const offers = [
    { marketplace: 'AMAZON_JP', product_url: 'https://www.amazon.co.jp/dp/B000000001', stock_status: 'IN_STOCK' },
    { marketplace: 'AMAZON_JP', product_url: 'https://www.amazon.co.jp/dp/B000000002', stock_status: 'IN_STOCK' },
    { marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item-1/', stock_status: 'IN_STOCK' },
    { marketplace: 'QOO10_JP', product_url: 'https://www.qoo10.jp/gmkt.inc/Goods/Goods.aspx?goodscode=123456789', stock_status: 'IN_STOCK' },
    { marketplace: 'SHEIN_JP', product_url: 'https://jp.shein.com/example-p-12345678.html', stock_status: 'IN_STOCK' },
    { marketplace: 'QOO10_JP', product_url: 'https://www.qoo10.jp/s/?keyword=camera', stock_status: 'IN_STOCK' }
  ];
  assert.equal(isProductDetailDestination(offers[5].product_url), false);
  assert.equal(isProductDetailDestination('https://www.qoo10.jp/item/sample-product/123456789'), true);
  assert.deepEqual(productMarketplaceOffers(offers).map((offer) => offer.marketplace), ['AMAZON_JP', 'RAKUTEN_JP', 'QOO10_JP', 'SHEIN_JP']);
  const decorated = await workerModule.decoratePwaResultForTest(
    { query_id: 'q-four-marketplaces', candidates: [{ asin: 'B000000001', offers }] },
    new Request('https://p-gate.example/api/knowledge'), env, 'session-hash'
  );
  assert.equal(decorated.candidates[0].offers.length, 4);
  decorated.candidates[0].offers.forEach((offer) => assert.equal(offer.tracking_url.startsWith('https://p-gate.example/go?token='), true));
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal(appSource.includes('marketplaceLabel(offer.marketplace)}で見る'), true);
  assert.equal(appSource.includes("JA:'全部のモールで探す'"), true);
  assert.equal(appSource.includes("document.querySelector('.marketplace-fallback')?.scrollIntoView"), true);
});


test('indexed knowledge candidates remain ahead of unverified GAS fallbacks', () => {
  const ranked = rankMerchantCandidatesForTest(
    [{ asin: 'B000CAMERA', product_name: 'Pink Camera' }],
    [{ asin: 'B000SOCIAL', product_name: 'SNS Sensor' }]
  );
  assert.deepEqual(ranked.map((candidate) => candidate.asin), ['B000CAMERA', 'B000SOCIAL']);
});
