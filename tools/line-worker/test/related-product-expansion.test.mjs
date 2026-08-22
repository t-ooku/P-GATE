import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { relatedProductExpansionQueries } from '../src/related-product-expansion.mjs';
import { resolveRelatedProductRecommendationQueries } from '../src/related-product-recommendations.mjs';

// 2026-08-18のユーザー指示:
//   「レコメンド提示が、検索された商品がそのまま提示されてる
//    → 関連商品を提示して。『天然石 ピアス』検索してるなら、
//      『天然石 指輪』『シルバー ピアス』とか、検索された商品からの横展開」
//   「『その商品と一緒に使うもの』と横展開どちらも提示して良いよ」

test('修飾語を保った別アイテムと、アイテムを保った別修飾語の2軸で展開する', () => {
  const result = relatedProductExpansionQueries('天然石 ピアス');
  const queries = result.map((item) => item.query);
  // 修飾語(天然石)を保ったまま同系統の別アイテムへ
  assert.ok(queries.some((q) => q.startsWith('天然石 ') && !q.includes('ピアス')), queries.join(' / '));
  // アイテム(ピアス)を保ったまま別素材へ
  assert.ok(queries.some((q) => q.endsWith(' ピアス') && !q.startsWith('天然石')), queries.join(' / '));
  assert.ok(result.every((item) => item.reason), '理由が必ず付く');
  assert.ok(result.length <= 3);
});

test('検索語そのものは提案しない', () => {
  for (const query of ['天然石 ピアス', '白いスニーカー', 'ブラウス 白']) {
    const queries = relatedProductExpansionQueries(query).map((item) => item.query.toLocaleLowerCase());
    assert.ok(!queries.includes(query.normalize('NFKC').toLocaleLowerCase()), query);
  }
});

test('排他的な修飾語は入れ替えない(涼しいブラウスに暖かいブラウスを出さない)', () => {
  const queries = relatedProductExpansionQueries('ブラウス 白 涼しい おしゃれ').map((item) => item.query);
  assert.ok(!queries.some((q) => q.includes('暖かい')), queries.join(' / '));
  // 修飾語を保った横展開自体は出る
  assert.ok(queries.some((q) => q.includes('涼しい') || q === 'シャツ' || q === 'カットソー'), queries.join(' / '));
});

test('同義語しかない語は横展開しない(カラコンにコンタクトレンズを出さない)', () => {
  assert.deepEqual(relatedProductExpansionQueries('LILMOON 1day カラコン'), []);
});

test('商品名詞を特定できない検索語では何も返さない', () => {
  assert.deepEqual(relatedProductExpansionQueries('よく分からないもの'), []);
  assert.deepEqual(relatedProductExpansionQueries(''), []);
});

test('マットレスは寝具小物ではなく本体の別候補へ横展開する', () => {
  const queries = relatedProductExpansionQueries('大きなマットレス').map((item) => item.query);
  assert.ok(queries.length > 0);
  assert.ok(queries.every((query) => query.includes('マットレス')), queries.join(' / '));
  assert.ok(!queries.includes('ベッドシーツ'));
});

test('横展開と補完提案の両方が、横展開を先にして返る', async () => {
  const merged = await resolveRelatedProductRecommendationQueries('天然石 ピアス', 'JA', {});
  const queries = merged.map((item) => item.query);
  // 横展開
  assert.ok(queries.some((q) => q.includes('天然石') && !q.includes('ピアス')), queries.join(' / '));
  // 補完提案(既存ルール由来)
  assert.ok(queries.includes('アクセサリーケース'), queries.join(' / '));
  // 横展開が先
  assert.ok(queries.indexOf('アクセサリーケース') > 0, '補完提案が横展開より前に出ている');
  // 重複なし
  assert.equal(new Set(queries.map((q) => q.toLocaleLowerCase())).size, queries.length);
});

test('横展開が無い語では従来どおり補完提案だけが返る', async () => {
  const merged = await resolveRelatedProductRecommendationQueries('LILMOON 1day カラコン', 'JA', {});
  assert.deepEqual(merged.map((item) => item.query), ['コンタクトレンズ洗浄液', 'コンタクトレンズケース', 'コンタクトレンズ装着液']);
});

test('APIは横展開と補完の両方が通る上限でグループを切る', () => {
  const source = fs.readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  // 3のままだと横展開(最大3)で埋まり補完提案が1件も出ない。
  assert.match(source, /resolveRelatedProductRecommendationQueries\(input\.query, input\.language, env\)\)\.slice\(0, 6\)/);
});
