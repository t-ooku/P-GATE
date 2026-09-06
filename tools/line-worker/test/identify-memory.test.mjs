import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  MAX_REJECTED_CANDIDATES, confirmedCandidate, identifyMemoryKey, readIdentifyMemory, rememberIdentifyAnswer
} from '../src/identify-memory.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0075_identify_confirmations.sql', import.meta.url), 'utf8'));
  const env = { PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { statement.run(...values); return { success: true }; },
      async all() { return { results: statement.all(...values) }; } }; } } };
  return { db, env };
}

const QUERY = 'すみっコぐらし　水筒　保温';

test('YES をもらった答えは D1 に残り、同じ質問には Gemini なしで返せる', async () => {
  const { db, env } = databaseEnv();
  assert.deepEqual(await readIdentifyMemory(env, QUERY, 'JA'), {
    key: await identifyMemoryKey(QUERY, 'JA'), confirmed: null, rejected: []
  });
  await rememberIdentifyAnswer(env, {
    query: QUERY, language: 'JA',
    confirmed: { name: 'サーモス 真空断熱ケータイマグ 350ml', brand: 'サーモス', match_score: 88, matched_features: ['保温', '350ml'] }
  });
  // 表記ゆれ（全角空白・大文字）でも同じ答えに当たる。
  const memory = await readIdentifyMemory(env, ' すみっコぐらし 水筒 保温 ', 'JA');
  assert.equal(memory.confirmed.candidate_name, 'サーモス 真空断熱ケータイマグ 350ml');
  assert.equal(memory.confirmed.refined_query, 'サーモス 真空断熱ケータイマグ 350ml');
  assert.equal(db.prepare('SELECT confirmed_count FROM identify_confirmations').get().confirmed_count, 1);
  // 言語が違えば別の記憶（同じ答えを他言語に流用しない）。
  assert.equal((await readIdentifyMemory(env, QUERY, 'EN')).confirmed, null);
});

test('「違う」と言われた候補を覚え、同じ間違いを繰り返さない', async () => {
  const { db, env } = databaseEnv();
  await rememberIdentifyAnswer(env, { query: QUERY, language: 'JA', rejected: '象印 ステンレスマグ' });
  await rememberIdentifyAnswer(env, { query: QUERY, language: 'JA', rejected: 'タイガー サハラマグ' });
  await rememberIdentifyAnswer(env, { query: QUERY, language: 'JA', rejected: '象印 ステンレスマグ' });
  const memory = await readIdentifyMemory(env, QUERY, 'JA');
  // 新しい否定が先頭に来て、重複は増えない。
  assert.deepEqual(memory.rejected, ['象印 ステンレスマグ', 'タイガー サハラマグ']);
  assert.equal(db.prepare('SELECT rejected_count FROM identify_confirmations').get().rejected_count, 3);
});

test('NO だけが来ても、前に当たった答えは消さない', async () => {
  const { env } = databaseEnv();
  await rememberIdentifyAnswer(env, { query: QUERY, language: 'JA', confirmed: { name: '当たり商品' } });
  await rememberIdentifyAnswer(env, { query: QUERY, language: 'JA', rejected: 'はずれ商品' });
  const memory = await readIdentifyMemory(env, QUERY, 'JA');
  assert.equal(memory.confirmed.candidate_name, '当たり商品');
  assert.deepEqual(memory.rejected, ['はずれ商品']);
});

test('残すのは候補の情報だけ。空の質問や候補名なしは記録しない', async () => {
  const { db, env } = databaseEnv();
  assert.equal(confirmedCandidate({ brand: 'x' }), null);
  assert.equal(confirmedCandidate(null), null);
  assert.equal(await rememberIdentifyAnswer(env, { query: '   ', confirmed: { name: 'a' } }), false);
  assert.equal(await rememberIdentifyAnswer(env, { query: QUERY }), false);
  assert.equal(await rememberIdentifyAnswer({}, { query: QUERY, confirmed: { name: 'a' } }), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM identify_confirmations').get().n, 0);
  // 保存する項目は確認カードに出すものだけ（価格・会員ID・セッションIDは持たない）。
  assert.deepEqual(Object.keys(confirmedCandidate({ name: 'a', price: 100, member_id: 'm' })),
    ['candidate_name', 'candidate_brand', 'candidate_reason', 'refined_query', 'match_score', 'matched_features']);
  assert.equal(MAX_REJECTED_CANDIDATES, 8);
});

test('D1 が壊れていても検索は止まらない', async () => {
  const broken = { PRODUCT_DB: { prepare() { throw new Error('D1_DOWN'); } } };
  assert.deepEqual(await readIdentifyMemory(broken, QUERY, 'JA'), { key: '', confirmed: null, rejected: [] });
  assert.equal(await rememberIdentifyAnswer(broken, { query: QUERY, confirmed: { name: 'a' } }), false);
});

test('Workerと画面に配線されている（D1優先・違うを次に渡す・写真を使い続ける）', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  // 文字の質問: 前に YES をもらった答えがあれば Gemini を呼ばない。
  assert.match(index, /if \(cacheable && memory\.confirmed\) \{/u);
  assert.match(index, /answered_from: 'confirmed'/u);
  // YES を押したときに、元の質問文で記録する。
  assert.match(index, /validatedInput\.ai_candidate_fallback && validatedInput\.identify_original_query/u);
  // 写真の2問目以降は、キャッシュを使わず「違う」を渡して引き直す。
  assert.match(index, /rejectedCandidates\.length\s*\? \{ cacheKey: '', cached: null \}/u);
  assert.match(index, /analyzeSearchInput\([\s\S]{0,200}\{ rejectedCandidates \}\)/u);

  const ui = readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  // 写真から始まった確認は、2問目以降も /api/identify（＝写真つき）を使う。
  assert.match(ui, /const result=startedFromMedia\s*\n?\s*\? await postIdentify\(\{query:originalQuery,language,image:identifyImage,socialUrl:identifySocialUrl,rejectedCandidates\}\)/u);
  assert.match(ui, /if\(candidate&&!rejectedCandidates\.includes\(candidate\)\)rejectedCandidates\.push\(candidate\)/u);
  assert.match(ui, /identifyOriginalQuery:originalQuery/u);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /identify_original_query:String\(options\.identifyOriginalQuery\)\.slice\(0,200\)/u);
});
