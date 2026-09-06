import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  IDENTIFY_PREVIEW_BUDGET_MS, identifyCandidateFromAnalysis,
  readMultimodalIdentifyCache, storeMultimodalIdentifyCache, withPreviewBudget
} from '../src/identify-route.mjs';
import { multimodalIdentifyCacheKey } from '../src/ai-identify-cache.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0073_ai_identify_cache.sql', import.meta.url), 'utf8'));
  const env = { PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { success: true, meta: { changes: Number(info.changes || 0) } }; },
      async all() { return { results: statement.all(...values) }; } }; } } };
  return { db, env };
}

const IMAGE = { data: 'AAAABBBBCCCC', mime_type: 'image/jpeg' };

test('解析結果から確認カード用の候補だけを取り出す', () => {
  const candidate = identifyCandidateFromAnalysis({
    candidate_name: ' サーモス 水筒 ', candidate_brand: 'サーモス', candidate_reason: '写真のロゴが一致',
    refined_query: '', match_score: 140, matched_features: ['ロゴ', '', 'ふた']
  });
  // refined_query が空なら候補名をそのまま検索語にする。スコアは0-100に丸める。
  assert.equal(candidate.candidate_name, 'サーモス 水筒');
  assert.equal(candidate.refined_query, 'サーモス 水筒');
  assert.equal(candidate.match_score, 100);
  assert.deepEqual(candidate.matched_features, ['ロゴ', 'ふた']);
  // 候補名が無ければ「これですか？」は出せない。
  assert.equal(identifyCandidateFromAnalysis({ refined_query: '水筒' }), null);
  assert.equal(identifyCandidateFromAnalysis(null), null);
});

test('参考画像が遅くても確認カードは止めない', async () => {
  assert.equal(IDENTIFY_PREVIEW_BUDGET_MS, 3000);
  assert.deepEqual(await withPreviewBudget(new Promise(() => {}), 20), []);
  assert.deepEqual(await withPreviewBudget(Promise.reject(new Error('RAKUTEN_DOWN')), 20), []);
  assert.deepEqual(await withPreviewBudget(Promise.resolve([{ name: 'a' }]), 20), [{ name: 'a' }]);
});

test('同じ写真は2回目に Vision も Gemini も呼ばずに返す', async () => {
  const { db, env } = databaseEnv();
  const input = { image: IMAGE, socialUrl: '', query: 'これ何' };
  const first = await readMultimodalIdentifyCache(env, input, 'JA');
  assert.match(first.cacheKey, /^[0-9a-f]{64}$/u);
  assert.equal(first.cached, null);
  storeMultimodalIdentifyCache(env, first.cacheKey, {
    candidate_name: 'サーモス 水筒', refined_query: 'サーモス 水筒',
    candidate_previews: [{ name: '水筒', image: 'https://example.com/a.jpg', price: 1, tracking_url: 'https://x' }]
  }, 'JA');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await readMultimodalIdentifyCache(env, input, 'JA');
  assert.equal(second.cached.candidate_name, 'サーモス 水筒');
  assert.equal(second.cached.candidate_previews[0].tracking_url, undefined);
  assert.equal(db.prepare('SELECT hits FROM ai_identify_cache').get().hits, 1);
});

test('別の写真・別の言語・入力なしはキーが変わる（取り違えない）', async () => {
  const base = await multimodalIdentifyCacheKey({ image: IMAGE }, 'JA');
  assert.notEqual(base, await multimodalIdentifyCacheKey({ image: { data: 'ZZZZBBBBCCCC' } }, 'JA'));
  assert.notEqual(base, await multimodalIdentifyCacheKey({ image: IMAGE }, 'EN'));
  assert.notEqual(base, await multimodalIdentifyCacheKey({ image: IMAGE, query: '赤い方' }, 'JA'));
  assert.notEqual(base, await multimodalIdentifyCacheKey({ socialUrl: 'https://www.instagram.com/p/abc/' }, 'JA'));
  // 画像もURLも無いときは、この経路のキーを作らない（文字だけは /api/ai-chat の担当）。
  assert.equal(await multimodalIdentifyCacheKey({ query: '水筒' }, 'JA'), '');
});

test('Workerに配線されている（POST /api/identify・画像かURLが必須）', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /from '\.\/identify-route\.mjs'/u);
  assert.match(index, /url\.pathname === '\/api\/identify'\) return handleIdentifyApi\(request, env, ctx\)/u);
  assert.match(index, /if \(!input\.social_url && !input\.search_image\) throw new Error\('IDENTIFY_INPUT_REQUIRED'\)/u);
  // 候補を出すだけの入口。ここで在庫・価格の本体検索を走らせない。
  const handler = index.slice(index.indexOf('async function handleIdentifyApi'), index.indexOf('async function handleAiChatApi'));
  assert.doesNotMatch(handler, /handleKnowledgeApi|searchMarketplace|decoratePwaResult/u);
});
