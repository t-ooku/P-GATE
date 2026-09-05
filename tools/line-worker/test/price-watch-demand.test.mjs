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

test('5人以上が待つ商品だけを、人数順に・個人の希望額を出さずに返す', async () => {
  const { sqlite, env } = envWithDb();
  for (let i = 0; i < 6; i += 1) insertWatch(sqlite, `m${i}`, `w${i}`, 'サーモス 水筒 500ml ブルー', 2000 + i * 100);
  for (let i = 0; i < 5; i += 1) insertWatch(sqlite, `n${i}`, `v${i}`, 'パンパース おむつ Lサイズ 44枚', 1500);
  for (let i = 0; i < 4; i += 1) insertWatch(sqlite, `k${i}`, `u${i}`, '4人しか待っていない商品', 900);
  // 同じ会員が同じ商品を2件登録しても1人として数える
  insertWatch(sqlite, 'k0', 'u9', '4人しか待っていない商品', 950);
  const { items, min_members } = await publicPriceWatchDemand(env);
  assert.equal(min_members, 5);
  assert.deepEqual(items.map(item => [item.rank, item.product_name, item.waiting_members]), [
    [1, 'サーモス 水筒 500ml ブルー', 6],
    [2, 'パンパース おむつ Lサイズ 44枚', 5]
  ]);
  assert.equal(items[0].min_target_price_jpy, 2000);
  assert.equal(items[0].average_target_price_jpy, 2250);
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
  const noDb = await publicPriceWatchDemand({});
  assert.deepEqual(noDb.items, []);
  assert.equal(await handlePriceWatchDemandRoute(new Request('https://hoshilu.app/api/other'), env), null);
});

test('トップに値下がり待ちリストの枠と読み込みモジュールがあり、SALE RADARの直前に置かれる', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="watchDemand"/);
  assert.match(html, /みんなが値下がりを待ってる/);
  assert.match(html, /watch-demand\.mjs\?v=1/);
  assert.match(html, /watch-demand\.css\?v=1/);
  assert.ok(html.indexOf('id="buzzHome"') < html.indexOf('id="watchDemand"'));
  assert.ok(html.indexOf('id="watchDemand"') < html.indexOf('id="saleCenterTitle"'));
  const client = readFileSync(new URL('../public/watch-demand.mjs', import.meta.url), 'utf8');
  assert.match(client, /\/api\/price-watch\/demand/);
  assert.doesNotMatch(client, /innerHTML/);
});
