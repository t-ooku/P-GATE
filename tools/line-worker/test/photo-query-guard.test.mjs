import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSearchInput, decorativeSentenceQuery, guardImageQuery, repairDigitMisreadQuery
} from '../src/search-input-analysis.mjs';

const JPEG = { mime_type: 'image/jpeg', data: '/9j/4AAQ' };
const ENV = { GEMINI_API_KEY: 'g'.repeat(32), GEMINI_PRODUCT_DISCOVERY_MODEL: 'gemini-test' };
const VISUAL_ENV = {
  ...ENV,
  GOOGLE_VISUAL_SEARCH_ENABLED: 'true',
  GOOGLE_CLOUD_VISION_API_KEY: 'v'.repeat(32),
  PRODUCT_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ reserved_requests: 1, monthly_limit: 900 }) }) }) }
};
const MUG_EVIDENCE = {
  best_guess_labels: ['mug'],
  web_entities: ['Mug', 'Tea', 'Cup'],
  prominent_text: ['Tea offers me', 'a moment to', 'GOOD MOOD'],
  detected_text: 'Tea offers me\na moment to\nrelax and recharge\nGOOD MOOD'
};

test('数字の読み違い: OCR が数字で前後が同じ時だけ戻す', () => {
  const evidence = { prominent_text: ['ファミマル', '5種のナッツ&フルーツ'], detected_text: 'ファミマル\n5種のナッツ&フルーツ\n55g' };
  assert.equal(repairDigitMisreadQuery('ファミマル 今種のナッツ&フルーツ', evidence), 'ファミマル 5種のナッツ&フルーツ');
  // 漢数字（五種）は読みとして正しいので変えない
  assert.equal(repairDigitMisreadQuery('ファミマル 五種のナッツ', evidence), 'ファミマル 五種のナッツ');
  // モデルが数字・OCR が漢字の時はモデルを優先（変えない）
  assert.equal(repairDigitMisreadQuery('ファミマル 5種のナッツ', { prominent_text: ['今種のナッツ'] }), 'ファミマル 5種のナッツ');
  // 前後が合わない時は変えない
  assert.equal(repairDigitMisreadQuery('今日のおやつ', evidence), '今日のおやつ');
  assert.equal(repairDigitMisreadQuery('お茶 今種', { prominent_text: ['5種'] }), 'お茶 今種');
  // 前の文字が一致すれば短い助数詞でも戻す
  assert.equal(repairDigitMisreadQuery('一週間分のロカボナッツ 七袋', { detected_text: 'ナッツ7袋' }), '一週間分のロカボナッツ 七袋');
  assert.equal(repairDigitMisreadQuery('ロカボナッツ今袋', { detected_text: 'ナッツ7袋' }), 'ロカボナッツ7袋');
  assert.equal(repairDigitMisreadQuery('', {}), '');
});

test('飾りの英文: 断片・英文そのものはロゴ＋日本語カテゴリにする', () => {
  assert.equal(decorativeSentenceQuery({ refined_query: 'Tea amoment' }, MUG_EVIDENCE), 'GOOD MOOD マグカップ');
  assert.equal(decorativeSentenceQuery({ refined_query: 'Tea offers me a moment to relax' }, { best_guess_labels: ['coffee cup'] }), 'マグカップ');
  assert.equal(decorativeSentenceQuery({ refined_query: 'Tea offers me a moment', candidate_brand: 'Daiso' }, MUG_EVIDENCE), 'Daiso マグカップ');
});

test('飾りの英文: 当てはまらない時は変えない', () => {
  // ロゴそのもの・型番・日本語入りは変えない
  assert.equal(decorativeSentenceQuery({ refined_query: 'GOOD MOOD' }, MUG_EVIDENCE), '');
  assert.equal(decorativeSentenceQuery({ refined_query: 'CNP Laboratory DERMA ANSWER' }, { best_guess_labels: ['cosmetics'], detected_text: 'CNP Laboratory\nDERMA ANSWER\nACTIVE BOOST AMPULE' }), '');
  assert.equal(decorativeSentenceQuery({ refined_query: 'Tea amoment マグ' }, MUG_EVIDENCE), '');
  assert.equal(decorativeSentenceQuery({ refined_query: 'DUALSHOCK 4' }, MUG_EVIDENCE), '');
  // カテゴリが分からない時は変えない（行き止まりにしない）
  assert.equal(decorativeSentenceQuery({ refined_query: 'Tea amoment' }, { ...MUG_EVIDENCE, best_guess_labels: ['font'], web_entities: ['Tea'] }), '');
  // 英文の行が短い（5 語未満）時は断片扱いしない
  assert.equal(decorativeSentenceQuery({ refined_query: 'Tea time' }, { best_guess_labels: ['mug'], detected_text: 'Tea time for me' }), '');
  assert.deepEqual(guardImageQuery({ refined_query: 'サントリー 特茶 ジャスミン' }, MUG_EVIDENCE).guard, '');
});

const visionResponse = (evidence) => Response.json({ responses: [{
  webDetection: {
    bestGuessLabels: evidence.best_guess_labels.map((label) => ({ label })),
    webEntities: evidence.web_entities.map((description) => ({ description, score: 0.8 }))
  },
  fullTextAnnotation: { text: evidence.detected_text }
}] });

test('Gemini が飾りの英文を検索語にしても、カテゴリ＋ロゴで探す（記録は SENTENCE）', async () => {
  const result = await analyzeSearchInput({ image: JPEG }, 'JA', VISUAL_ENV, async (url) => {
    if (String(url).startsWith('https://vision.googleapis.com/')) return visionResponse(MUG_EVIDENCE);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      refined_query: 'Tea offers me a moment', candidate_name: '', candidate_brand: '', candidate_reason: '', matched_features: ['mug'], match_score: 40
    }) }] } }] });
  });
  assert.equal(result.refined_query, 'GOOD MOOD マグカップ');
  assert.equal(result.stage_ms.query_guard, 'SENTENCE');
});

test('Gemini の数字の読み違いを OCR の数字に戻す（記録は DIGIT）、正しい答えは変えない', async () => {
  const evidence = { best_guess_labels: ['nuts'], web_entities: ['Nut', 'FamilyMart'], detected_text: 'ファミマル\n5種のナッツ&フルーツ' };
  const run = (query) => analyzeSearchInput({ image: JPEG }, 'JA', VISUAL_ENV, async (url) => {
    if (String(url).startsWith('https://vision.googleapis.com/')) return visionResponse(evidence);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      refined_query: query, candidate_name: query, candidate_brand: 'ファミマル', candidate_reason: '', matched_features: [], match_score: 70
    }) }] } }] });
  });
  const fixed = await run('ファミマル 今種のナッツ&フルーツ');
  assert.equal(fixed.refined_query, 'ファミマル 5種のナッツ&フルーツ');
  assert.equal(fixed.stage_ms.query_guard, 'DIGIT');
  const kept = await run('ファミマル 5種のナッツ&フルーツ');
  assert.equal(kept.refined_query, 'ファミマル 5種のナッツ&フルーツ');
  assert.equal(kept.stage_ms.query_guard, '');
});

test('Gemini が落ちて OCR の救済になった時も、飾りの英文で探さない', async () => {
  const result = await analyzeSearchInput({ image: JPEG }, 'JA', VISUAL_ENV, async (url) => {
    if (String(url).startsWith('https://vision.googleapis.com/')) return visionResponse(MUG_EVIDENCE);
    return new Response('', { status: 503 });
  });
  assert.match(result.provider, /^GOOGLE_VISION_/u);
  assert.equal(result.refined_query, 'GOOD MOOD マグカップ');
  assert.equal(result.stage_ms.query_guard, 'SENTENCE');
});
