import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeChatTurn,
  chatIntentConfigured,
  refineMarketplaceSearchQuery,
  sanitizeChatHistory,
  normalizeChatTurnResult
} from '../src/ai-chat-intent.mjs';

test('chatIntentConfigured accepts either Gemini or OpenAI configuration', () => {
  assert.equal(chatIntentConfigured({}), false);
  assert.equal(chatIntentConfigured({ GEMINI_API_KEY: 'g'.repeat(32) }), true);
  assert.equal(chatIntentConfigured({ OPENAI_API_KEY: 'o'.repeat(32) }), true);
});

test('sanitizeChatHistory keeps only user/assistant turns with text, capped at 4', () => {
  const history = [
    { role: 'user', text: 'a' },
    { role: 'system', text: 'ignored' },
    { role: 'assistant', text: 'b' },
    { role: 'user', text: '' },
    { role: 'user', text: 'c' },
    { role: 'assistant', text: 'd' },
    { role: 'user', text: 'e' }
  ];
  const result = sanitizeChatHistory(history);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map((t) => t.text), ['b', 'c', 'd', 'e']);
});

test('normalizeChatTurnResult never returns a clarifying_question when needs_clarification is false', () => {
  const result = normalizeChatTurnResult({ needs_clarification: false, clarifying_question: '無視されるはず', refined_query: '透明 ワイヤレスイヤホン' });
  assert.equal(result.needs_clarification, false);
  assert.equal(result.clarifying_question, '');
  assert.equal(result.refined_query, '透明 ワイヤレスイヤホン');
});

test('未設定なら常にconfigured:falseで直近のユーザー発言をrefined_queryとして返す', async () => {
  const result = await analyzeChatTurn([{ role: 'user', text: '透明なワイヤレスイヤホン' }], 'ja', {});
  assert.equal(result.configured, false);
  assert.equal(result.needs_clarification, false);
  assert.equal(result.refined_query, '透明なワイヤレスイヤホン');
});

test('十分な情報があれば1ターン目で確認質問なしにrefined_queryを返す(コスト最小化)', async () => {
  const fetchImpl = async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      needs_clarification: false,
      clarifying_question: '',
      refined_query: '韓国っぽい透明のワイヤレスイヤホン'
    }) }] } }]
  });
  const result = await analyzeChatTurn(
    [{ role: 'user', text: '韓国っぽい透明のワイヤレスイヤホン' }],
    'ja',
    { GEMINI_API_KEY: 'g'.repeat(32) },
    fetchImpl
  );
  assert.equal(result.needs_clarification, false);
  assert.equal(result.refined_query, '韓国っぽい透明のワイヤレスイヤホン');
  assert.equal(result.provider, 'gemini');
});

test('曖昧なら1回だけ確認質問を返す', async () => {
  const fetchImpl = async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      needs_clarification: true,
      clarifying_question: '透明な何をお探しですか？(スマホケース、イヤホンなど)',
      refined_query: ''
    }) }] } }]
  });
  const result = await analyzeChatTurn(
    [{ role: 'user', text: '透明なやつ' }],
    'ja',
    { GEMINI_API_KEY: 'g'.repeat(32) },
    fetchImpl
  );
  assert.equal(result.needs_clarification, true);
  assert.match(result.clarifying_question, /透明な何を/);
});

test('コスト上限: 2ターン目に達したら確認質問を無視し必ず検索へ進む', async () => {
  const fetchImpl = async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      needs_clarification: true,
      clarifying_question: 'まだ確認したい',
      refined_query: '透明 スマホケース'
    }) }] } }]
  });
  const history = [
    { role: 'user', text: '透明なやつ' },
    { role: 'assistant', text: '透明な何をお探しですか？' },
    { role: 'user', text: 'スマホケース' }
  ];
  const result = await analyzeChatTurn(history, 'ja', { GEMINI_API_KEY: 'g'.repeat(32) }, fetchImpl);
  assert.equal(result.needs_clarification, false);
  // The provider's refined_query is discarded because needs_clarification
  // was true (normalizeChatTurnResult never trusts a refined_query paired
  // with a clarifying question); at the turn cap we fall back to the
  // newest user message rather than asking a 3rd time.
  assert.equal(result.refined_query, 'スマホケース');
});

test('全プロバイダ失敗時も直近のユーザー発言で検索へフォールバックする(会話が行き詰まらない)', async () => {
  const fetchImpl = async () => new Response('error', { status: 500 });
  const result = await analyzeChatTurn(
    [{ role: 'user', text: '軽いモバイルバッテリー' }],
    'ja',
    { GEMINI_API_KEY: 'g'.repeat(32) },
    fetchImpl
  );
  assert.equal(result.needs_clarification, false);
  assert.equal(result.refined_query, '軽いモバイルバッテリー');
});

test('価格・URL・在庫を主張する応答は仕様上返せない構造になっている(refined_queryは検索語のみ)', () => {
  const result = normalizeChatTurnResult({ needs_clarification: false, refined_query: '透明 イヤホン https://example.com 3,980円' });
  assert.doesNotMatch(result.refined_query, /https?:\/\//);
  assert.doesNotMatch(result.refined_query, /円|¥|\$/);
});

test('通常検索はGemini Flash-Lite・最小思考・短いJSONでブランド名へ高速変換する', async () => {
  let requestedUrl = ''; let requestBody;
  const fetchImpl = async (url, options) => {
    requestedUrl = String(url); requestBody = JSON.parse(options.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      needs_clarification: false, clarifying_question: '',
      refined_query: 'LILMOON リルムーン 度あり カラコン'
    }) }] } }] });
  };
  const result = await refineMarketplaceSearchQuery(
    'カラコン ローラ 度入り', 'JA', { GEMINI_API_KEY: 'g'.repeat(32) }, fetchImpl
  );
  assert.match(requestedUrl, /gemini-3\.1-flash-lite/);
  assert.equal(requestBody.generationConfig.maxOutputTokens, 128);
  assert.equal(requestBody.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.match(requestBody.contents[0].parts[0].text, /spokesperson/);
  assert.match(result.refined_query, /LILMOON/);
});
