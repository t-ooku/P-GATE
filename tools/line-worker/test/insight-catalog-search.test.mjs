import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchCandidatesForInsight } from '../src/insight-catalog-search.mjs';

// section16: 「単純な部分文字列一致を使ってはいけない」「Teacher Dataset・
// カテゴリマッチング・ランキング基盤をできる限り再利用する」。実際に
// knowledge-search.mjs の applyIndexedSearchPolicy/filterCategoryMismatches/
// rankMerchantCandidates を呼び出していることをソース上で確認しつつ、通信・
// D1索引データを持たない環境でも安全に空配列を返すことを確認する(D1索引
// データを使ったカテゴリ不一致除去そのものの検証は、既存の
// test/knowledge-search*.test.mjs 側と、このリポジトリの重複防止ロジックを
// 検証する test/insight-routes.test.mjs 側(実際のfilterCategoryMismatches
// を使った固定データで検証)に譲る)。

test('section16: 実際のマッチング品質基盤(D1索引・カテゴリ不一致除去・ランキング)を再利用する実装になっている', () => {
  const source = readFileSync(new URL('../src/insight-catalog-search.mjs', import.meta.url), 'utf8');
  assert.match(source, /applyIndexedSearchPolicy/);
  assert.match(source, /filterCategoryMismatches/);
  assert.match(source, /rankMerchantCandidates/);
  assert.match(source, /from '\.\/knowledge-search\.mjs'/);
});

test('空文字/空白のみのクエリは検索を実行せず空配列を返す', async () => {
  assert.deepEqual(await searchCandidatesForInsight({}, ''), []);
  assert.deepEqual(await searchCandidatesForInsight({}, '   '), []);
});

test('PRODUCT_DB未設定でも例外を投げず空配列を返す(section16の基盤呼び出しがD1未設定を安全に扱う)', async () => {
  const result = await searchCandidatesForInsight({}, '白 長袖 レディース カットソー', 'JA');
  assert.deepEqual(result, []);
});

// 2026-09-16 大隆さん決定「見つかるまで探します、を実現する」: 巡回は索引だけでなく
// 楽天・Yahoo! のライブ API も呼び、識別子付きの候補として返す。
import { searchLiveCandidatesForInsight, withLiveIdentity, INSIGHT_LIVE_CANDIDATE_LIMIT } from '../src/insight-catalog-search.mjs';

test('ライブ候補は record_key から商品識別子を作り、識別子を作れないものは除外する', () => {
  const rakuten = withLiveIdentity({ record_key: 'RAKUTEN:shop:10001', offers: [{ marketplace: 'RAKUTEN_JP' }] });
  assert.equal(rakuten.marketplace, 'RAKUTEN_JP');
  assert.equal(rakuten.product_id, 'shop:10001');
  assert.equal(rakuten.insight_source, 'LIVE');
  const yahoo = withLiveIdentity({ record_key: 'JAN:4901234567890', offers: [{ marketplace: 'YAHOO_JP' }] });
  assert.equal(yahoo.marketplace, 'YAHOO_JP');
  assert.equal(yahoo.product_id, '4901234567890');
  assert.equal(withLiveIdentity({ record_key: 'RAKUTEN:https://item.rakuten.co.jp/a/b', offers: [{ marketplace: 'RAKUTEN_JP' }] }), null);
  assert.equal(withLiveIdentity({ record_key: 'RAKUTEN:x', offers: [] }), null);
});

test('楽天 API の実応答形式から、カテゴリ不一致除去を通した上位候補だけを返す（上限あり）', async () => {
  const items = Array.from({ length: 30 }, (_, index) => ({
    itemName: `マルアイ 底部開口 封筒 角2 ${index + 1}`, itemCode: `maruai:${1000 + index}`, itemPrice: 500 + index,
    itemUrl: `https://item.rakuten.co.jp/maruai/${1000 + index}/`, mediumImageUrls: [{ imageUrl: 'https://thumbnail.image.rakuten.co.jp/a.jpg' }], availability: 1, postageFlag: 0
  }));
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ items }) });
  const env = { RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'key' };
  const result = await searchLiveCandidatesForInsight(env, 'マルアイ 底部開口 封筒', fetcher);
  assert.ok(result.length > 0 && result.length <= INSIGHT_LIVE_CANDIDATE_LIMIT);
  assert.ok(result.every((candidate) => candidate.marketplace === 'RAKUTEN_JP' && candidate.product_id.startsWith('maruai:')));
});

test('INSIGHT_LIVE_MARKETPLACES=0 と API 未設定ではライブ呼び出しをしない', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ items: [] }) }; };
  assert.deepEqual(await searchLiveCandidatesForInsight({ RAKUTEN_APPLICATION_ID: 'a', RAKUTEN_ACCESS_KEY: 'k', INSIGHT_LIVE_MARKETPLACES: '0' }, '封筒', fetcher), []);
  assert.deepEqual(await searchLiveCandidatesForInsight({}, '封筒', fetcher), []);
  assert.equal(calls, 0);
});

test('ライブ API が失敗しても巡回は索引候補で続く（例外にしない）', async () => {
  const fetcher = async () => { throw new Error('network'); };
  const env = { RAKUTEN_APPLICATION_ID: 'a', RAKUTEN_ACCESS_KEY: 'k' };
  assert.deepEqual(await searchCandidatesForInsight(env, '封筒', 'JA', fetcher), []);
});
