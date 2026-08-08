import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { groupOffersIntoCanonicalProducts, upsertNormalizedOffer } from '../src/hoshilu-product-normalizer.mjs';

const migration = readFileSync(new URL('../migrations/0042_hoshilu_product_schema.sql', import.meta.url), 'utf8');

// v4.3 指示書 section 21-23の同じD1シム(admin-login-guard.test.mjs等の
// 既存パターンを踏襲): node:sqliteをD1互換のprepare().bind().run/first/all
// でラップする。
function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            run: async () => { const result = statement.run(...values); return { meta: { changes: Number(result.changes || 0) } }; },
            first: async () => statement.get(...values) || null,
            all: async () => ({ results: statement.all(...values) })
          };
        }
      };
    }
  };
  return { sqlite, db };
}

test('v4.3項目22: canonical productは複数モールのオファーを束ねる(JAN一致で自動グルーピング)', () => {
  const groups = groupOffersIntoCanonicalProducts([
    { source_product_id: 'AMZ1', source_marketplace: 'AMAZON_JP', jan: '4900000000001', title: 'ハンディファン', updated_at: '2026-08-08T00:00:00Z' },
    { source_product_id: 'RAK1', source_marketplace: 'RAKUTEN_JP', jan: '4900000000001', title: 'ハンディファン', updated_at: '2026-08-08T00:00:00Z' },
    { source_product_id: 'YAH1', source_marketplace: 'YAHOO_JP', jan: '4900000000001', title: 'ハンディファン', updated_at: '2026-08-08T00:00:00Z' },
    { source_product_id: 'UNRELATED1', source_marketplace: 'LOFT_JP', jan: '4900000000099', title: '別の商品', updated_at: '2026-08-08T00:00:00Z' }
  ]);
  assert.equal(groups.length, 2);
  const famGroup = groups.find((group) => group.offers.length === 3);
  assert.ok(famGroup);
  assert.deepEqual(new Set(famGroup.offers.map((offer) => offer.source_marketplace)), new Set(['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP']));
  // グループ内の全オファーが同じhoshilu_product_idを持つ
  assert.equal(new Set(famGroup.offers.map((offer) => offer.hoshilu_product_id)).size, 1);
  const soloGroup = groups.find((group) => group.offers.length === 1);
  assert.equal(soloGroup.offers[0].source_product_id, 'UNRELATED1');
});

test('groupOffersIntoCanonicalProductsは同じ入力に対して常に同じhoshilu_product_idを生成する(冪等)', () => {
  const input = [
    { source_product_id: 'A', source_marketplace: 'AMAZON_JP', jan: '4900000000002', title: '商品A', updated_at: '2026-08-08T00:00:00Z' },
    { source_product_id: 'B', source_marketplace: 'RAKUTEN_JP', jan: '4900000000002', title: '商品A', updated_at: '2026-08-08T00:00:00Z' }
  ];
  const first = groupOffersIntoCanonicalProducts(input)[0].hoshilu_product_id;
  const second = groupOffersIntoCanonicalProducts(input)[0].hoshilu_product_id;
  assert.equal(first, second);
});

test('v4.3項目23: upsertNormalizedOfferはD1へ正規化済みオファーを永続化し、生データをそのまま流さない', async () => {
  const { sqlite, db } = sqliteD1();
  const result = await upsertNormalizedOffer(db, {
    source_product_id: 'B000ABC123', asin: 'B000ABC123', title: 'ハンディファン ホワイト',
    brand: 'HOSHILU', jan: '4900000000003', price: 2980, shipping_fee: 0, stock_status: 'in_stock',
    updated_at: '2026-08-08T00:00:00Z'
  }, { sourceMarketplace: 'AMAZON_JP' });
  assert.match(result.hoshilu_product_id, /^HP_[0-9a-f]{16}$/);
  const productRow = sqlite.prepare('SELECT * FROM hoshilu_products WHERE hoshilu_product_id = ?').get(result.hoshilu_product_id);
  assert.ok(productRow);
  const offerRow = sqlite.prepare('SELECT * FROM hoshilu_product_offers WHERE source_marketplace = ? AND source_product_id = ?')
    .get('AMAZON_JP', 'B000ABC123');
  assert.equal(offerRow.hoshilu_product_id, result.hoshilu_product_id);
  assert.equal(offerRow.stock_status, 'IN_STOCK');
  assert.equal(offerRow.price, 2980);
});

test('v4.3項目22: JANが一致する別モールのオファーは既存のcanonical productへ合流する', async () => {
  const { sqlite, db } = sqliteD1();
  const first = await upsertNormalizedOffer(db, {
    source_product_id: 'AMZ_JAN1', jan: '4900000000004', title: 'ハンディファン',
    brand: 'HOSHILU', updated_at: '2026-08-08T00:00:00Z'
  }, { sourceMarketplace: 'AMAZON_JP' });
  const second = await upsertNormalizedOffer(db, {
    source_product_id: 'RAK_JAN1', jan: '4900000000004', title: 'ハンディファン',
    brand: 'HOSHILU', updated_at: '2026-08-08T00:00:00Z'
  }, { sourceMarketplace: 'RAKUTEN_JP' });
  assert.equal(first.hoshilu_product_id, second.hoshilu_product_id);
  const count = sqlite.prepare('SELECT COUNT(*) AS total FROM hoshilu_products').get().total;
  assert.equal(count, 1);
  const offerCount = sqlite.prepare('SELECT COUNT(*) AS total FROM hoshilu_product_offers').get().total;
  assert.equal(offerCount, 2);
});

test('upsertNormalizedOfferは同じsource_marketplace+source_product_idを再送すると更新(冪等)される', async () => {
  const { sqlite, db } = sqliteD1();
  await upsertNormalizedOffer(db, {
    source_product_id: 'X1', title: '商品', price: 1000, updated_at: '2026-08-08T00:00:00Z'
  }, { sourceMarketplace: 'AMAZON_JP' });
  await upsertNormalizedOffer(db, {
    source_product_id: 'X1', title: '商品', price: 900, updated_at: '2026-08-08T01:00:00Z'
  }, { sourceMarketplace: 'AMAZON_JP' });
  const rows = sqlite.prepare('SELECT * FROM hoshilu_product_offers WHERE source_marketplace = ? AND source_product_id = ?')
    .all('AMAZON_JP', 'X1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 900);
});
