import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listPublicSales } from '../src/marketplace-sales.mjs';

test('確認済みセールAPIは最終更新時刻を安全に公開する', async () => {
  const row = {
    sale_id: 'sale-1', marketplace: 'YAHOO_JP', info_type: 'SALE', title: '確認済みセール', summary: '公式情報',
    starts_at: '2026-08-02T00:00:00.000Z', ends_at: '2026-08-03T00:00:00.000Z', updated_at: '2026-08-01T12:34:56.000Z',
    source_url: 'https://shopping.yahoo.co.jp/promotion/campaign/', image_url: '', image_rights_status: 'NONE', video_url: '', video_rights_status: 'NONE'
  };
  let sql = '';
  const env = { PRODUCT_DB: { prepare(value) { sql = value; return { bind: () => ({ all: async () => ({ results: [row] }) }) }; } } };
  const [sale] = await listPublicSales(env, new Date('2026-08-01T13:00:00.000Z'));
  assert.equal(sale.updated_at, row.updated_at);
  assert.match(sql, /updated_at/);
  assert.equal('image_url' in sale && sale.image_url !== '', false);
});

test('SALE RADARは更新日を4言語対応の日付フォーマットで各行に表示する', async () => {
  const client = await readFile(new URL('../public/sale-center.mjs', import.meta.url), 'utf8');
  for (const label of ["updated:'更新'", "updated:'Updated'", "updated:'更新'", "updated:'업데이트'"]) assert.match(client, new RegExp(label));
  assert.match(client, /sale\.updated_at/);
  assert.match(client, /date\(sale\.updated_at\|\|sale\.starts_at\|\|Date\.now\(\)\)/);
});
