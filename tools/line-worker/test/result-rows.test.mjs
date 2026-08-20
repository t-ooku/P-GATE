import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  RESULT_ROW_LIMIT,
  candidateHasConfirmedPrice,
  candidateOffers,
  fallbackRecommendationCandidates,
  resultRowCopy,
  resultRowCopyFor,
  recommendationReason,
  splitCandidateRows
} from '../public/result-rows.mjs';
import { CLIENT_CANDIDATE_LIMIT, CLIENT_CANDIDATE_ROW_LIMIT } from '../src/index.mjs';

const priced = (marketplace, total) => ({
  marketplace,
  total_cost: total,
  currency: 'JPY',
  tracking_url: `https://hoshilu.app/go?token=${marketplace}`
});
const unpriced = (marketplace) => ({
  marketplace,
  total_cost: 0,
  currency: 'JPY',
  tracking_url: `https://hoshilu.app/go?token=${marketplace}`
});

test('送料込みの合計金額が確認できた商品だけを「確認済み」と判定する', () => {
  assert.equal(candidateHasConfirmedPrice({ offers: [priced('AMAZON_JP', 2480)] }), true);
  assert.equal(candidateHasConfirmedPrice({ offers: [unpriced('ZOZOTOWN')] }), false);
  // 金額はあってもリンクが無ければ買いに行けないので未確認扱い
  assert.equal(candidateHasConfirmedPrice({ offers: [{ marketplace: 'BUYMA', total_cost: 3900 }] }), false);
  // 数値化できない値・負の値・欠損はすべて未確認
  assert.equal(candidateHasConfirmedPrice({ offers: [{ ...priced('SHEIN_JP', 0), total_cost: '要問合せ' }] }), false);
  assert.equal(candidateHasConfirmedPrice({ offers: [{ ...priced('SHEIN_JP', 0), total_cost: -1 }] }), false);
  assert.equal(candidateHasConfirmedPrice({ offers: [{ ...priced('SHEIN_JP', 0), total_cost: null }] }), false);
  // offers が空なら selected_offer にフォールバックする
  assert.equal(candidateHasConfirmedPrice({ offers: [], selected_offer: priced('RAKUTEN_JP', 1200) }), true);
  assert.equal(candidateHasConfirmedPrice({}), false);
  assert.equal(candidateHasConfirmedPrice(null), false);
  // 1モールでも確定していれば上段に出る
  assert.equal(
    candidateHasConfirmedPrice({ offers: [unpriced('MUSINSA'), priced('YAHOO_JP', 990)] }),
    true
  );
});

test('selected_offer が null のときに空offerを混ぜない', () => {
  assert.deepEqual(candidateOffers({ offers: [], selected_offer: null }), []);
  assert.equal(candidateOffers({ offers: [priced('AMAZON_JP', 100)] }).length, 1);
});

test('提示欄を上段（価格確定）と下段（価格・在庫未確認）に分ける', () => {
  const candidates = [
    { asin: 'A', offers: [priced('AMAZON_JP', 1000)] },
    { asin: 'B', offers: [unpriced('ZOZOTOWN')] },
    { asin: 'C', offers: [priced('RAKUTEN_JP', 2000)] },
    { asin: 'D', offers: [] }
  ];
  const { confirmed, unconfirmed } = splitCandidateRows(candidates);
  assert.deepEqual(confirmed.map((item) => item.asin), ['A', 'C']);
  assert.deepEqual(unconfirmed.map((item) => item.asin), ['B', 'D']);
  // 元の並び順（ランキング順）は段の中で保たれる
  assert.deepEqual(splitCandidateRows([]).confirmed, []);
  assert.deepEqual(splitCandidateRows(undefined).unconfirmed, []);
});

test('2段目の横展開レコメンドは選定理由を表示できる', () => {
  assert.match(recommendationReason({ evidence:{ matched_terms:['冷却','首掛け'] } }),/冷却・首掛け/);
  assert.equal(resultRowCopy.JA.unconfirmedTitle,'HOSHILU AI選定レコメンド');
});

test('関連APIが失敗しても主検索の実在商品から横レコメンドを必ず作る', () => {
  const confirmed = [
    { asin: 'TOP', offers: [priced('RAKUTEN_JP', 1000)] },
    { asin: 'NEXT', offers: [priced('YAHOO_JP', 1200)] }
  ];
  assert.deepEqual(fallbackRecommendationCandidates({ confirmed, unconfirmed: [] }), {
    candidates: [confirmed[1]], confirmed: true
  });
  assert.deepEqual(fallbackRecommendationCandidates({ confirmed: [confirmed[0]], unconfirmed: [] }), {
    candidates: [confirmed[0]], confirmed: true
  });
  const unconfirmed = [{ asin: 'REAL', offers: [unpriced('ZOZOTOWN')] }];
  assert.deepEqual(fallbackRecommendationCandidates({ confirmed, unconfirmed }), {
    candidates: unconfirmed, confirmed: false
  });
});

test('各段は最大30件、合計60件までを取り込む', () => {
  assert.equal(RESULT_ROW_LIMIT, 30);
  const candidates = [
    ...Array.from({ length: 40 }, (_, i) => ({ asin: `P${i}`, offers: [priced('AMAZON_JP', 100 + i)] })),
    ...Array.from({ length: 40 }, (_, i) => ({ asin: `U${i}`, offers: [unpriced('SHOPLIST')] }))
  ];
  const { confirmed, unconfirmed } = splitCandidateRows(candidates);
  assert.equal(confirmed.length, 30);
  // 先頭60件しか見ないので、61件目以降の未確認商品は取り込まれない
  assert.equal(unconfirmed.length, 20);
  assert.equal(confirmed.length + unconfirmed.length, 50);
});

// Worker側が30件で切っていると、下段は上段を痩せさせない限り埋まらない。
// 2段構成にした時点で送信上限を60件へ引き上げてある。
test('Workerの送信上限は2段ぶん（60件）に引き上げられている', async () => {
  assert.equal(CLIENT_CANDIDATE_ROW_LIMIT, RESULT_ROW_LIMIT);
  assert.equal(CLIENT_CANDIDATE_LIMIT, RESULT_ROW_LIMIT * 2);
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /filterCategoryMismatches\([^)]*\)\.slice\(0, 30\)/);
  assert.match(source, /const finalSlice = rankedAll\.slice\(0, CLIENT_CANDIDATE_LIMIT\);/);
});

test('4言語すべてに2段の見出し・説明・バッジがある', () => {
  for (const language of ['JA', 'EN', 'ZH', 'KO']) {
    const copy = resultRowCopy[language];
    for (const key of ['confirmedTitle', 'confirmedNote', 'unconfirmedTitle', 'unconfirmedNote', 'verifiedRecommendationTitle', 'verifiedRecommendationNote', 'badge']) {
      assert.equal(typeof copy[key], 'string', `${language}.${key}`);
      assert.ok(copy[key].length > 0, `${language}.${key}`);
    }
  }
  assert.equal(resultRowCopyFor('ZZ'), resultRowCopy.JA);
  assert.equal(resultRowCopyFor(undefined), resultRowCopy.JA);
});

// 「AIは理解する。HOSHILUは探す。」- 下段は価格を推測しないことが前提なので、
// 未確認であることの明示が消えたら仕様違反。
test('下段の文言は価格を推測しないと明言し、未確認バッジを出す', async () => {
  assert.match(resultRowCopy.JA.unconfirmedNote, /価格・在庫は/);
  assert.match(resultRowCopy.EN.unconfirmedNote, /price and availability/);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /splitCandidateRows\(result\.candidates,RESULT_ROW_LIMIT\)/);
  assert.match(app, /'product-card unverified-card'/);
  assert.match(app, /'unverified-badge'/);
  assert.match(app, /result-row-\$\{rowKind\}/);
  assert.match(app, /AI選定理由/);
  assert.match(app, /fetch\('\/api\/related-recommendations'/);
  assert.match(app, /function scheduleRelatedRecommendations/);
  assert.match(app, /scheduleRelatedRecommendations\(effectiveQuery\|\|submittedQuery,sequence\)/);
  assert.match(app, /renderResults\(fallback,lastRequestId\);[\s\S]*?scheduleRelatedRecommendations\(submittedQuery,sequence\)/);
  assert.match(app, /async function loadRelatedRecommendations[\s\S]*?takeReadyTurnstileToken\(\)/);
  assert.match(app, /related_category_recommendations/);
  assert.match(app, /function relatedCategoryCard/);
  assert.match(app, /function recommendationRowFor/);
  assert.match(app, /fallbackRecommendationCandidates\(candidateRows,RESULT_ROW_LIMIT\)/);
  assert.match(app, /recommendationProducts='true'/);
  assert.match(app, /oldRow\?\.dataset\.recommendationProducts===\'true\'/);
  assert.match(app, /sequence!==relatedRecommendationSequence\|\|!token\)return/);
  assert.doesNotMatch(app, /async function loadRelatedRecommendations[\s\S]{0,1800}?recoverTurnstileWidget\(\)/);
  assert.match(app, /timedAbortController\(12000\)/);
  assert.doesNotMatch(app, /if\(!recommendations\.length\)\{oldRow\?\.remove\(\);return;\}/);
  assert.match(app, /categories\.map\(relatedCategoryCard\)/);
  assert.doesNotMatch(app, /waitForFreshTurnstileToken/);
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.product-card\.unverified-card\{/);
  assert.match(css, /\.unverified-badge\{/);
  assert.match(css, /\.result-row-recommended \.result-row-title\{/);
  assert.match(css, /\.result-row-recommended \.result-track\{[^}]*flex-direction:row[^}]*overflow-x:auto[^}]*overflow-y:hidden[^}]*scroll-snap-type:x mandatory/);
  assert.doesNotMatch(app, /if\(rowKind!==\'recommended\'\)attachVerticalTicker/);
  assert.match(app, /const horizontal=rowKind===\'recommended\'/);
});

test('新しいモジュールはService Workerのプリキャッシュに含まれる', async () => {
  const sw = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');
  assert.match(sw, /'\/result-rows\.mjs'/);
  assert.match(sw, /hoshilu-shell-v393/);
});
