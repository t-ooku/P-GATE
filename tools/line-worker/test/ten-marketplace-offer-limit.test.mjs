import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizePublicCandidate } from '../src/index.mjs';

test('公開商品候補は最大10モールの購入先を保持する', () => {
  const offers = Array.from({ length: 11 }, (_, index) => ({
    marketplace: `MARKETPLACE_${index + 1}`,
    price: 1000 + index,
    shipping_fee: 0,
    total_cost: 1000 + index,
    currency: 'JPY',
    tracking_url: `https://hoshilu.app/go?token=offer-${index + 1}`
  }));
  const candidate = sanitizePublicCandidate({ offers });
  assert.equal(candidate.offers.length, 10);
  assert.equal(candidate.offers.at(-1).marketplace, 'MARKETPLACE_10');
});

test('画面は10モールすべての署名付き購入先を描画対象にする', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /filter\(o=>o\?\.tracking_url\)\.slice\(0,10\)/);
  assert.doesNotMatch(app, /filter\(o=>o\?\.tracking_url\)\.slice\(0,9\)/);
});
