import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeProductKey, buildProductDetail, handleProductDetailRoutes } from '../src/product-detail.mjs';
import { normalizeGrowthEvent } from '../src/growth-events.mjs';

// 2026-10-02 指示書「今ほしい人が買うためのサービス」§9 商品詳細・§6 買い時は事実だけ・§12 KPI。

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const rakutenEnv = {
  RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'key', RAKUTEN_AFFILIATE_ID: 'aff',
  PRODUCT_DB: null
};
const rakutenPayload = {
  Items: [{
    itemName: 'テスト水筒 500ml', itemCode: 'shop-a:item-1', itemPrice: 1980, itemUrl: 'https://item.rakuten.co.jp/shop-a/item-1/',
    affiliateUrl: 'https://hb.afl.rakuten.co.jp/x?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop-a%2Fitem-1%2F', mediumImageUrls: ['https://thumbnail.image.rakuten.co.jp/a.jpg'],
    availability: 1, postageFlag: 0, reviewAverage: 4.4, reviewCount: 12
  }, {
    itemName: '別の水筒', itemCode: 'shop-b:other', itemPrice: 900, itemUrl: 'https://item.rakuten.co.jp/shop-b/other/', availability: 1, postageFlag: 1
  }]
};

test('商品キーは楽天 itemCode・Yahoo! コード・JAN だけ。URL キーは拒否', () => {
  assert.equal(normalizeProductKey('RAKUTEN:shop-a:item-1'), 'RAKUTEN:shop-a:item-1');
  assert.equal(normalizeProductKey('JAN:4901234567894'), 'JAN:4901234567894');
  assert.equal(normalizeProductKey('YAHOO:abc_123'), 'YAHOO:abc_123');
  assert.equal(normalizeProductKey('RAKUTEN:https://item.rakuten.co.jp/x/y/'), '');
  assert.equal(normalizeProductKey('AMAZON:B000'), '');
  assert.equal(normalizeProductKey("RAKUTEN:a';DROP"), '');
});

test('現在価格は API に確認しに行き、record_key が一致する商品だけを使う。記録も残す', async () => {
  const recorded = [];
  const fetcher = async (url) => Response.json(String(url).includes('itemCode=shop-a%3Aitem-1') ? rakutenPayload : { Items: [] });
  const signed = [];
  const detail = await buildProductDetail(rakutenEnv, 'RAKUTEN:shop-a:item-1', {
    fetcher, now: new Date('2026-10-02T12:00:00+09:00'),
    sign: async (p) => { signed.push(p); return 'https://hoshilu.app/go?token=t'; },
    record: async (env, candidates, options) => { recorded.push({ n: candidates.length, source: options.source }); return { recorded: candidates.length }; }
  });
  assert.equal(detail.ok, true);
  assert.equal(detail.product.name, 'テスト水筒 500ml');
  assert.equal(detail.product.marketplace_label, '楽天市場');
  assert.equal(detail.current.status, 'OK');
  assert.equal(detail.current.offers.length, 1, '別商品（shop-b:other）は混ぜない');
  const offer = detail.current.offers[0];
  assert.equal(offer.price, 1980);
  assert.equal(offer.shipping_fee_confirmed, true);
  assert.equal(offer.total, 1980);
  assert.equal(offer.tracking_url, 'https://hoshilu.app/go?token=t');
  assert.equal(signed[0].m, 'RAKUTEN_JP');
  assert.deepEqual(recorded, [{ n: 1, source: 'product_detail' }]);
  // 記録テーブルが無い環境では「計測不能」で返し、ページは落ちない
  assert.equal(detail.history.measurable, false);
});

test('取得できないときは未取得と返し、価格を捏造しない', async () => {
  const detail = await buildProductDetail(rakutenEnv, 'RAKUTEN:shop-z:gone', { fetcher: async () => Response.json({ Items: [] }), record: async () => ({}) });
  assert.equal(detail.product, null);
  assert.equal(detail.current.status, 'NOT_FOUND');
  assert.deepEqual(detail.current.offers, []);
  const failed = await buildProductDetail(rakutenEnv, 'RAKUTEN:shop-z:gone', { fetcher: async () => { throw new Error('down'); }, record: async () => ({}) });
  assert.equal(failed.current.status, 'API_FAILURE');
});

test('/product は noindex の HTML、/api/product は不正キーを 400 にする', async () => {
  const page = await handleProductDetailRoutes(new Request('https://hoshilu.app/product?key=RAKUTEN:shop-a:item-1'), rakutenEnv, {}, {});
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex');
  const html = await page.text();
  assert.match(html, /data-key="RAKUTEN:shop-a:item-1"/u);
  assert.match(html, /product-detail\.mjs\?v=4/u);
  const bad = await handleProductDetailRoutes(new Request('https://hoshilu.app/api/product?key=AMAZON:B000'), rakutenEnv, {}, {});
  assert.equal(bad.status, 400);
  assert.equal((await handleProductDetailRoutes(new Request('https://hoshilu.app/product'), rakutenEnv, {}, {})).status, 404);
  assert.equal(await handleProductDetailRoutes(new Request('https://hoshilu.app/other'), rakutenEnv, {}, {}), null);
});

test('画面は順序固定で、買い時を予言しない（§6）', () => {
  const ui = read('public/product-detail.mjs');
  const order = ['product-head', 'product-now', 'product-history', 'product-offers', 'product-reviews', 'product-later'];
  let last = -1;
  for (const marker of order) { const at = ui.indexOf(`'${marker}'`); assert.ok(at > last, marker); last = at; }
  for (const banned of ['今が底値', '来週', '今買うべき', '下がります']) assert.ok(!ui.includes(banned), banned);
  assert.match(ui, /HOSHILUでの価格記録開始/u);
  // 2026-10-09 大隆さん報告「グラフが表示されてないよ」: 記録1日分でもグラフ枠と今日の点を出す。
  assert.match(ui, /if \(!points\.length\) return null;/u);
  assert.match(ui, /product-chart-single/u);
  assert.match(ui, /記録1日目です。明日以降の記録と線でつながります。/u);
  assert.match(ui, /send\('product_detail_view', \{ content: /u);
  assert.match(ui, /send\('marketplace_click', \{ marketplace: offer\.marketplace, content: 'product_detail' \}\)/u);
  assert.equal(normalizeGrowthEvent({ event_type: 'product_detail_view' }).event_type, 'product_detail_view');
  // 入口: 検索結果カードと BUZZ カード
  assert.match(read('public/unified-results-ui.mjs'), /\/product\?key=\$\{encodeURIComponent\(item\.record_key\)\}&from=search/u);
  assert.match(read('public/buzz-home.mjs'), /\/product\?key=/u);
  assert.match(ui, /&from=product&watch=1/u);
  assert.match(read('public/buzz.mjs'), /&from=buzz&watch=1#hoshiluSearch/u);
  const app = read('public/assets-v147/app.js');
  assert.match(app, /function openInboundPriceWatch\(\)/u);
  assert.match(app, /get\('watch'\)!=='1'/u);
  assert.match(app, /querySelector\('\.watch-settings-button'\)/u);
});
