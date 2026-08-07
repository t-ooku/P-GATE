import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expandSearchQuery,
  findExpansionRule,
  QUERY_EXPANSION_WEIGHTS,
  queryExpansionRuleIds
} from '../src/query-expansion.mjs';
import { buildAmazonSearchKeywords, buildRakutenSearchKeywordCandidates } from '../src/index.mjs';

// v4.2 合格条件: 「顔用扇風機」→ ハンディファン
test('顔用扇風機はハンディファンへ展開される(合格条件)', () => {
  const result = expandSearchQuery('顔用扇風機');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'handheld-fan');
  assert.equal(result.expansion.primary, 'ハンディファン');
  assert.match(result.query, /ハンディファン/);
  // ユーザーの元の文言(修飾語)は失われない
  assert.match(result.query, /顔用扇風機/);
});

test('「暑い時に顔に風くるやつ」のような口語表現もハンディファンへ展開される', () => {
  const result = expandSearchQuery('暑い時に顔に風くるやつ');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.primary, 'ハンディファン');
});

// 展開後のクエリが、実際に既存のマーケットプレイス向けキーワード生成器を通して
// 「携帯扇風機」という実在する購入可能カテゴリへつながることを確認する。
// marketplace-search-keywords-v2.mjs のGENERIC_PRODUCTSは既に「ハンディファン」
// を「携帯扇風機」の別名として認識しているため、query-expansion層はそれ以外の
// モジュールを一切改修せずに正しい検索結果へつながる。
test('展開後のクエリはAmazon/楽天向けキーワード生成で実在する「携帯扇風機」カテゴリへつながる', () => {
  const expanded = expandSearchQuery('顔用扇風機').query;
  const amazonKeywords = buildAmazonSearchKeywords(expanded);
  assert.match(amazonKeywords, /携帯扇風機/);
  const rakutenCandidates = buildRakutenSearchKeywordCandidates(expanded);
  assert.ok(rakutenCandidates.some((candidate) => /携帯扇風機/.test(candidate)));
});

test('スマホの電気なくなった時のやつ、はモバイルバッテリーへ展開される', () => {
  const result = expandSearchQuery('スマホの電気なくなった時のやつ');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'power-bank');
  assert.equal(result.expansion.primary, 'モバイルバッテリー');
});

test('服のシワ取るやつ、は衣類スチーマーへ展開される', () => {
  const result = expandSearchQuery('服のシワ取るやつ');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'garment-steamer');
  assert.equal(result.expansion.primary, '衣類スチーマー');
});

test('旅行で服を小さくするやつ、圧縮ポーチへ展開される', () => {
  const result = expandSearchQuery('旅行で服を小さくするやつ');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'compression-pouch');
  assert.equal(result.expansion.primary, '圧縮ポーチ');
});

test('旅行で荷物を小さくしたい、も圧縮ポーチへ展開される(v4.2回帰テスト語)', () => {
  const result = expandSearchQuery('旅行で荷物を小さくしたい');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'compression-pouch');
});

test('テレビにYouTube映すやつ、はストリーミングデバイスへ展開される', () => {
  const result = expandSearchQuery('テレビにYouTube映すやつ');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'streaming-device');
  assert.equal(result.expansion.primary, 'ストリーミングデバイス');
});

test('耳につける線ないやつ、はワイヤレスイヤホンへ展開される', () => {
  const result = expandSearchQuery('耳につける線ないやつ');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'wireless-earphones');
  assert.equal(result.expansion.primary, 'ワイヤレスイヤホン');
});

// 既に正式名詞そのものの検索や、スタイル修飾だけの検索は誤って展開しない。
test('カットソーのような既存の正式商品名は展開しない', () => {
  const result = expandSearchQuery('カットソー');
  assert.equal(result.expanded, false);
  assert.equal(result.query, 'カットソー');
});

test('透明ワイヤレスイヤホンのように既に正式名詞を含む検索は展開しない', () => {
  const result = expandSearchQuery('透明ワイヤレスイヤホン');
  assert.equal(result.expanded, false);
});

test('韓国っぽいバッグのようなスタイル修飾+正式名詞は展開しない', () => {
  const result = expandSearchQuery('韓国っぽいバッグ');
  assert.equal(result.expanded, false);
});

// v4.2 明示要件: 曖昧すぎるクエリは意図的に展開してはいけない。
test('名前が分からないけど透明なやつ、は曖昧すぎるため誤展開しない', () => {
  const result = expandSearchQuery('名前が分からないけど透明なやつ');
  assert.equal(result.expanded, false);
  assert.equal(result.expansion, null);
  assert.equal(result.query, '名前が分からないけど透明なやつ');
});

test('既に primary 語を含むクエリへ再展開しても重複挿入しない(冪等性)', () => {
  const once = expandSearchQuery('顔用扇風機');
  const twice = expandSearchQuery(once.query);
  assert.equal(twice.query, once.query);
});

test('primary/synonym/related/broad の重みは降順に定義されている', () => {
  assert.ok(QUERY_EXPANSION_WEIGHTS.primary > QUERY_EXPANSION_WEIGHTS.synonym);
  assert.ok(QUERY_EXPANSION_WEIGHTS.synonym > QUERY_EXPANSION_WEIGHTS.related);
  assert.ok(QUERY_EXPANSION_WEIGHTS.related > QUERY_EXPANSION_WEIGHTS.broad);
});

test('各展開ルールはsynonym/related/broadを持つ', () => {
  for (const ruleId of queryExpansionRuleIds) {
    const sample = {
      'handheld-fan': '顔用扇風機',
      'power-bank': 'スマホの電気なくなった時のやつ',
      'garment-steamer': '服のシワ取るやつ',
      'compression-pouch': '旅行で服を小さくするやつ',
      'streaming-device': 'テレビにYouTube映すやつ',
      'wireless-earphones': '耳につける線ないやつ'
    }[ruleId];
    assert.ok(sample, `sample query missing for rule ${ruleId}`);
    const result = expandSearchQuery(sample);
    assert.equal(result.expansion.rule_id, ruleId);
    assert.ok(result.expansion.synonyms.length > 0, `${ruleId} should define synonyms`);
    assert.ok(Array.isArray(result.expansion.related));
    assert.ok(Array.isArray(result.expansion.broad));
  }
});

test('findExpansionRuleは展開せずルール定義そのものを取得できる', () => {
  const rule = findExpansionRule('顔用扇風機');
  assert.equal(rule.id, 'handheld-fan');
  assert.equal(rule.primary, 'ハンディファン');
});

test('2文字未満やnull/undefinedでも例外を投げない', () => {
  assert.doesNotThrow(() => expandSearchQuery(''));
  assert.doesNotThrow(() => expandSearchQuery(null));
  assert.doesNotThrow(() => expandSearchQuery(undefined));
  assert.equal(expandSearchQuery(null).expanded, false);
});
