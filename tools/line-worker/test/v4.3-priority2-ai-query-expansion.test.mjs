import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import worker from '../src/index.mjs';
import { expandSearchQuery } from '../src/query-expansion.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

// v4.3 指示書 section 7・8・9: 「AI Query Expansionの検索接続」。
//
// 調査の結果、この優先順位チェーン(ユーザー検索→Teacher Dataset→D1 Search
// Knowledge→Cache→既知なら即検索→未知/曖昧な場合のみAI)は既にv4.2で
// 実装済みであることを確認した:
//   1. query-expansion.mjs (ルールベース、AI不使用) が handleKnowledgeApi の
//      入口(src/index.mjs:1397)で最初に適用される。
//   2. Teacher Dataset lookup / D1 FTS5 index / 3モールAPI検索が続けて実行
//      される。
//   3. Teacher Dataset/D1が0件なら、外部モール照会と並行して
//      discoverProductsWithAi() を開始し、外部モールも0件の時だけ結果を表示する。
// 「解決済み項目を再改修しない」の原則に従い、この動作自体は変更せず、
// このテストで固定化(regression-lock)する。特に、既存テストで未確認だった
// 「AIプロバイダが両方とも失敗しても検索全体は200で応答を返す」
// (=AI障害がHOSHILU検索全体を止めない、section 9)を新規に確認する。

function environment(overrides = {}) {
  return {
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_SITE_KEY: 'site-key',
    GAS_BACKEND_URL: 'https://script.google.com/macros/s/test-deployment/exec',
    GAS_BRIDGE_SECRET: 'g'.repeat(32),
    LINK_SIGNING_SECRET: 'l'.repeat(32),
    PRODUCT_DB: {
      prepare() {
        return { bind() { return { all: async () => ({ results: [] }) }; } };
      }
    },
    ...overrides
  };
}

function request(query, searchAttempt = 1, aiCandidateFallback = null) {
  return new Request('https://hoshilu.app/api/knowledge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      language: 'JA',
      search_attempt: searchAttempt,
      processing_notice_shown: true,
      session_id: 'anonymous_session_priority2',
      turnstile_token: 'verified-token',
      ...(aiCandidateFallback ? { ai_candidate_fallback: aiCandidateFallback } : {})
    })
  });
}

const context = { waitUntil() {} };

test('v4.3項目7: ルールベースのQuery ExpansionはAIを一切呼び出さない', () => {
  const result = expandSearchQuery('顔用扇風機');
  assert.equal(result.expanded, true);
  assert.equal(result.expansion.rule_id, 'handheld-fan');
  // primary/synonym/related/broadの4段階が同じ重みで扱われていない
  // (v4.3項目7: 「同義語と関連商品を同じ重みで扱わない」)
  assert.ok(result.expansion.weights.primary > result.expansion.weights.synonym);
  assert.ok(result.expansion.weights.synonym > result.expansion.weights.related);
  assert.ok(result.expansion.weights.related > result.expansion.weights.broad);
});

test('v4.3項目8・9: Teacher Dataset/D1が0件ならAI商品解析を開始し、全モール0件時に結果を使う', async () => {
  const originalFetch = globalThis.fetch;
  let aiCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      aiCalls += 1;
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        category: 'テスト', intent_summary: 'テスト', features: [], product_candidates: [], search_keywords: [], multilingual_keywords: { ja: [], en: [], zh: [], ko: [] }
      }) }] } }] });
    }
    return Response.json({ ok: true, result: { query_id: 'gas-1', candidates: [], message: '' } });
  };
  const env = { ...environment(), GEMINI_API_KEY: 'g'.repeat(32) };
  try {
    const payload = await (await worker.fetch(request('名前が分からないけど透明なやつ'), env, context)).json();
    assert.equal(payload.ok, true);
    // 検索前の検索語変換と、全候補0件時の商品意図解析を別目的で各1回呼ぶ。
    assert.equal(aiCalls, 2);
    assert.equal(payload.result.ai_discovery.triggered, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AIチャットで確定した候補はGeminiを二重実行せず、未確認候補としてそのまま残す', async () => {
  const originalFetch = globalThis.fetch;
  let geminiCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1;
      return new Response('duplicate Gemini call is forbidden', { status: 500 });
    }
    return Response.json({ ok: true, result: { query_id: 'gas-confirmed', candidates: [], message: '' } });
  };
  const confirmed = {
    name: '【studio CLIP】【daily CLIP】天然石ピアス',
    brand: 'studio CLIP',
    reason: '天然石と小ぶりな一粒デザインに一致',
    matched_features: ['天然石', '一粒ピアス'],
    match_score: 92
  };
  try {
    const response = await worker.fetch(
      request('天然石 ピアス', 1, confirmed),
      { ...environment(), GEMINI_API_KEY: 'g'.repeat(32) },
      context
    );
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.equal(geminiCalls, 0);
    assert.equal(payload.result.ai_discovery.provider, 'AI_CHAT_CONFIRMED');
    assert.equal(payload.result.ai_discovery.analysis.product_candidates[0].name, confirmed.name);
    assert.equal(payload.result.ai_discovery.analysis.product_candidates[0].selected_by_user, true);
    assert.ok(payload.result.ai_discovery.analysis.product_candidates[0].marketplace_search_links.length >= 13);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('v4.3項目9: AIプロバイダが両方とも失敗しても検索全体は200で応答し、検索を停止させない', async () => {
  const originalFetch = globalThis.fetch;
  let geminiCalls = 0;
  let openAiCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1;
      return new Response('gemini down', { status: 503 });
    }
    if (target.includes('api.openai.com')) {
      openAiCalls += 1;
      return new Response('openai down', { status: 503 });
    }
    return Response.json({ ok: true, result: { query_id: 'gas-2', candidates: [], message: '' } });
  };
  const env = {
    ...environment(),
    GEMINI_API_KEY: 'g'.repeat(32),
    OPENAI_API_KEY: 'o'.repeat(32),
    OPENAI_BACKUP_ENABLED: 'true',
  };
  try {
    const response = await worker.fetch(request('未知の商品名不明クエリ'), env, context);
    const payload = await response.json();
    // 障害時にHOSHILU検索全体が停止しない = 500ではなく200で返る
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.result.candidates, []);
    assert.equal(payload.result.ai_discovery.unavailable, true);
    assert.equal(payload.result.marketplace_search_links.length, 13);
    assert.equal(new Set(payload.result.marketplace_search_links.map((link) => link.marketplace)).size, 13);
    // 検索語変換のGemini 1回 + 商品意図解析のGemini 1回。
    assert.equal(geminiCalls, 2);
    assert.equal(openAiCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('v4.3項目9: GeminiとOpenAIを同時実行しない(Geminiが成功すればOpenAIは一度も呼ばれない)', async () => {
  const originalFetch = globalThis.fetch;
  let geminiCalls = 0;
  let openAiCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('siteverify')) return Response.json({ success: true });
    if (target.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1;
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        category: 'テスト', intent_summary: 'テスト', features: [], product_candidates: [], search_keywords: ['テストキーワード'], multilingual_keywords: { ja: [], en: [], zh: [], ko: [] }
      }) }] } }] });
    }
    if (target.includes('api.openai.com')) {
      openAiCalls += 1;
      return Response.json({ output: [] });
    }
    return Response.json({ ok: true, result: { query_id: 'gas-3', candidates: [], message: '' } });
  };
  const env = { ...environment(), GEMINI_API_KEY: 'g'.repeat(32), OPENAI_API_KEY: 'o'.repeat(32) };
  try {
    const payload = await (await worker.fetch(request('また別の未知クエリ'), env, context)).json();
    assert.equal(payload.ok, true);
    // 検索語変換・商品意図解析ともGeminiで成功し、OpenAIへは流れない。
    assert.equal(geminiCalls, 2);
    assert.equal(openAiCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
