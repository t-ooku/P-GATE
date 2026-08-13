import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creatorsApiConfigured,
  normalizeCreatorsItems,
  resetCreatorsTokenForTest,
  searchAmazonCreators
} from '../src/amazon-creators-api.mjs';

const env = {
  AMAZON_CREATORS_CREDENTIAL_ID: 'credential-id',
  AMAZON_CREATORS_CREDENTIAL_SECRET: 'credential-secret',
  AMAZON_CREATORS_CREDENTIAL_VERSION: '2.3',
  AMAZON_ASSOCIATE_TAG: 'hoshilu00-22'
};

test('Creators API requires all server-side credentials', () => {
  assert.equal(creatorsApiConfigured(env), true);
  assert.equal(creatorsApiConfigured({}), false);
});

test('normalizes Amazon catalog items into HOSHILU candidates', () => {
  const result = normalizeCreatorsItems({ itemsResult: { items: [{
    asin: 'B012345678',
    detailPageURL: 'https://www.amazon.co.jp/dp/B012345678?tag=hoshilu00-22',
    images: { primary: { medium: { url: 'https://m.media-amazon.com/image.jpg' } } },
    itemInfo: { title: { displayValue: 'LEDで光るスマホケース' }, features: { displayValues: ['通知で光る'] } }
  }] } });
  assert.equal(result[0].asin, 'B012345678');
  assert.equal(result[0].product_name, 'LEDで光るスマホケース');
  assert.equal(result[0].marketplace_source, 'AMAZON_CREATORS_API');
  assert.equal(result[0].offers[0].marketplace, 'AMAZON_JP');
  assert.match(result[0].offers[0].product_url, /amazon\.co\.jp\/dp\/B012345678/);
});

test('Amazon公式APIが返した主画像と2枚目以降だけを画像一覧として保持する', () => {
  const [candidate] = normalizeCreatorsItems({ itemsResult: { items: [{
    asin: 'B012345678', detailPageURL: 'https://www.amazon.co.jp/dp/B012345678',
    itemInfo: { title: { displayValue: '複数画像の商品' } },
    images: {
      primary: { large: { url: 'https://m.media-amazon.com/images/I/main.jpg' } },
      variants: [
        { large: { url: 'https://m.media-amazon.com/images/I/second.jpg' } },
        { medium: { url: 'javascript:alert(1)' } }
      ]
    }
  }] } });
  assert.deepEqual(candidate.image_urls, [
    'https://m.media-amazon.com/images/I/main.jpg',
    'https://m.media-amazon.com/images/I/second.jpg'
  ]);
  assert.equal(candidate.image, candidate.image_urls[0]);
});

test('fetches and reuses a Creators API OAuth token', async () => {
  resetCreatorsTokenForTest();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/oauth2/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
    return Response.json({ itemsResult: { items: [] } });
  };
  await searchAmazonCreators(env, 'LED smartphone case', fetcher);
  await searchAmazonCreators(env, 'glowing phone cover', fetcher);
  assert.equal(calls.filter((call) => call.url.includes('/oauth2/token')).length, 1);
  const search = calls.find((call) => call.url.includes('/searchItems'));
  assert.equal(search.options.headers['x-marketplace'], 'www.amazon.co.jp');
  assert.match(search.options.headers.authorization, /Version 2\.3/);
  const body = JSON.parse(search.options.body);
  assert.equal(body.partnerTag, 'hoshilu00-22');
  assert.deepEqual(body.languagesOfPreference, ['ja_JP']);
  assert.equal(body.currencyOfPreference, 'JPY');
  assert.ok(body.resources.includes('offersV2.listings.availability'));
  assert.ok(body.resources.includes('offersV2.listings.price'));
});

test('Credential Version is required and invalid values are rejected', async () => {
  assert.equal(creatorsApiConfigured({ ...env, AMAZON_CREATORS_CREDENTIAL_VERSION: '' }), false);
  assert.equal(creatorsApiConfigured({ ...env, AMAZON_CREATORS_CREDENTIAL_VERSION: '9.9' }), false);
  await assert.rejects(
    () => searchAmazonCreators({ ...env, AMAZON_CREATORS_CREDENTIAL_VERSION: '9.9' }, '日傘'),
    /AMAZON_CREATORS_CREDENTIAL_VERSION_INVALID/
  );
});

test('normalizes JPY price and availability without inventing stock', () => {
  const url = 'https://www.amazon.co.jp/dp/B012345678?tag=hoshilu00-22&ref_=abc';
  const [available, unknown] = normalizeCreatorsItems({ itemsResult: { items: [{
    asin: 'B012345678',
    detailPageURL: url,
    itemInfo: { title: { displayValue: '折りたたみ日傘' } },
    offersV2: { listings: [{
      availability: { type: 'IN_STOCK' },
      price: { money: { amount: 3980, currency: 'JPY' } }
    }] }
  }, {
    asin: 'B087654321',
    detailPageURL: 'https://www.amazon.co.jp/dp/B087654321',
    itemInfo: { title: { displayValue: '在庫不明の商品' } }
  }] } });
  assert.equal(available.amazon_jp_url, url);
  assert.equal(available.stock, 1);
  assert.equal(available.offers[0].stock_status, 'IN_STOCK');
  assert.equal(available.offers[0].price, 3980);
  assert.equal(available.offers[0].currency, 'JPY');
  assert.equal(unknown.stock, 0);
  assert.equal(unknown.offers[0].stock_status, 'UNKNOWN');
});

test('v3.3 uses the Japan token endpoint and plain Bearer authorization', async () => {
  resetCreatorsTokenForTest();
  const calls = [];
  const v3env = { ...env, AMAZON_CREATORS_CREDENTIAL_VERSION: '3.3' };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://api.amazon.co.jp/auth/o2/token') {
      const body = JSON.parse(options.body);
      assert.equal(body.scope, 'creatorsapi::default');
      return Response.json({ access_token: 'v3-token', expires_in: 3600 });
    }
    return Response.json({ itemsResult: { items: [] } });
  };
  await searchAmazonCreators(v3env, '折りたたみ日傘', fetcher);
  const search = calls.find((call) => call.url.includes('/searchItems'));
  assert.equal(search.options.headers.authorization, 'Bearer v3-token');
  const resources = JSON.parse(search.options.body).resources;
  assert.ok(resources.includes('images.variants.large'));
  assert.ok(resources.includes('images.variants.medium'));
});

test('one 401 discards the token and authenticates exactly once again', async () => {
  resetCreatorsTokenForTest();
  let tokenCalls = 0;
  let searchCalls = 0;
  const fetcher = async (url) => {
    if (url.includes('/oauth2/token')) {
      tokenCalls += 1;
      return Response.json({ access_token: `token-${tokenCalls}`, expires_in: 3600 });
    }
    searchCalls += 1;
    if (searchCalls === 1) return new Response('', { status: 401 });
    return Response.json({ itemsResult: { items: [] } });
  };
  await searchAmazonCreators(env, '折りたたみ日傘', fetcher);
  assert.equal(tokenCalls, 2);
  assert.equal(searchCalls, 2);
});

test('429 honors Retry-After and uses bounded retry', async () => {
  resetCreatorsTokenForTest();
  const waits = [];
  let searchCalls = 0;
  const fetcher = async (url) => {
    if (url.includes('/oauth2/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
    searchCalls += 1;
    if (searchCalls === 1) return new Response('', { status: 429, headers: { 'retry-after': '2' } });
    return Response.json({ itemsResult: { items: [] } });
  };
  await searchAmazonCreators(env, '折りたたみ日傘', fetcher, { sleep: async (ms) => waits.push(ms) });
  assert.equal(searchCalls, 2);
  assert.deepEqual(waits, [2000]);
});

test('OAuth token and offer-bearing product response are reused from cache', async () => {
  resetCreatorsTokenForTest();
  let tokenCalls = 0;
  let searchCalls = 0;
  const fetcher = async (url) => {
    if (url.includes('/oauth2/token')) {
      tokenCalls += 1;
      return Response.json({ access_token: 'token', expires_in: 3600 });
    }
    searchCalls += 1;
    return Response.json({ itemsResult: { items: [{
      asin: 'B012345678',
      detailPageURL: 'https://www.amazon.co.jp/dp/B012345678?ref_=cache',
      itemInfo: { title: { displayValue: '折りたたみ日傘' } },
      offersV2: { listings: [{ availability: { type: 'IN_STOCK' }, price: { money: { amount: 2980, currency: 'JPY' } } }] }
    }] } });
  };
  const first = await searchAmazonCreators(env, '折りたたみ日傘', fetcher);
  const second = await searchAmazonCreators(env, '折りたたみ日傘', fetcher);
  assert.equal(tokenCalls, 1);
  assert.equal(searchCalls, 1);
  assert.deepEqual(second, first);
});

test('HTTP 200 payload errors are rejected as partial failures', async () => {
  resetCreatorsTokenForTest();
  const fetcher = async (url) => {
    if (url.includes('/oauth2/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
    return Response.json({
      itemsResult: { items: [{ asin: 'B012345678', detailPageURL: 'https://www.amazon.co.jp/dp/B012345678' }] },
      errors: [{ code: 'PARTIAL_RESULT', message: 'some resources failed' }]
    });
  };
  await assert.rejects(
    () => searchAmazonCreators(env, '折りたたみ日傘', fetcher),
    /AMAZON_CREATORS_PARTIAL_ERROR/
  );
});
