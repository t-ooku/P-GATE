import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRakutenItems,
  rakutenApiConfigured,
  searchRakutenMarketplace,
  searchRakutenMarketplaceWithFallback
} from '../src/rakuten-marketplace-api.mjs';

const env = { RAKUTEN_APPLICATION_ID: 'app-id', RAKUTEN_ACCESS_KEY: 'access-key', RAKUTEN_AFFILIATE_ID: 'affiliate-id' };

test('楽天市場APIはApplication IDとAccess Keyの両方を必須にする', () => {
  assert.equal(rakutenApiConfigured(env), true);
  assert.equal(rakutenApiConfigured({ RAKUTEN_APPLICATION_ID: 'app-id' }), false);
});

test('楽天市場の商品詳細URLをHOSHILUの出品情報へ正規化する', () => {
  const candidates = normalizeRakutenItems({ items: [{
    itemName: 'スマホ対応ミニフォトプリンター', itemCode: 'shop:item-1', itemPrice: 5980,
    itemUrl: 'https://item.rakuten.co.jp/shop/item-1/', availability: 1,
    mediumImageUrls: [{ imageUrl: 'https://thumbnail.image.rakuten.co.jp/image.jpg' }]
  }] });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].offers[0].marketplace, 'RAKUTEN_JP');
  assert.equal(candidates[0].offers[0].product_url, 'https://item.rakuten.co.jp/shop/item-1/');
  assert.equal(candidates[0].offers[0].stock_status, 'IN_STOCK');
});

test('楽天市場APIへ整理済み検索語とサーバー側認証情報を渡す', async () => {
  let requested;
  const candidates = await searchRakutenMarketplace(env, '小型 写真プリンター', async (url, options) => {
    requested = { url: new URL(url), options };
    return Response.json({ items: [{ itemName: '写真プリンター', itemCode: 'shop:item', itemPrice: 5000, itemUrl: 'https://item.rakuten.co.jp/shop/item/' }] });
  });
  assert.equal(requested.url.hostname, 'openapi.rakuten.co.jp');
  assert.equal(requested.url.searchParams.get('applicationId'), 'app-id');
  assert.equal(requested.url.searchParams.get('accessKey'), 'access-key');
  assert.equal(requested.url.searchParams.get('affiliateId'), 'affiliate-id');
  assert.equal(requested.url.searchParams.get('keyword'), '小型 写真プリンター');
  assert.equal(candidates.length, 1);
});

test('複合条件が0件なら主要商品語で一度だけ再検索する', async () => {
  const requestedKeywords = [];
  const candidates = await searchRakutenMarketplaceWithFallback(
    env,
    ['小型 写真プリンター 手のひら スマホ対応', '小型 写真プリンター'],
    async (url) => {
      const keyword = new URL(url).searchParams.get('keyword');
      requestedKeywords.push(keyword);
      return {
        ok: true,
        async json() {
          if (keyword !== '小型 写真プリンター') return { items: [] };
          return {
            items: [{
              itemName: 'スマホ対応 ミニフォトプリンター',
              itemCode: 'shop:printer-1',
              itemPrice: 8980,
              itemUrl: 'https://item.rakuten.co.jp/shop/printer-1/',
              availability: 1
            }]
          };
        }
      };
    }
  );

  assert.deepEqual(requestedKeywords, [
    '小型 写真プリンター 手のひら スマホ対応',
    '小型 写真プリンター'
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].offers[0].marketplace, 'RAKUTEN_JP');
});
