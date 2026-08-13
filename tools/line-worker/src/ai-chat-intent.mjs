// HOSHILU AI Chat (2026-08-05): a cost-bounded, minimal-turn refinement
// layer in front of the existing search pipeline. Reuses the same
// Gemini-primary/OpenAI-fallback providers as ai-product-discovery.mjs
// (same env vars: GEMINI_API_KEY / OPENAI_API_KEY / *_PRODUCT_DISCOVERY_MODEL)
// rather than introducing a third AI integration.
//
// SSoT boundary: IDENTIFY may return one product-name hypothesis plus the
// clues behind it, but NEVER a verified listing, price, stock status, or URL.
// It decides (a) whether one more clarifying question is worth asking, or
// (b) a candidate/refined search string to hand back to the real pipeline
// (buildAmazonSearchKeywords / applyIndexedSearchPolicy / etc. - all
// untouched by this module). "AIは理解する。HOSHILUは探す。"
//
// Cost bound: at most ONE clarifying round-trip. MAX_CHAT_TURNS caps the
// history this module will accept before forcing needs_clarification=false
// regardless of provider output, so a session can never cost more than 2
// AI calls (matching the CTO's "できるだけ少ないチャットで" / budget-conscious
// instruction) - never open-ended chat.

import { expandSearchQuery } from './query-expansion.mjs';

// One provider must not consume the whole request deadline. Gemini is still
// primary, but a timeout leaves a bounded slice for the OpenAI backup before
// the existing raw-query fallback continues to the marketplace search.
const CHAT_PROVIDER_TIMEOUT_MS = 3500;
// Query refinement runs beside local/GAS search. Allow current stable Gemini
// latency without consuming the full provider budget or blocking fallback paths.
export const QUERY_REFINEMENT_TIMEOUT_MS = 2500;
const CHAT_TOTAL_BUDGET_MS = 6500;
const MAX_CHAT_TURNS = 2;
const MAX_MESSAGE_LENGTH = 200;
const MAX_HISTORY_MESSAGES = 8;

function cleanString(value, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function providerFailureCode(error) {
  const status = Number(error?.status || 0);
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (status === 401 || status === 403) return 'AI_PROVIDER_AUTH_FAILED';
  if (status === 408 || name === 'TimeoutError' || name === 'AbortError'
    || /timed?\s*out|timeout/iu.test(message)) return 'AI_PROVIDER_TIMEOUT';
  if (status === 429) return 'AI_PROVIDER_RATE_LIMITED';
  if (status >= 500) return 'AI_PROVIDER_UPSTREAM_5XX';
  if (status >= 400) return 'AI_PROVIDER_REQUEST_REJECTED';
  if (name === 'SyntaxError' || /INVALID_JSON/u.test(message)) return 'AI_PROVIDER_INVALID_JSON';
  if (/OUTPUT_LIMIT/u.test(message)) return 'AI_PROVIDER_OUTPUT_LIMIT';
  if (error instanceof TypeError || /fetch failed|network/iu.test(message)) return 'AI_PROVIDER_NETWORK_FAILED';
  return 'AI_PROVIDER_FAILED';
}

function emitProviderDegradation(options, suffix, provider, code) {
  if (typeof options?.onProviderDegraded !== 'function') return;
  const scope = options.telemetryComponent === 'query_structurer' ? 'query_structurer' : 'ai_chat';
  try {
    options.onProviderDegraded({ component: `${scope}_${suffix}`, provider, code });
  } catch (error) {
    // Operational telemetry is additive and must never turn a recoverable AI
    // provider failure into a user-visible search failure.
    console.error('AI_PROVIDER_DEGRADATION_CALLBACK_FAILED', {
      component: `${scope}_${suffix}`,
      code: providerFailureCode(error)
    });
  }
}

function cleanRefinedQuery(value) {
  return cleanString(value, MAX_MESSAGE_LENGTH * MAX_HISTORY_MESSAGES)
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/(?:[¥$€£]\s*\d[\d,.]*|\d[\d,]*(?:円|ドル|usd|jpy))/giu, ' ')
    .replace(/\s+/gu, ' ').trim();
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

// Regression guard used by both chat and normal-search refinement:
// Never include a price, stock status, product URL, or a claim that you found a specific real product.

function chatPrompt(history, language, mode = 'REFINE') {
  const transcript = history.map((turn) => `${turn.role === 'user' ? 'User' : 'HOSHILU AI'}: ${turn.text}`).join('\n');
  if (mode === 'IDENTIFY') {
    return `You are HOSHILU's product-identification assistant. From the entire conversation, propose exactly ONE most likely real brand/product hypothesis for the user to confirm. If the user rejected an earlier hypothesis, never repeat it.\n\nConversation:\n${transcript}\n\nDisplay language: ${language}\n\nReturn JSON only:\n{\n  "needs_clarification": false,\n  "clarifying_question": "",\n  "candidate_name": "",\n  "candidate_brand": "",\n  "candidate_reason": "",\n  "matched_features": [],\n  "match_score": 0,\n  "refined_query": ""\n}\n\nRules:\n- candidate_name is one concise brand + product name hypothesis, not a list.\n- candidate_brand is the brand only when reasonably inferable.\n- candidate_reason briefly explains which remembered clues led to this hypothesis; matched_features contains only clues present in the conversation.\n- match_score is hypothesis confidence from 0 to 100, not marketplace verification confidence.\n- refined_query is a marketplace-search-ready string for that same candidate and must preserve known requirements such as size, color, compatibility, prescription, or intended use.\n- Never claim the candidate was verified or found. Never include price, stock, URL, or fabricated specifications.\n- JSON only, no markdown.`;
  }
  return `You are HOSHILU's search-refinement assistant. Turn the user's wording into a short marketplace search string. Ask a question only when no product category can be inferred.\n\nConversation:\n${transcript}\n\nDisplay language: ${language}\n\nReturn JSON only:\n{\n  "needs_clarification": false,\n  "clarifying_question": "",\n  "refined_query": ""\n}\n\nRules:\n- You MAY resolve a remembered spokesperson, nickname, visual clue, or colloquial description into the most likely real brand/product name. Treat it only as a search hypothesis; never claim it was verified or found. HOSHILU verifies it against marketplace/catalog data afterward.\n- Never include a price, stock status, URL, or fabricated specification.\n- refined_query must preserve every user requirement and contain likely brand/product + category + distinguishing details.\n- JSON only, no markdown.`;
}

async function providerFetch(fetchImpl, url, options, timeoutMs) {
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function callGemini(history, language, env, fetchImpl, timeoutMs = CHAT_PROVIDER_TIMEOUT_MS, mode = 'REFINE') {
  const model = String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
  const response = await providerFetch(
    fetchImpl,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: chatPrompt(history, language, mode) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: mode === 'IDENTIFY' ? 256 : 128,
          thinkingConfig: { thinkingLevel: 'minimal' } }
      })
    },
    timeoutMs
  );
  if (!response.ok) {
    const error = new Error('GEMINI_CHAT_INTENT_FAILED');
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  const parsed = parseJsonText(geminiText(payload));
  if (!parsed) throw new Error('GEMINI_CHAT_INTENT_INVALID_JSON');
  const usage = payload?.usageMetadata || {};
  return { model, ...normalizeChatTurnResult(parsed), _canaryUsage: {
    input_tokens: Math.max(0, Number(usage.promptTokenCount) || 0),
    output_tokens: Math.max(0, (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0))
  } };
}

async function callOpenAi(history, language, env, fetchImpl, timeoutMs = CHAT_PROVIDER_TIMEOUT_MS, mode = 'REFINE',
  maxOutputTokens = mode === 'IDENTIFY' ? 256 : 128) {
  const model = String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5');
  const response = await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: chatPrompt(history, language, mode),
      ...(Number.isInteger(maxOutputTokens) ? { max_output_tokens: maxOutputTokens } : {}),
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } }
    })
  }, timeoutMs);
  if (!response.ok) {
    const error = new Error('OPENAI_CHAT_INTENT_FAILED');
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  if (payload?.status === 'incomplete') throw new Error('OPENAI_CHAT_INTENT_OUTPUT_LIMIT');
  const parsed = parseJsonText(openAiText(payload));
  if (!parsed) throw new Error('OPENAI_CHAT_INTENT_INVALID_JSON');
  return { model, ...normalizeChatTurnResult(parsed), _canaryUsage: {
    input_tokens: Math.max(0, Number(payload?.usage?.input_tokens) || 0),
    output_tokens: Math.max(0, Number(payload?.usage?.output_tokens) || 0)
  } };
}

export function normalizeChatTurnResult(payload = {}) {
  const needsClarification = payload?.needs_clarification === true;
  const matchedFeatures = (Array.isArray(payload?.matched_features) ? payload.matched_features : [])
    .map((value) => cleanString(value, 100)).filter(Boolean).slice(0, 8);
  const matchScore = Math.max(0, Math.min(100, Math.round(Number(payload?.match_score) || 0)));
  return {
    needs_clarification: needsClarification,
    clarifying_question: needsClarification ? cleanString(payload?.clarifying_question, 200) : '',
    refined_query: !needsClarification ? cleanRefinedQuery(payload?.refined_query) : '',
    candidate_name: !needsClarification ? cleanRefinedQuery(payload?.candidate_name).slice(0, 160) : '',
    candidate_brand: !needsClarification ? cleanString(payload?.candidate_brand, 120) : '',
    candidate_reason: !needsClarification ? cleanString(payload?.candidate_reason, 300) : '',
    matched_features: !needsClarification ? matchedFeatures : [],
    match_score: !needsClarification ? matchScore : 0
  };
}

export function chatIntentConfigured(env = {}) {
  return String(env.GEMINI_API_KEY || '').length >= 20 || String(env.OPENAI_API_KEY || '').length >= 20;
}

// Falls back to the newest user message as refined_query when every
// provider fails, so the caller can always proceed to a real search instead
// of dead-ending the conversation - consistent with "as few turns as
// possible" even under provider failure.
function fallbackResult(history, mode = 'REFINE') {
  const userTurns = history.filter((turn) => turn.role === 'user');
  const lastUserTurn = userTurns.at(-1);
  const originalUserTurn = userTurns[0];
  const originalQuery = originalUserTurn?.text || '';
  const knownExpansion = mode === 'IDENTIFY' ? expandSearchQuery(originalQuery) : null;
  const refinedQuery = mode === 'IDENTIFY' ? (knownExpansion?.query || originalQuery) : lastUserTurn?.text;
  return { needs_clarification: false, clarifying_question: '', refined_query: refinedQuery || '',
    candidate_name: mode === 'IDENTIFY'
      ? (knownExpansion?.expansion?.primary || refinedQuery || '') : '',
    candidate_brand: '', candidate_reason: '', matched_features: [], match_score: 0 };
}

export async function analyzeChatTurn(rawHistory, language, env = {}, fetchImpl = fetch, options = {}) {
  const history = sanitizeChatHistory(rawHistory);
  const mode = options.mode === 'IDENTIFY' ? 'IDENTIFY' : 'REFINE';
  const geminiConfigured = String(env.GEMINI_API_KEY || '').length >= 20;
  const openAiConfigured = String(env.OPENAI_API_KEY || '').length >= 20;
  const primaryProvider = geminiConfigured ? 'gemini' : (openAiConfigured ? 'openai' : 'gemini');
  if (!history.length) return { ...fallbackResult(history, mode), configured: chatIntentConfigured(env) };
  if (!chatIntentConfigured(env)) {
    if (options.singleProviderPrimaryOnly === true) {
      emitProviderDegradation(options, 'primary', 'gemini', 'AI_PROVIDER_NOT_CONFIGURED');
    } else {
      emitProviderDegradation(options, 'all', 'all', 'AI_PROVIDERS_NOT_CONFIGURED');
    }
    return { ...fallbackResult(history, mode), configured: false };
  }

  // Cost cap: once MAX_CHAT_TURNS user turns have already happened, never
  // ask another clarifying question - force a real search with the best
  // available refined query instead of continuing to chat.
  const userTurnCount = history.filter((turn) => turn.role === 'user').length;
  const atTurnLimit = userTurnCount >= (mode === 'IDENTIFY' ? 4 : MAX_CHAT_TURNS);

  const providers = [geminiConfigured && 'gemini', openAiConfigured && 'openai'].filter(Boolean);
  const totalBudgetMs = Math.max(250, Math.min(CHAT_TOTAL_BUDGET_MS,
    Number(options.totalBudgetMs) || CHAT_TOTAL_BUDGET_MS));
  const perProviderMs = Math.max(250, Math.min(CHAT_PROVIDER_TIMEOUT_MS,
    Number(options.timeoutMs) || CHAT_PROVIDER_TIMEOUT_MS));
  const deadline = Date.now() + totalBudgetMs;

  let lastError;
  let primaryError;
  for (const provider of providers) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 250) break;
    const timeoutMs = Math.min(perProviderMs, remainingMs);
    try {
      const providerResult = provider === 'gemini'
        ? await callGemini(history, language, env, fetchImpl, timeoutMs, mode)
        : await callOpenAi(history, language, env, fetchImpl, timeoutMs, mode);
      const { _canaryUsage, ...result } = providerResult;
      console.info('AI_CHAT_TURN_RESULT', {
        provider,
        model: result.model,
        needs_clarification: result.needs_clarification && !atTurnLimit,
        turn: userTurnCount
      });
      // A primary degradation is real only when the backup completed the
      // request. If every provider fails, emit the single all-provider event
      // below instead of two rows for one request.
      if (provider === 'openai' && primaryError) {
        emitProviderDegradation(options, 'primary', 'gemini', providerFailureCode(primaryError));
      }
      if (atTurnLimit && result.needs_clarification) {
        return { ...result, needs_clarification: false, clarifying_question: '', refined_query: result.refined_query || fallbackResult(history, mode).refined_query,
          candidate_name: result.candidate_name || fallbackResult(history, mode).candidate_name, configured: true, provider };
      }
      return { ...result, candidate_name: mode === 'IDENTIFY'
        ? (result.candidate_name || result.refined_query || fallbackResult(history, mode).candidate_name) : '', configured: true, provider };
    } catch (error) {
      lastError = error;
      if (provider === primaryProvider) primaryError = error;
      console.warn('AI_CHAT_TURN_PROVIDER_FAILED', {
        provider,
        status: Number(error?.status || 0),
        provider_code: cleanString(error?.name || error?.message, 120)
      });
    }
  }
  console.warn('AI_CHAT_TURN_ALL_PROVIDERS_FAILED', { attempted: providers.length, had_error: Boolean(lastError) });
  if (options.singleProviderPrimaryOnly === true && primaryError) {
    emitProviderDegradation(options, 'primary', primaryProvider, providerFailureCode(primaryError));
  } else {
    emitProviderDegradation(options, 'all', 'all', 'AI_ALL_PROVIDERS_FAILED');
  }
  return { ...fallbackResult(history, mode), configured: true };
}

// 通常検索向けの高速な意図変換。結果は商品として信用せず検索語にだけ使い、
// 実在性は後段のモールAPI/D1で検証する。Gemini利用時は公式が高スループット
// 用途向けとしているFlash-Liteを使い、全体を1.5秒以内に制限する。
export async function refineMarketplaceSearchQuery(rawQuery, language, env = {}, fetchImpl = fetch, options = {}) {
  const fastEnv = { ...env };
  if (String(env.GEMINI_API_KEY || '').length >= 20) {
    fastEnv.GEMINI_PRODUCT_DISCOVERY_MODEL = String(env.GEMINI_QUERY_REFINEMENT_MODEL || 'gemini-3.1-flash-lite');
    // Geminiが設定済みなら、通常時に2社へ二重課金せず最速モデルを優先する。
    fastEnv.OPENAI_API_KEY = '';
  }
  return analyzeChatTurn(
    [{ role: 'user', text: String(rawQuery || '') }], language, fastEnv, fetchImpl,
    {
      timeoutMs: QUERY_REFINEMENT_TIMEOUT_MS,
      totalBudgetMs: 1500,
      telemetryComponent: 'query_structurer',
      // Gemini is intentionally isolated from OpenAI here to avoid normal
      // double billing. With Gemini absent, OpenAI-only (or no-provider)
      // failures retain all-provider semantics and alert immediately.
      singleProviderPrimaryOnly: String(env.GEMINI_API_KEY || '').length >= 20,
      onProviderDegraded: options.onProviderDegraded
    }
  );
}

// Internal scheduled-canary entrypoint. It deliberately bypasses provider
// fallback so a broken primary or backup cannot be hidden by the other one.
// The fixed synthetic history is supplied by deep-canary.mjs and is never
// persisted or logged.
export async function probeChatIntentProvider(provider, env = {}, fetchImpl = fetch, {
  mode = 'REFINE', timeoutMs = CHAT_PROVIDER_TIMEOUT_MS
} = {}) {
  const history = [{ role: 'user', text: '軽いワイヤレスイヤホン' }];
  const promptBytes = new TextEncoder().encode(chatPrompt(history, 'JA', mode)).byteLength;
  // The canary's monthly reservation assumes these fixed upper bounds. Stop
  // before a paid request if a future prompt edit could exceed that budget.
  const maxPromptBytes = provider === 'openai' ? 3000 : 5000;
  if (promptBytes > maxPromptBytes) throw new Error('CANARY_PROMPT_TOO_LARGE');
  if (provider === 'gemini') {
    if (String(env.GEMINI_API_KEY || '').length < 20) throw new Error('GEMINI_NOT_CONFIGURED');
    return callGemini(history, 'JA', env, fetchImpl, timeoutMs, mode);
  }
  if (provider === 'openai') {
    if (String(env.OPENAI_API_KEY || '').length < 20) throw new Error('OPENAI_NOT_CONFIGURED');
    return callOpenAi(history, 'JA', env, fetchImpl, timeoutMs, mode, mode === 'IDENTIFY' ? 256 : 128);
  }
  throw new Error('CANARY_PROVIDER_INVALID');
}
