import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configuredValueCommerceMarketplaces,
  normalizeValueCommerceItems,
  searchValueCommerceMarketplace,
  valueCommerceMarketplaceConfigured
} from '../src/valuecommerce-product-api.mjs';

const yahooLink = 'https://ck.jp.ap.valuecommerce.com/servlet/referral?vs=123&vp=456&vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fshop%2Fitem-code.html';
const qoo10Link = 'https://ck.jp.ap.valuecommerce.com/servlet/referral?vs=123&vp=456&vc_url=https%3A%2F%2Fwww.qoo10.jp%2Fgmkt.inc%2FGoods%2FGoods.aspx%3Fgoodscode%3D123456789';

test('configuration requires a token and marketplace-specific ecCode without exposing either', () => {
  const env = {
    VALUECOMMERCE_PRODUCT_API_TOKEN: 'secret-token',
    VALUECOMMERCE_YAHOO_EC_CODE: 'YS001'
  };
  assert.equal(valueCommerceMarketplaceConfigured(env, 'YAHOO_JP'), true);
  assert.equal(valueCommerceMarketplaceConfigured(env, 'QOO10_JP'), false);
  assert.deepEqual(configuredValueCommerceMarketplaces(env), ['YAHOO_JP']);
  assert.equal(valueCommerceMarketplaceConfigured({ ...env, VALUECOMMERCE_YAHOO_EC_CODE: 'bad code' }, 'YAHOO_JP'), false);
});

test('normalization keeps only measured links whose embedded destination matches the requested marketplace', () => {
  const payload = { items: [
    { title: 'Yahoo商品', link: yahooLink, price: 1980, janCode: '4901234567894', imageLarge: { url: 'https://img.example/item.jpg' } },
    { title: '別モール', link: qoo10Link, price: 1200 },
    { title: '通常URL', link: 'https://store.shopping.yahoo.co.jp/shop/direct.html', price: 900 }
  ] };
  const items = normalizeValueCommerceItems(payload, 'YAHOO_JP');
  assert.equal(items.length, 1);
  assert.equal(items[0].record_key, 'JAN:4901234567894');
  assert.equal(items[0].offers[0].marketplace, 'YAHOO_JP');
  assert.equal(items[0].offers[0].product_url, yahooLink);
});

test('search sends the secret only to the fixed HTTPS API and returns Qoo10 affiliate products', async () => {
  const env = {
    VALUECOMMERCE_PRODUCT_API_TOKEN: 'secret-token',
    VALUECOMMERCE_QOO10_EC_CODE: 'Q1001'
  };
  let requestUrl = '';
  const fetcher = async (url, options) => {
    requestUrl = url;
    assert.equal(options.redirect, 'manual');
    return Response.json({ items: [{ title: 'Qoo10商品', link: qoo10Link, price: 1500 }] });
  };
  const items = await searchValueCommerceMarketplace(env, 'QOO10_JP', '韓国コスメ', fetcher);
  const parsed = new URL(requestUrl);
  assert.equal(parsed.origin, 'https://webservice.valuecommerce.ne.jp');
  assert.equal(parsed.pathname, '/productdb/search');
  assert.equal(parsed.searchParams.get('token'), 'secret-token');
  assert.equal(parsed.searchParams.get('ecCode'), 'Q1001');
  assert.equal(parsed.searchParams.get('keyword'), '韓国コスメ');
  assert.equal(items.length, 1);
  assert.equal(items[0].offers[0].marketplace, 'QOO10_JP');
});

test('search is disabled without complete credentials and never calls the network', async () => {
  let called = false;
  const items = await searchValueCommerceMarketplace({}, 'QOO10_JP', '商品', async () => {
    called = true;
    return Response.json({});
  });
  assert.deepEqual(items, []);
  assert.equal(called, false);
});
