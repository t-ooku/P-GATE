import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSIGHT_EVENT_TYPE, INSIGHT_MAX_NEW_MATCHES_PER_WISH,
  buildConditionSnapshot, serializeConditionSnapshot, parseConditionSnapshot,
  candidateIdentityKey, filterNewMatches, buildInsightMatchNotification, detectNewMatchesForWish
} from '../src/insight-search-watch.mjs';

// HOSHILU INSIGHT 通知仕様変更指示書 v1.0 section19の最小テスト項目のうち、
// 純粋関数(通信なし)だけで検証できるものをここに集約する。

test('section6: 保存条件スナップショットは最低限のフィールドを持ち、拡張可能', () => {
  const snapshot = buildConditionSnapshot({
    queryText: '白 長袖 レディース カットソー',
    normalizedQueryText: '白 長袖 レディース カットソー',
    searchIntent: { garment: 'カットソー' },
    category: 'アパレル',
    keyAttributes: ['白', '長袖', 'レディース'],
    priceCondition: { max: 5000 },
    marketplaceCondition: { marketplaces: ['AMAZON_JP'] }
  });
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'category', 'key_attributes', 'marketplace_condition', 'normalized_query_text',
    'price_condition', 'query_text', 'search_intent'
  ].sort());
  assert.equal(snapshot.category, 'アパレル');
  assert.deepEqual(snapshot.key_attributes, ['白', '長袖', 'レディース']);
  const roundTripped = parseConditionSnapshot(serializeConditionSnapshot(snapshot));
  assert.deepEqual(roundTripped, snapshot);
});

test('未設定フィールドはnull/空のままで良い(将来の条件チップUI用の構造だけ用意する)', () => {
  const snapshot = buildConditionSnapshot({ queryText: 'カメラ' });
  assert.equal(snapshot.search_intent, null);
  assert.equal(snapshot.price_condition, null);
  assert.equal(snapshot.marketplace_condition, null);
  assert.deepEqual(snapshot.key_attributes, []);
});

test('section3・4: 商品識別子はASIN/モールIDベースで、タイトル文字列に依存しない', () => {
  const a = { asin: 'B000TEST01', marketplace: 'AMAZON_JP', display_name: '白いカットソー' };
  const b = { asin: 'B000TEST01', marketplace: 'AMAZON_JP', display_name: '白いカットソー【新品】' };
  assert.equal(candidateIdentityKey(a), candidateIdentityKey(b));
  assert.equal(candidateIdentityKey(a), 'AMAZON_JP:B000TEST01');
});

test('識別子を持たない候補は安全側に倒して新着判定から除外する', () => {
  const fresh = filterNewMatches([{ display_name: '謎の商品' }], new Set());
  assert.deepEqual(fresh, []);
});

test('section3・4: 既に通知済みの商品は二度と新着として通知しない', () => {
  const candidates = [
    { asin: 'B000A', marketplace: 'AMAZON_JP' },
    { asin: 'B000B', marketplace: 'AMAZON_JP' }
  ];
  const alreadyMatchedKeys = new Set(['AMAZON_JP:B000A']);
  const fresh = filterNewMatches(candidates, alreadyMatchedKeys);
  assert.deepEqual(fresh.map((item) => item.product_identity_key), ['AMAZON_JP:B000B']);
});

test('同一実行内で同じ商品が重複して渡されても1件にまとめる', () => {
  const candidates = [
    { asin: 'B000A', marketplace: 'AMAZON_JP' },
    { asin: 'B000A', marketplace: 'AMAZON_JP' }
  ];
  const fresh = filterNewMatches(candidates, new Set());
  assert.equal(fresh.length, 1);
});

test('section7・8: 複数の新着商品を1件のバッチ通知にまとめ、商品ごとの個別通知は作らない', () => {
  const newMatches = filterNewMatches([
    { asin: 'B000A', marketplace: 'AMAZON_JP', image_url: 'https://example.test/a.jpg' },
    { asin: 'B000B', marketplace: 'RAKUTEN_JP' },
    { asin: 'B000C', marketplace: 'YAHOO_JP' }
  ], new Set());
  const notification = buildInsightMatchNotification({
    memberId: 'member-1', wishId: 'wish-1', queryText: '白 長袖 レディース カットソー',
    newMatches, language: 'JA', resultUrl: 'https://hoshilu.app/?q=abc'
  });
  assert.equal(notification.event_type, INSIGHT_EVENT_TYPE);
  assert.match(notification.title, /白 長袖 レディース カットソー/);
  assert.match(notification.body, /3商品見つかりました/);
  assert.equal(notification.match_count, 3);
  assert.equal(notification.image_url, 'https://example.test/a.jpg');
  assert.equal(notification.result_url, 'https://hoshilu.app/?q=abc');
});

test('section17: 0件マッチは正常系であり、何も通知しない', () => {
  const { notification, newMatches } = detectNewMatchesForWish({
    memberId: 'member-1', wishId: 'wish-1', queryText: 'カメラ', candidates: [], alreadyMatchedKeys: new Set()
  });
  assert.equal(notification, null);
  assert.deepEqual(newMatches, []);
});

test('1条件の新着記録はD1予算保護のため上位5件までに制限する', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    asin: `B000${index}`, marketplace: 'AMAZON_JP', display_name: `商品${index}`
  }));
  const { notification, newMatches } = detectNewMatchesForWish({
    memberId: 'm1', wishId: 'w1', queryText: '商品', candidates, alreadyMatchedKeys: new Set()
  });
  assert.equal(INSIGHT_MAX_NEW_MATCHES_PER_WISH, 5);
  assert.equal(newMatches.length, 5);
  assert.equal(notification.match_count, 5);
});

test('section3: INSIGHTの通知種別はAIウォッチの4種別(値下げ/クーポン/再入荷/販売開始)と重複しない', () => {
  assert.equal(INSIGHT_EVENT_TYPE, 'INSIGHT_NEW_MATCH');
  assert.ok(!['SALE_START', 'PRICE_DROP', 'COUPON', 'RESTOCK'].includes(INSIGHT_EVENT_TYPE));
});
