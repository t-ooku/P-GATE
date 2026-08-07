import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSearchQuery } from '../src/query-expansion.mjs';
import { buildAmazonSearchKeywords, buildRakutenSearchKeywordCandidates, buildQoo10SearchKeywords } from '../src/index.mjs';

// v4.2 項目23: 必須回帰テスト。指示書に列挙された8つの検索語について、
// 展開の期待挙動と「合格条件：顔用扇風機 → ハンディファン」を、この1ファイル
// にまとめて固定化する。個々のロジック（展開ルールそのもの、マーケット
// プレイス別キーワード生成）は query-expansion.test.mjs / search-quality-
// regression.test.mjs 等で既にカバーされているが、指示書が名指しした8語が
// 「揃って」回帰していないことを一目で確認できる単一のスイートとして追加する。
//
// v4.2 項目24（AI会話検索: 顔用扇風機→「AIで探す」→「小さくてカバンに
// 入る」→再検索→MATCHES更新）は、UIの会話フロー自体を扱うためこのファイル
// の対象外。test/ai-search-ui.test.mjs の項目6〜9のテストと、本セッションの
// 完了報告に記載したPlaywright実機検証（scratch script、リポジトリには
// 含まれない）を参照。

const REQUIRED_QUERIES = Object.freeze([
  { query: 'カットソー', shouldExpand: false },
  { query: '顔用扇風機', shouldExpand: true, primary: 'ハンディファン' },
  { query: '暑い時に顔に風くるやつ', shouldExpand: true, primary: 'ハンディファン' },
  { query: '透明ワイヤレスイヤホン', shouldExpand: false },
  { query: '韓国っぽいバッグ', shouldExpand: false },
  { query: '旅行で荷物を小さくしたい', shouldExpand: true, primary: '圧縮ポーチ' },
  { query: 'テレビにYouTube映すやつ', shouldExpand: true, primary: 'ストリーミングデバイス' },
  // 意図的に展開してはいけない、曖昧すぎるケース。
  { query: '名前が分からないけど透明なやつ', shouldExpand: false }
]);

test('v4.2項目23: 指示書指定の8検索語すべてが正しい展開判定になる', () => {
  for (const { query, shouldExpand, primary } of REQUIRED_QUERIES) {
    const result = expandSearchQuery(query);
    assert.equal(result.expanded, shouldExpand, `${query}: expanded should be ${shouldExpand}`);
    if (shouldExpand) {
      assert.equal(result.expansion.primary, primary, `${query}: primary should be ${primary}`);
      // 元のユーザー文言も失われない。
      assert.match(result.query, new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${query}: original text should be preserved`);
    } else {
      assert.equal(result.expansion, null, `${query}: expansion should be null when not expanded`);
      assert.equal(result.query, query, `${query}: query text must be unchanged when not expanded`);
    }
  }
});

test('v4.2項目23・合格条件: 「顔用扇風機」→「ハンディファン」への展開はAmazon/楽天/Qoo10いずれのキーワード生成でも空にならない', () => {
  const expandedQuery = expandSearchQuery('顔用扇風機').query;
  assert.match(expandedQuery, /ハンディファン/);
  const amazon = buildAmazonSearchKeywords(expandedQuery);
  const qoo10 = buildQoo10SearchKeywords(expandedQuery);
  const rakuten = buildRakutenSearchKeywordCandidates(expandedQuery);
  assert.ok(amazon.length > 0);
  assert.ok(qoo10.length > 0);
  assert.ok(rakuten.length > 0 && rakuten.every((candidate) => candidate.length > 0));
  assert.match(amazon, /携帯扇風機|ハンディファン/);
});

test('v4.2項目23: 展開されない8語中の非曖昧クエリも、Amazon向けキーワード生成が空文字を返さない', () => {
  for (const { query, shouldExpand } of REQUIRED_QUERIES) {
    if (shouldExpand) continue;
    if (query === '名前が分からないけど透明なやつ') continue; // 意図的に曖昧、展開もキーワード品質保証も対象外
    const amazon = buildAmazonSearchKeywords(query);
    assert.ok(amazon.length > 0, `${query}: amazon keywords should not be empty`);
  }
});
