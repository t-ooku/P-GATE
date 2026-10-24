// 2026-10-17 固定QA dark_ink_name_pen(受信箱 2026-10-17-name-pen-candidate-fallback):
// 主名詞ゲート修正(#642)後も、モール検索の1つ目の語「濃く書ける お名前ペン」の結果が
// 全件「名入れ ボールペン」で、それが「0件でない」だけで採用され、正しい「お名前ペン」の
// 語へ進まなかった。最後のゲートは全件不一致なら元順序を残すため、名入れボールペンが本命になった。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketplaceApiKeywordCandidates, buildRakutenSearchKeywordCandidates,
  searchMarketplaceApiWithFallback, yahooKeywordsFor
} from '../src/index.mjs';
import { searchRakutenMarketplaceWithFallback } from '../src/rakuten-marketplace-api.mjs';
import { applyHeadNounGate, hasHeadNounMatch } from '../src/search-head-noun.mjs';
import { expandSearchQuery, headNounGateQuery, headNounGateQueryFor } from '../src/query-expansion.mjs';

const QUERY = 'お名前ペンで書いた文字がすぐ薄くなって読めない';
const EXPANDED = expandSearchQuery(QUERY).query;
const GATE = headNounGateQuery(expandSearchQuery(QUERY));

const product = (name, id = name) => ({ product_name: name, record_key: `TEST:${id}` });
const BALLPOINTS = [
  product('名入れ パイロット PILOT ボールペン アクロ1000 Acro1000 ブラック油性ボールペン 0.5mm極細', 'acro'),
  product('名入れ ボールペン ジェットストリーム 3色 記念品', 'jet'),
  product('サインペン 水性 黒 10本', 'sign')
];
const NAME_PENS = [
  product('パイロット お名前ペン 布用 極細 太字 ツイン 黒', 'pilot-name'),
  product('シヤチハタ 布用 おなまえペン にじまない 名前ペン', 'shachihata-name')
];

test('展開済みの検索文からもゲート用クエリ(primary を末尾に足したもの)を作れる', () => {
  assert.equal(headNounGateQueryFor(EXPANDED), GATE);
  assert.ok(GATE.endsWith('お名前ペン'));
});

test('hasHeadNounMatch: 全件不適合(名入れボールペン・サインペン)は false、正候補が混ざれば true', () => {
  assert.equal(hasHeadNounMatch(GATE, BALLPOINTS), false);
  assert.equal(hasHeadNounMatch(GATE, [...BALLPOINTS, NAME_PENS[0]]), true);
  assert.equal(hasHeadNounMatch(GATE, NAME_PENS), true);
  // 通常のボールペン検索では名入れボールペンも商品そのもの
  assert.equal(hasHeadNounMatch('ボールペン', BALLPOINTS.slice(0, 2)), true);
  // 主名詞が取れない検索文は判定しない
  assert.equal(hasHeadNounMatch('あれ', BALLPOINTS), true);
});

test('モール検索語: 展開規則に当たる時は2番目にカテゴリ語「お名前ペン」を試す(通常検索は変えない)', () => {
  const yahoo = buildMarketplaceApiKeywordCandidates(EXPANDED, yahooKeywordsFor(EXPANDED), yahooKeywordsFor(EXPANDED), EXPANDED);
  assert.deepEqual(yahoo.slice(0, 2), ['濃く書ける お名前ペン', 'お名前ペン']);
  const rakuten = buildRakutenSearchKeywordCandidates(EXPANDED, EXPANDED);
  assert.deepEqual(rakuten.slice(0, 2), ['濃く書ける お名前ペン', 'お名前ペン']);
  assert.deepEqual(buildMarketplaceApiKeywordCandidates('ボールペン', yahooKeywordsFor('ボールペン'), yahooKeywordsFor('ボールペン'), 'ボールペン'), ['ボールペン']);
  assert.deepEqual(buildRakutenSearchKeywordCandidates('ボールペン', 'ボールペン'), ['ボールペン']);
  assert.deepEqual(buildRakutenSearchKeywordCandidates('お名前ペン', 'お名前ペン'), ['お名前ペン']);
});

test('Yahoo!系の段階検索: 1つ目の語が全件不適合なら次の語(お名前ペン)の結果を採用する', async () => {
  const requested = [];
  const result = await searchMarketplaceApiWithFallback(async (keywords) => {
    requested.push(keywords);
    return keywords === 'お名前ペン' ? NAME_PENS : BALLPOINTS;
  }, ['濃く書ける お名前ペン', 'お名前ペン'], EXPANDED, EXPANDED, { maxVariants: 2 });
  assert.deepEqual(requested, ['濃く書ける お名前ペン', 'お名前ペン']);
  assert.deepEqual(result, NAME_PENS);
});

test('Yahoo!系の段階検索: 正候補が混ざっていれば1つ目で止める(追加の呼び出しなし)', async () => {
  const requested = [];
  const mixed = [...BALLPOINTS, NAME_PENS[1]];
  const result = await searchMarketplaceApiWithFallback(async (keywords) => {
    requested.push(keywords);
    return mixed;
  }, ['濃く書ける お名前ペン', 'お名前ペン'], EXPANDED, EXPANDED, { maxVariants: 2 });
  assert.deepEqual(requested, ['濃く書ける お名前ペン']);
  assert.equal(result, mixed);
});

test('Yahoo!系の段階検索: 次の語も不適合・0件・失敗・締め切り超過なら最初の結果を残す(空にしない)', async () => {
  for (const second of [async () => BALLPOINTS.slice(2), async () => [], async () => { throw new Error('UPSTREAM'); }]) {
    let call = 0;
    const result = await searchMarketplaceApiWithFallback(async () => (call++ === 0 ? BALLPOINTS : second()),
      ['濃く書ける お名前ペン', 'お名前ペン'], EXPANDED, EXPANDED, { maxVariants: 2 });
    assert.deepEqual(result, BALLPOINTS);
  }
  const requested = [];
  const late = await searchMarketplaceApiWithFallback(async (keywords) => { requested.push(keywords); return BALLPOINTS; },
    ['濃く書ける お名前ペン', 'お名前ペン'], EXPANDED, EXPANDED,
    { maxVariants: 2, deadlineAt: Date.now() - 1, nextVariantCostMs: 3600 });
  assert.deepEqual(requested, ['濃く書ける お名前ペン']);
  assert.deepEqual(late, BALLPOINTS);
});

test('Yahoo!系の段階検索: 1つ目の語が失敗したら従来どおり失敗を返す(控えが無い時)', async () => {
  await assert.rejects(searchMarketplaceApiWithFallback(async () => { throw new Error('AUTH'); },
    ['濃く書ける お名前ペン', 'お名前ペン'], EXPANDED, EXPANDED, { maxVariants: 2 }), /AUTH/);
});

test('通常のボールペン検索は名入れボールペンを1つ目の語で採用し、壊れない', async () => {
  const requested = [];
  const result = await searchMarketplaceApiWithFallback(async (keywords) => { requested.push(keywords); return BALLPOINTS.slice(0, 2); },
    ['ボールペン', 'ボールペン 黒'], 'ボールペン', 'ボールペン', { maxVariants: 2 });
  assert.deepEqual(requested, ['ボールペン']);
  assert.deepEqual(result, BALLPOINTS.slice(0, 2));
  assert.deepEqual(applyHeadNounGate('ボールペン', BALLPOINTS.slice(0, 2)), BALLPOINTS.slice(0, 2));
});

const env = { RAKUTEN_APPLICATION_ID: 'app-id', RAKUTEN_ACCESS_KEY: 'access-key', RAKUTEN_AFFILIATE_ID: 'affiliate-id' };
const rakutenItem = (itemName, id) => ({ itemName, itemCode: `shop:${id}`, itemPrice: 1200, itemUrl: `https://item.rakuten.co.jp/shop/${id}/`, availability: 1 });

test('楽天の段階検索: 1つ目の語が全件名入れボールペンなら「お名前ペン」の結果を採用、どれも不適合なら最初を残す', async () => {
  const fetcher = (byKeyword) => async (url) => {
    const keyword = new URL(url).searchParams.get('keyword');
    return { ok: true, async json() { return { items: byKeyword[keyword] || [] }; } };
  };
  const ballpoints = [rakutenItem('名入れ ボールペン ジェットストリーム 記念品', 'jet')];
  const namePens = [rakutenItem('パイロット お名前ペン 布用 ツイン 黒', 'name')];
  const picked = await searchRakutenMarketplaceWithFallback(env, ['濃く書ける お名前ペン', 'お名前ペン'],
    fetcher({ '濃く書ける お名前ペン': ballpoints, 'お名前ペン': namePens }), EXPANDED, '', EXPANDED);
  assert.equal(picked.length, 1);
  assert.match(picked[0].product_name || picked[0].display_name || picked[0].name, /お名前ペン/u);
  const kept = await searchRakutenMarketplaceWithFallback(env, ['濃く書ける お名前ペン', 'お名前ペン'],
    fetcher({ '濃く書ける お名前ペン': ballpoints }), EXPANDED, '', EXPANDED);
  assert.equal(kept.length, 1);
  assert.match(kept[0].product_name || kept[0].display_name || kept[0].name, /名入れ ボールペン/u);
});

test('最終ゲート: 正候補が混在すれば布用名前ペンが本命、全件不適合でもボールペン以外は元順序のまま(空にしない)', () => {
  const pool = [...BALLPOINTS, ...NAME_PENS];
  const gated = applyHeadNounGate(GATE, pool);
  assert.match(gated[0].product_name, /お名前ペン|名前ペン/u);
  assert.ok(gated.every((item) => !/名入れ/u.test(item.product_name)));
  // 2026-10-24: 名入れボールペンは全件不一致のフォールバックでも戻さない(下の 10/24 テスト)。
  // 明示的なカテゴリ違い以外(サインペン)は従来どおり空にしない。
  assert.deepEqual(applyHeadNounGate(GATE, BALLPOINTS), [BALLPOINTS[2]]);
});

// 2026-10-24 固定QA dark_ink_name_pen(受信箱 2026-10-24-name-pen-semantic-mismatch):
// 10/22・10/23 は候補7件・上位3件に名前ペン無し・本命の主名詞0で「名入れ … 油性ボールペン」が本命。
// 10/17 の修正(候補取得の段階検索)は、モールがどの語でも名前ペンを返さない時は効かない。
test('10/24: モールが名前ペンを返さない時、名入れ/通常の油性ボールペンを本命にしない(候補なしへ安全に倒す)', () => {
  const acro = product('名入れ パイロット PILOT ボールペン アクロ1000 Acro1000 ブラック油性ボールペン 0.5mm極細 BAC-1SEF/0.7mm細字 BAC-', 'acro-0.5');
  const plain = product('三菱鉛筆 油性ボールペン ジェットストリーム 0.7 黒', 'jet-plain');
  // 固定fixture の検索文(原文・展開後のゲート用クエリとも)
  for (const query of [QUERY, GATE]) {
    assert.deepEqual(applyHeadNounGate(query, [acro]), []);
    assert.deepEqual(applyHeadNounGate(query, [acro, plain, BALLPOINTS[1]]), []);
    const mixed = applyHeadNounGate(query, [acro, plain, NAME_PENS[1]]);
    assert.equal(mixed[0], NAME_PENS[1]);
    assert.ok(mixed.every((item) => !/ボールペン/u.test(item.product_name)));
  }
  // 名前ペン・布用と書いてある商品は商品名にボールペンがあっても残す
  const fabricBallpoint = product('布用 お名前 ボールペン 名前書き 黒', 'fabric-ballpoint');
  assert.deepEqual(applyHeadNounGate(GATE, [acro, fabricBallpoint]), [fabricBallpoint]);
  // ボールペン・名入れを探す検索は従来どおり(名入れボールペンも商品そのもの)
  assert.deepEqual(applyHeadNounGate('ボールペン', [acro, plain]), [acro, plain]);
  assert.deepEqual(applyHeadNounGate('名入れ ボールペン', [acro]), [acro]);
  assert.deepEqual(applyHeadNounGate('お名前ペン ボールペン', [acro]), [acro]);
});
