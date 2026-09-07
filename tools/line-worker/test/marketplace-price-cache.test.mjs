import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { normalizedPriceCacheRows, persistMarketplacePrices, readFreshMarketplacePrice, purgeExpiredMarketplacePrices } from '../src/marketplace-price-cache.mjs';
import { normalizeRakutenItems } from '../src/rakuten-marketplace-api.mjs';

function candidate(overrides = {}) {
  return normalizeRakutenItems({ Items: [{ Item: { itemCode: 'shop:item-1', itemName: '水筒', itemPrice: 1200,
    itemUrl: 'https://item.rakuten.co.jp/shop/item-1/', postageFlag: 0, availability: 1, ...overrides } }] })[0];
}
function database() {
  const sql = readFileSync(new URL('../migrations/0077_marketplace_price_cache.sql', import.meta.url), 'utf8');
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(sql); sqlite.exec(sql);
  const db = { prepare(sql) { const s = sqlite.prepare(sql); return { bind(...values) {
    const args = Object.fromEntries(values.map((v,i)=>[String(i+1),v]));
    return { run: async () => s.run(args), first: async () => s.get(args) || null };
  } }; }, batch: async statements => Promise.all(statements.map(s=>s.run())) };
  return { sqlite, env: { PRODUCT_DB: db, MARKETPLACE_PRICE_CACHE_ENABLED: 'true' } };
}

test('楽天APIの実価格だけ保存し、未確認送料は無料として計算しない', () => {
  const c = candidate({ postageFlag: 1 });
  const rows = normalizedPriceCacheRows([c, { ...c, marketplace_source: 'AI' }, { ...c, record_key: 'RAKUTEN:https://bad/?token=secret' }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].shipping, null); assert.equal(rows[0].effective_price, null);
  assert.doesNotMatch(JSON.stringify(rows), /token|product_url|水筒|member_id|query/);
  assert.equal(normalizedPriceCacheRows([candidate({ availability: 0 })]).length, 0);
});

test('重複は最新価格1行のみ、遅れて届いた古い書込みは上書きせず、期限切れは読めず削除される', async () => {
  const { sqlite, env } = database();
  const t = new Date('2026-09-07T00:00:00Z');
  assert.deepEqual(await persistMarketplacePrices(env, [candidate(), candidate()], t), { status: 'SAVED', saved: 1 });
  await persistMarketplacePrices(env, [candidate({ itemPrice: 900 })], new Date(t.getTime() + 1000));
  await persistMarketplacePrices(env, [candidate({ itemPrice: 1300 })], t);
  assert.equal((await readFreshMarketplacePrice(env, 'RAKUTEN:shop:item-1', new Date(t.getTime()+2000))).effective_price, 900);
  const expired = new Date(t.getTime()+24*3600000);
  assert.equal(await readFreshMarketplacePrice(env, 'RAKUTEN:shop:item-1', expired), null);
  await purgeExpiredMarketplacePrices(env, expired);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM marketplace_price_cache').get().n, 0);
  sqlite.close();
});

test('保存失敗が検索結果を失わせず、無効化時はDBを呼ばない', async () => {
  let called = 0; const env = { PRODUCT_DB: { prepare() { called++; throw new Error('private'); } } };
  assert.equal((await persistMarketplacePrices(env, [candidate()])).status, 'DISABLED'); assert.equal(called, 0);
  assert.equal((await persistMarketplacePrices({ ...env, MARKETPLACE_PRICE_CACHE_ENABLED: 'true' }, [candidate()])).status, 'UNAVAILABLE');
});
