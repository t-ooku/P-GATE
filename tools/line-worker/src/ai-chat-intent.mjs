// HOSHILU AI Chat (2026-08-05): a cost-bounded, minimal-turn refinement
// layer in front of the existing search pipeline. Reuses the same
// Gemini-primary/OpenAI-fallback providers as ai-product-discovery.mjs
// (same env vars: GEMINI_API_KEY / OPENAI_API_KEY / *_PRODUCT_DISCOVERY_MODEL)
// rather than introducing a third AI integration.
//
// SSoT boundary (unchanged from the rest of HOSHILU): this module NEVER
// returns a product name, price, stock status, or URL. It only decides (a)
// whether one more clarifying question is worth asking, or (b) a refined
// search string to hand back to the real search pipeline
// (buildAmazonSearchKeywords / applyIndexedSearchPolicy / etc. - all
// untouched by this module). "AIは理解する。HOSHILUは探す。"
//
// Cost bound: at most ONE clarifying round-trip. MAX_CHAT_TURNS caps the
// history this module will accept before forcing needs_clarification=false
// regardless of provider output, so a session can never cost more than 2
// AI calls (matching the CTO's "できるだけ少ないチャットで" / budget-conscious
// instruction) - never open-ended chat.

// 20秒×2プロバイダでは失敗時に最大40秒待たせる。検索語の整理は短いJSON
// 応答なので5秒で打ち切り、失敗時は既存の原文フォールバックで検索を続ける。
const CHAT_TIMEOUT_MS = 5000;
const MAX_CHAT_TURNS = 2;
const MAX_MESSAGE_LENGTH = 200;
const MAX_HISTORY_MESSAGES = 4;

function cleanString(value, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseJsonText(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  try {
    return JSON.parse(fenced.trim());
  } catch {
    const object = fenced.match(/\{[\s\S]*\}/)?.[0];
    if (!object) return null;
    try { return JSON.parse(object); } catch { return null; }
  }
}

function geminiText(payload) {
  let text = '';
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (part?.text) text += `${part.text}\n`;
    }
  }
  return text.trim();
}

function openAiText(payload) {
  let text = '';
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;
    for (const block of Array.isArray(item.content) ? item.content : []) {
      if (block?.type === 'output_text') text += `${block.text || ''}\n`;
    }
  }
  return text.trim();
}

export function sanitizeChatHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.text === 'string')
    .map((turn) => ({ role: turn.role, text: cleanString(turn.text, MAX_MESSAGE_LENGTH) }))
    .filter((turn) => turn.text)
    .slice(-MAX_HISTORY_MESSAGES);
}

function chatPrompt(history, language) {
  const transcript = history.map((turn) => `${turn.role === 'user' ? 'User' : 'HOSHILU AI'}: ${turn.text}`).join('\n');
  return `You are HOSHILU's search-refinement chat assistant. Your only job is to turn a vague or incomplete product wish into a clean marketplace search string, using as FEW turns as possible - budget is limited, so only ask a clarifying question when the request is genuinely too ambiguous to search (e.g. no guessable product category at all). If a product type and at least one distinguishing detail are present, do not ask anything - go straight to refined_query.\n\nConversation so far (oldest first):\n${transcript}\n\nDisplay language: ${language}\n\nReturn JSON only with this exact structure:\n{\n  "needs_clarification": false,\n  "clarifying_question": "",\n  "refined_query": ""\n}\n\nRules:\n- Never include a price, stock status, product URL, or a claim that you found a specific real product - you only refine the search, HOSHILU performs the real search afterward.\n- clarifying_question: a single short question, only when needs_clarification is true. Empty string otherwise.\n- refined_query: a clean, short marketplace-search-ready string combining everything learned from the whole conversation (category + distinguishing details). Required when needs_clarification is false.\n- JSON only, no markdown.`;
}

async function providerFetch(fetchImpl, url, options, timeoutMs) {
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function callGemini(history, language, env, fetchImpl) {
  const model = String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
  const response = await providerFetch(
    fetchImpl,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: chatPrompt(history, language) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    },
    CHAT_TIMEOUT_MS
  );
  if (!response.ok) {
    const error = new Error('GEMINI_CHAT_INTENT_FAILED');
    error.status = response.status;
    throw error;
  }
  const parsed = parseJsonText(geminiText(await response.json()));
  if (!parsed) throw new Error('GEMINI_CHAT_INTENT_INVALID_JSON');
  return { model, ...normalizeChatTurnResult(parsed) };
}

async function callOpenAi(history, language, env, fetchImpl) {
  const model = String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5');
  const response = await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: chatPrompt(history, language),
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } }
    })
  }, CHAT_TIMEOUT_MS);
  if (!response.ok) {
    const error = new Error('OPENAI_CHAT_INTENT_FAILED');
    error.status = response.status;
    throw error;
  }
  const parsed = parseJsonText(openAiText(await response.json()));
  if (!parsed) throw new Error('OPENAI_CHAT_INTENT_INVALID_JSON');
  return { model, ...normalizeChatTurnResult(parsed) };
}

export function normalizeChatTurnResult(payload = {}) {
  const needsClarification = payload?.needs_clarification === true;
  return {
    needs_clarification: needsClarification,
    clarifying_question: needsClarification ? cleanString(payload?.clarifying_question, 200) : '',
    refined_query: !needsClarification ? cleanString(payload?.refined_query, MAX_MESSAGE_LENGTH * MAX_HISTORY_MESSAGES) : ''
  };
}

export function chatIntentConfigured(env = {}) {
  return String(env.GEMINI_API_KEY || '').length >= 20 || String(env.OPENAI_API_KEY || '').length >= 20;
}

// Falls back to the newest user message as refined_query when every
// provider fails, so the caller can always proceed to a real search instead
// of dead-ending the conversation - consistent with "as few turns as
// possible" even under provider failure.
function fallbackResult(history) {
  const lastUserTurn = [...history].reverse().find((turn) => turn.role === 'user');
  return { needs_clarification: false, clarifying_question: '', refined_query: lastUserTurn?.text || '' };
}

export async function analyzeChatTurn(rawHistory, language, env = {}, fetchImpl = fetch) {
  const history = sanitizeChatHistory(rawHistory);
  if (!history.length) return { ...fallbackResult(history), configured: chatIntentConfigured(env) };
  if (!chatIntentConfigured(env)) return { ...fallbackResult(history), configured: false };

  // Cost cap: once MAX_CHAT_TURNS user turns have already happened, never
  // ask another clarifying question - force a real search with the best
  // available refined query instead of continuing to chat.
  const userTurnCount = history.filter((turn) => turn.role === 'user').length;
  const atTurnLimit = userTurnCount >= MAX_CHAT_TURNS;

  const geminiConfigured = String(env.GEMINI_API_KEY || '').length >= 20;
  const openAiConfigured = String(env.OPENAI_API_KEY || '').length >= 20;
  const providers = [geminiConfigured && 'gemini', openAiConfigured && 'openai'].filter(Boolean);

  let lastError;
  for (const provider of providers) {
    try {
      const result = provider === 'gemini'
        ? await callGemini(history, language, env, fetchImpl)
        : await callOpenAi(history, language, env, fetchImpl);
      console.info('AI_CHAT_TURN_RESULT', {
        provider,
        model: result.model,
        needs_clarification: result.needs_clarification && !atTurnLimit,
        turn: userTurnCount
      });
      if (atTurnLimit && result.needs_clarification) {
        return { needs_clarification: false, clarifying_question: '', refined_query: result.refined_query || fallbackResult(history).refined_query, configured: true, provider };
      }
      return { ...result, configured: true, provider };
    } catch (error) {
      lastError = error;
      console.warn('AI_CHAT_TURN_PROVIDER_FAILED', {
        provider,
        status: Number(error?.status || 0),
        provider_code: cleanString(error?.name || error?.message, 120)
      });
    }
  }
  console.warn('AI_CHAT_TURN_ALL_PROVIDERS_FAILED', { attempted: providers.length, had_error: Boolean(lastError) });
  return { ...fallbackResult(history), configured: true };
}
