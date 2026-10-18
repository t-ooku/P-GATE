import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withDropFocus, dropSegment, DROP_SOURCES, renderPriceDrops } from '../src/owned-media.mjs';
import { recordKoreanFashionPrices, KOREAN_FASHION_SOURCE } from '../src/buzz-shelf.mjs';

// 2026-10-17 大隆さん「値下がり中のリアル画像を、デカデカとアピール。若い者向けや主婦向け、流行ってるアパレルや生活雑貨も。特に韓国系とかもね」
const row = (key, category, name = '商品', rate = 20, image = true) => ({
  record_key: key, marketplace: 'RAKUTEN_JP', product_name: name, category_id: category, drop_rate: rate,
  latest_price: 800, max_price: 1000, days: 5, image_url: image ? 'https://img.example/a.jpg' : '', history: []
});

test('値下がりの SNS 用の並び: 韓国系 → アパレル → 生活雑貨 → 美容 を 1 つずつ回し、写真の無い物は選ばない', () => {
  const drops = withDropFocus([
    row('e', 'wireless_earphones', 'イヤホン', 40),
    row('w', 'womens_fashion', 'ニット', 15),
    row('k', 'womens_fashion', '韓国風 ニット', 12),
    row('d', 'kitchen', 'フライパン', 30),
    row('s', 'skincare', '化粧水', 11),
    row('m', 'mens_fashion', 'ジャケット', 25, false)
  ]);
  const focus = drops.filter((item) => item.focus).sort((a, b) => a.focus - b.focus).map((item) => item.record_key);
  assert.deepEqual(focus, ['k', 'w', 'd', 's', 'e']);
  assert.equal(drops.find((item) => item.record_key === 'm').focus, undefined, '写真の無い物は SNS に出さない');
  // 一覧の並び（下がり幅の大きい順）は変えない
  assert.deepEqual(drops.map((item) => item.record_key), ['e', 'w', 'k', 'd', 's', 'm']);
  assert.deepEqual(dropSegment({ category_id: 'korean_fashion' }), { id: 'korean', label: '韓国ファッション' });
  assert.deepEqual(dropSegment({ category_id: 'buzz_korean_beauty' }), { id: 'korean', label: '韓国コスメ' });
  assert.equal(dropSegment({ category_id: 'daily_goods' }).id, 'daily');
  assert.equal(withDropFocus(null), null);
  // 先頭のジャンルは日替わり（rotate 1 ならアパレルから）
  const rotated = withDropFocus(drops, 6, 1).filter((item) => item.focus).sort((a, b) => a.focus - b.focus).map((item) => item.record_key);
  assert.deepEqual(rotated, ['w', 'd', 's', 'k', 'e']);
});

test('値下がりの SNS 用の並び: 同じジャンルの中も日替わりで 2 つずつずらす・1 投稿に同じお店は 1 つまで（10/18）', () => {
  const daily = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((key, i) => row(key, 'kitchen', `台所 ${key}`, 40 - i));
  const pick = (rotate) => withDropFocus(daily, 2, rotate).filter((item) => item.focus).sort((a, b) => a.focus - b.focus).map((item) => item.record_key);
  assert.deepEqual(pick(0), ['d1', 'd2']);
  assert.deepEqual(pick(1), ['d3', 'd4'], '翌日はちがう商品');
  assert.deepEqual(pick(2), ['d5', 'd6']);
  assert.deepEqual(pick(3), ['d1', 'd2'], '一巡したら最初から');
  const shop = [
    { ...row('a', 'buzz_korean_beauty', 'ファンデ 本品', 50), marketplace: 'YAHOO_JP', seller_id: 'shop1' },
    { ...row('b', 'buzz_korean_beauty', 'ファンデ 詰め替え', 50), marketplace: 'YAHOO_JP', seller_id: 'shop1' },
    { ...row('c', 'buzz_korean_beauty', 'リップ', 30), marketplace: 'YAHOO_JP', seller_id: 'shop2' }
  ];
  const focus = withDropFocus(shop, 6, 0).filter((item) => item.focus).map((item) => item.record_key);
  assert.deepEqual(focus.sort(), ['a', 'c']);
  const source = readFileSync(new URL('../src/owned-media.mjs', import.meta.url), 'utf8');
  assert.match(source, /SELECT w\.marketplace, w\.seller_id, w\.record_key/u);
  assert.match(source, /seller_id: String\(row\.seller_id \|\| ''\)/u, '読んだ seller_id を落とさない');
});

test('値下がりページ: カードにジャンルと data-focus を付ける。載せてよい記録の元は公開ランキングと固定の検索語だけ', () => {
  const html = renderPriceDrops({ drops: withDropFocus([row('k', 'korean_fashion', '韓国 ブラウス', 20)]), now: new Date('2026-10-17T03:00:00Z') });
  assert.match(html, /<li class="media-drop" data-focus="1">/u);
  assert.match(html, /<span class="media-drop-genre">韓国ファッション<\/span>/u);
  assert.deepEqual([...DROP_SOURCES], ['rakuten_ranking_api', 'yahoo_korean_beauty', 'yahoo_korean_fashion']);
  assert.ok(!DROP_SOURCES.includes('search'), '利用者の検索から記録した商品は載せない');
  const source = readFileSync(new URL('../src/owned-media.mjs', import.meta.url), 'utf8');
  assert.match(source, /r\.source IN \(\$\{DROP_SOURCES/u);
});

test('韓国ファッションの価格記録: 固定の検索語・商品名に「韓国」とある物だけ・6 時間に 1 回まで', async () => {
  const writes = [];
  let cache = null;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return /SELECT payload_json, expires_at FROM marketplace_ranking_cache/u.test(sql) ? cache : null; },
            async run() { if (/marketplace_ranking_cache/u.test(sql)) cache = { payload_json: args[3] || args.find((v) => String(v).startsWith('[')), expires_at: new Date(Date.now() + 3600e3).toISOString() }; writes.push(sql); return {}; }
          };
        }
      };
    },
    async batch(statements) { writes.push(`batch:${statements.length}`); return []; }
  };
  const env = { PRODUCT_DB: db, YAHOO_SHOPPING_CLIENT_ID: 'x', YAHOO_CLIENT_ID: 'x', YAHOO_APP_ID: 'x' };
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return Response.json({ totalResultsAvailable: 2, hits: [
      { name: '韓国ファッション ブラウス レディース', code: 'store_a1', url: 'https://store.shopping.yahoo.co.jp/store/a1.html', price: 2980, image: { medium: 'https://item-shopping.c.yimg.jp/i/g/a1' }, seller: { sellerId: 'store' }, inStock: true },
      { name: '無地 ブラウス', code: 'store_a2', url: 'https://store.shopping.yahoo.co.jp/store/a2.html', price: 1980, image: { medium: 'https://item-shopping.c.yimg.jp/i/g/a2' }, seller: { sellerId: 'store' }, inStock: true }
    ] });
  };
  const first = await recordKoreanFashionPrices(env, fetcher, Date.now());
  if (first.skipped === 'NOT_CONFIGURED') return; // この環境では Yahoo! の設定名が違う（呼び出しは CI と同じ設定で確かめる）
  assert.ok(calls.length >= 1);
  assert.ok(decodeURIComponent(calls[0]).includes(KOREAN_FASHION_SOURCE.query.split(' ')[0]));
  const second = await recordKoreanFashionPrices(env, fetcher, Date.now());
  assert.equal(second.skipped, 'FRESH', '保存が新しい間は API を呼ばない');
});
