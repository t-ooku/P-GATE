import test from 'node:test';
import assert from 'node:assert/strict';
import { expandedSearchTerms, ftsQuery, normalizeSearchQuery, validateSyncPayload } from '../src/product-index.mjs';

test('30万商品検索用の語句を安全なFTS式へ変換する', () => {
  assert.equal(normalizeSearchQuery('  米国　限定 フィギュア  '), '米国 限定 フィギュア');
  assert.equal(ftsQuery('米国 限定 フィギュア'), '"figure"* OR "collectible"* OR "statue"*');
  assert.equal(ftsQuery('a "quoted" cereal'), '"quoted"* OR "cereal"*');
});

test('同期はテナント・バッチ・最大200件を検証する', () => {
  const payload = validateSyncPayload({
    tenant: 'ITG', batch_id: 'itg:2026-07-23:0001',
    records: [{ record_key: 'itg:B000000001', asin: 'b000000001', product_name: '商品', row_hash: 'hash' }]
  });
  assert.equal(payload.tenant, 'itg');
  assert.equal(payload.records[0].asin, 'B000000001');
  assert.throws(() => validateSyncPayload({ tenant: 'ITG', batch_id: 'short', records: [{}] }), /SYNC_BATCH_INVALID/);
  assert.throws(() => validateSyncPayload({ tenant: 'ITG', batch_id: 'valid-batch-001', records: Array(201).fill({}) }), /SYNC_RECORD_COUNT_INVALID/);
});

test('検索式は重複語を除外し12語に制限する', () => {
  assert.equal(ftsQuery('cereal cereal organic'), '"cereal"* OR "organic"*');
  assert.equal(ftsQuery(Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ')).split(' OR ').length, 12);
});

test('日本語・中国語・韓国語の生活語を共通商品語へ展開する', () => {
  assert.deepEqual(expandedSearchTerms('日本で買えるアメリカのお菓子').slice(0, 4), ['snack','candy','chocolate','cookie']);
  assert.ok(expandedSearchTerms('汽车零件').includes('automotive'));
  assert.ok(expandedSearchTerms('자동차 부품').includes('replacement'));
});
test('車と部品の複合意図はANDグループで絞る', () => {
  assert.equal(ftsQuery('名前が分からない小さな車用パーツ'), '("car"* OR "automotive"* OR "vehicle"*) AND ("part"* OR "parts"* OR "replacement"*)');
});
