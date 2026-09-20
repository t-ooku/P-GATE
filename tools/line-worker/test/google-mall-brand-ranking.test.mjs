import test from 'node:test';
import assert from 'node:assert/strict';
import { rerankGoogleMallItems } from '../src/google-mall-brand-ranking.mjs';

const item = (title, slug) => ({ title, url: `https://qoo10.jp/item/${slug}/123`, listed_price_jpy: 1980, product_page: true });
const unrelated = () => [item('GROWUS 頭皮ケア', 'growus'), item('Derma:fume 頭皮ケア', 'dermafume'), item('頭皮ブラシ', 'brush'), item('頭皮ケア', 'scalp')];

test('fifth result with one inserted Kana moves first; actual offers are unchanged', () => {
  const target = item('リリーイブ 頭皮ケア', 'serum');
  const items = [...unrelated(), target];
  const snapshot = JSON.stringify(items);
  const ranked = rerankGoogleMallItems(items, ['LILIB', 'リリーブ', 'lilib']);
  assert.equal(ranked[0], target);
  assert.deepEqual(ranked.slice(1), items.slice(0, 4));
  assert.equal(JSON.stringify(items), snapshot);
  assert.ok(ranked.every((row) => items.includes(row)));
});

test('both Kana and Latin hints match a returned Latin URL slug without generated aliases', () => {
  const target = item('頭皮美容液', 'lilyeve-serum');
  for (const hint of ['リリーブ', 'LILIB', 'lilib']) {
    assert.equal(rerankGoogleMallItems([...unrelated(), target], [hint])[0], target);
  }
});

test('romanized hint can match Kana title and concatenated Kana brand/product text', () => {
  for (const title of ['リリーイブ', 'リリーイブヘアトニック']) {
    const target = item(title, 'serum');
    assert.equal(rerankGoogleMallItems([...unrelated(), target], ['ririibu'])[0], target);
  }
});

test('zero scores, ties and duplicated case variants preserve stable order', () => {
  const items = [...unrelated(), item('リリーイブ A', 'serum-a'), item('リリーイブ B', 'serum-b')];
  assert.deepEqual(rerankGoogleMallItems(items, ['unmatchedbrand']), items);
  assert.deepEqual(rerankGoogleMallItems(items, []), items);
  assert.deepEqual(rerankGoogleMallItems(items, ['LILIB', 'lilib']), rerankGoogleMallItems(items, ['lilib']));
  const ranked = rerankGoogleMallItems(items, ['リリーブ']);
  assert.deepEqual(ranked.slice(0, 2), items.slice(4));
  assert.deepEqual(ranked.slice(2), items.slice(0, 4));
});

test('short/numeric hints, hostnames and tracking query parameters are not brand evidence', () => {
  const original = [...unrelated(), { title: '頭皮美容液', url: 'https://lilyeve.qoo10.jp/item/serum?brand=lilyeve' }];
  for (const hints of [['LILIB'], ['a', 'XL', '123', '500ml'], ['ab']]) assert.deepEqual(rerankGoogleMallItems(original, hints), original);
});

test('matches percent-encoded title in URL path; malformed encoding does not throw', () => {
  const target = item('頭皮美容液', encodeURIComponent('リリーイブ'));
  const malformed = item('頭皮美容液', '%E0%A4%A');
  assert.equal(rerankGoogleMallItems([...unrelated(), malformed, target], ['リリーブ'])[0], target);
});
