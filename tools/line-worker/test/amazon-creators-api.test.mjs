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
  AMAZON_ASSOCIATE_TAG: 'hoshilu-22'
};

test('Creators API requires all server-side credentials', () => {
  assert.equal(creatorsApiConfigured(env), true);
  assert.equal(creatorsApiConfigured({}), false);
});

test('normalizes Amazon catalog items into HOSHILU candidates', () => {
  const result = normalizeCreatorsItems({ itemsResult: { items: [{
    asin: 'B012345678',
    detailPageURL: 'https://www.amazon.co.jp/dp/B012345678?tag=hoshilu-22',
    images: { primary: { medium: { url: 'https://m.media-amazon.com/image.jpg' } } },
    itemInfo: { title: { displayValue: 'LEDで光るスマホケース' }, features: { displayValues: ['通知で光る'] } }
  }] } });
  assert.equal(result[0].asin, 'B012345678');
  assert.equal(result[0].product_name, 'LEDで光るスマホケース');
  assert.equal(result[0].marketplace_source, 'AMAZON_CREATORS_API');
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
  assert.equal(JSON.parse(search.options.body).partnerTag, 'hoshilu-22');
});
