// 2026-09-05 夜 大隆さん決定: 値下がり待ちリスト（5人以上の匿名集計だけを公開）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handlePriceWatchDemandRoute, publicPriceWatchDemand } from '../src/price-watch-demand.mjs';

function envWithDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0002_member_wishes.sql', '0003_member_wish_preferences.sql', '0005_mywatch_notifications.sql', '0044_insight_search_watch.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...values) { return { all: async () => ({ results: statement.all(...values) }) }; } }; } };
  return { sqlite, env: { PRODUCT_DB: db } };
}

function insertWatch(sqlite, member, wish, name, price) {
  sqlite.prepare(`INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
    VALUES(?1,?2,?3,'JA',0,1,0,0,'INSTANT',0,?4,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z')`)
    .run(member, wish, name, JSON.stringify({ price_condition: { target_price_jpy: price, target_product_key: 'RAKUTEN:x', target_product_name: name } }));
}

test('待たれている商品が5種類以上あれば欄を出し、1人でも待てば載る。希望額は5人以上の商品だけ', async () => {
  const { sqlite, env } = envWithDb();
  for (let i = 0; i < 6; i += 1) insertWatch(sqlite, `m${i}`, `w${i}`, 'サーモス 水筒 500ml ブルー', 2000 + i * 100);
  insertWatch(sqlite, 'a1', 'a1', 'パンパース おむつ Lサイズ 44枚', 1500);
  insertWatch(sqlite, 'a1', 'a2', 'パンパース おむつ Lサイズ 44枚', 1400); // 同じ会員の2件は1人
  insertWatch(sqlite, 'b1', 'b1', 'アタック ZERO 詰め替え', 900);
  insertWatch(sqlite, 'c1', 'c1', 'キッチンペーパー 業務用', 800);
  const four = await publicPriceWatchDemand(env);
  assert.equal(four.visible, false); assert.equal(four.product_count, 4); assert.deepEqual(four.items, []);
  insertWatch(sqlite, 'd1', 'd1', 'ベビーフード 7ヶ月', 700);
  const { items, visible, min_products, product_count } = await publicPriceWatchDemand(env);
  assert.equal(visible, true); assert.equal(min_products, 5); assert.equal(product_count, 5);
  assert.deepEqual([items[0].rank, items[0].product_name, items[0].waiting_members], [1, 'サーモス 水筒 500ml ブルー', 6]);
  assert.equal(items.length, 5);
  assert.deepEqual(items.slice(1).map(item => item.waiting_members), [1, 1, 1, 1], '同じ会員の2件は1人');
  assert.equal(items[0].average_target_price_jpy, 2250);
  assert.equal(items[0].min_target_price_jpy, 2000);
  for (const item of items.slice(1)) {
    assert.equal(item.average_target_price_jpy, 0, '1人の商品には希望額を付けない');
    assert.equal(item.min_target_price_jpy, 0);
  }
  assert.equal(items[0].search_url, '/?q=' + encodeURIComponent('サーモス 水筒 500ml ブルー'));
  for (const item of items) {
    assert.ok(!('member_id' in item));
    assert.ok(!('target_price_jpy' in item));
  }
});

test('GET /api/price-watch/demand は公開キャッシュ付きで返し、DB無しでも空配列', async () => {
  const { env } = envWithDb();
  const response = await handlePriceWatchDemandRoute(new Request('https://hoshilu.app/api/price-watch/demand'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=600');
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.result.items, []);
  assert.equal(payload.result.visible, false);
  const noDb = await publicPriceWatchDemand({});
  assert.deepEqual(noDb.items, []);
  assert.equal(await handlePriceWatchDemandRoute(new Request('https://hoshilu.app/api/other'), env), null);
});

test('トップに値下がり待ちリストの枠と読み込みモジュールがあり、SALE RADARの直前に置かれる', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="watchDemand"/);
  assert.match(html, /みんなが値下がりを待ってる/);
  assert.match(html, /watch-demand\.mjs\?v=2/);
  assert.match(html, /watch-demand\.css\?v=1/);
  assert.ok(html.indexOf('id="buzzHome"') < html.indexOf('id="watchDemand"'));
  assert.ok(html.indexOf('id="watchDemand"') < html.indexOf('id="saleCenterTitle"'));
  const client = readFileSync(new URL('../public/watch-demand.mjs', import.meta.url), 'utf8');
  assert.match(client, /\/api\/price-watch\/demand/);
  assert.doesNotMatch(client, /innerHTML/);
  assert.match(client, /result\.visible === false/);
});

test('逆ウォッチ（買った後の値下がり待ち）は「みんなが値下がりを待ってる」に数えない', async () => {
  const { sqlite, env } = envWithDb();
  for (let i = 0; i < 5; i += 1) insertWatch(sqlite, `m${i}`, `w${i}`, `待っている商品${i}`, 1000);
  for (let i = 0; i < 6; i += 1) {
    sqlite.prepare(`INSERT INTO member_wishes(member_id,wish_id,query_text,language,watch_sale,watch_price,watch_coupon,watch_restock,watch_frequency,notify_new_match,condition_snapshot,created_at,updated_at)
      VALUES(?1,?2,'買った商品','JA',0,1,0,0,'INSTANT',0,?3,'2026-09-05T00:00:00.000Z','2026-09-05T00:00:00.000Z')`)
      .run(`p${i}`, `x${i}`, JSON.stringify({ price_condition: { kind: 'POST_PURCHASE', purchase_price_jpy: 2000, target_price_jpy: 1999, expires_at: '2026-10-05T00:00:00.000Z', target_product_name: '買った商品' } }));
  }
  const { items, visible } = await publicPriceWatchDemand(env);
  assert.equal(visible, true);
  assert.ok(!items.some(item => item.product_name === '買った商品'));
  assert.equal(items.length, 5);
});
