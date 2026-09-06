// 2026-09-06 大隆さん指摘:「検索窓に入力した際に、連想や関連するセカンドワードが候補に
// 上がってこないのも改善。Amazonと同等レベルに仕上げて」。
// 手書き辞書だけでなく、実際の在庫(product_search)と教師データからも候補を出す。
// 在庫の商品名は型番や売り文句だらけなので、出す語の条件を厳しくしていることを検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSuggestQuery, suggestMatchExpression, relatedWordsFromTitles, suggestFromData, handleSearchSuggestRoute
} from '../src/search-suggest-api.mjs';

const EARPHONES = [
  'Pryme Mirage SPM-1363 QD イヤホン Motorola Spirit Talkabout 1ピン',
  'Shure KSE1500 静電式イヤホンシステム デジタル アナログ',
  'Califone E2 イヤホン ブラック',
  'JVC HARX900 ヘッドホン イヤホン 並行輸入品',
  '3.5mm ヘッドセット ヘッドホン スプリッター イヤホン スピーカー ホワイト',
  '3.5mm ヘッドセット ヘッドホン スプリッター イヤホン スピーカー ブラック',
  'SHURE イヤホン SEシリーズ カナル型 高遮音性 クリアー',
  'Samson Concert 88a イヤホンワイヤレスシステム ブラック'
];

function stubDb(rows) {
  return {
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async all() {
            if (sql.includes('teacher_queries')) return { results: rows.curated || [] };
            return { results: (rows.titles || []).map((product_name) => ({ product_name })) };
          }
        };
      }
    }
  };
}

test('検索語は正規化し、fts5には前方一致の安全な式だけを渡す', () => {
  assert.equal(normalizeSuggestQuery('  水筒　　保温 '), '水筒 保温');
  assert.equal(suggestMatchExpression('水筒 保温'), '"水筒"* AND "保温"*');
  // 記号はfts5の構文エラーになるので落とす
  assert.equal(suggestMatchExpression('水筒"* OR'), '"水筒"* AND "OR"*');
  assert.equal(suggestMatchExpression('   '), '');
});

test('商品名から出す語は、型番と売り文句を捨てて、よく出てくる語だけにする', () => {
  const words = relatedWordsFromTitles(EARPHONES, 'イヤホン').map((row) => row.word);
  assert.ok(words.includes('ヘッドホン'));
  assert.ok(words.includes('ブラック'));
  // 型番・売り文句・入力語そのものを含む語は出さない
  assert.ok(!words.includes('KSE1500'));
  assert.ok(!words.includes('並行輸入品'));
  assert.ok(!words.some((word) => word.includes('イヤホン')));
  // 1〜2件しか無い語は候補にしない(在庫の商品名は雑多なため)
  assert.ok(!words.includes('スプリッター'));
  assert.deepEqual(relatedWordsFromTitles([], 'イヤホン'), []);
});

test('候補は「入力語＋セカンドワード」と、実際に使われた検索文で返す', async () => {
  const env = stubDb({ titles: EARPHONES, curated: [{ query_text: 'イヤホン 骨伝導 防水' }] });
  const suggestions = await suggestFromData(env, 'イヤホン', { now: 1 });
  const queries = suggestions.map((row) => row.query);
  assert.ok(queries.includes('イヤホン ヘッドホン'));
  assert.ok(queries.includes('イヤホン 骨伝導 防水'));
  assert.ok(queries.length <= 10);
  assert.ok(suggestions.every((row) => row.kind === 'related'));
  // 商品名から出す語は多くても4つ(残りは画面側の辞書候補に譲る)
  assert.ok(queries.filter((query) => query.startsWith('イヤホン ') && query !== 'イヤホン 骨伝導 防水').length <= 4);
});

test('D1が無い・落ちても候補は空で返し、画面の辞書候補を壊さない', async () => {
  assert.deepEqual(await suggestFromData({}, 'イヤホン', { now: 2 }), []);
  const broken = { PRODUCT_DB: { prepare() { throw new Error('D1 down'); } } };
  assert.deepEqual(await suggestFromData(broken, 'ゴルフボール', { now: 3 }), []);
});

test('GET /api/search/suggest だけを受け、他のパスには触らない', async () => {
  const env = stubDb({ titles: EARPHONES, curated: [] });
  assert.equal(await handleSearchSuggestRoute(new Request('https://hoshilu.app/api/knowledge'), env), null);
  const response = await handleSearchSuggestRoute(new Request('https://hoshilu.app/api/search/suggest?q=%E3%82%A4%E3%83%A4%E3%83%9B%E3%83%B3'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(body.suggestions.some((row) => row.query === 'イヤホン ヘッドホン'));
  // 空クエリはD1を触らずに空で返す
  const empty = await handleSearchSuggestRoute(new Request('https://hoshilu.app/api/search/suggest?q='), env);
  assert.deepEqual((await empty.json()).suggestions, []);
  assert.equal((await handleSearchSuggestRoute(new Request('https://hoshilu.app/api/search/suggest', { method: 'POST' }), env)).status, 405);
});
