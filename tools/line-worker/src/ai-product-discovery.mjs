import { openAiBackupEnabled } from './ai-provider-availability.mjs';
import { sanitizeAiOutputList, sanitizeAiOutputText } from './ai-output-safety.mjs';

const MAX_AI_CANDIDATES = 5;
// 通常検索候補が0件の時だけ走る補助経路。長時間待たせるよりモールへの
// 直接検索導線を早く返すことを優先し、各プロバイダを短い上限で打ち切る。
const GEMINI_TIMEOUT_MS = 6000;
const OPENAI_TIMEOUT_MS = 5000;
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
let geminiBlockedUntil = 0;

function cleanString(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function providerDiagnosticCode(error) {
  const providerCode = String(error?.providerCode || '').trim().toUpperCase();
  if (/^[A-Z][A-Z0-9_.-]{1,79}$/u.test(providerCode)) return providerCode;
  const status = Number(error?.status || 0);
  if (status >= 400 && status <= 599) return `HTTP_${status}`;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'AI_PROVIDER_TIMEOUT';
  if (error instanceof SyntaxError) return 'AI_PROVIDER_INVALID_JSON';
  if (error instanceof TypeError) return 'AI_PROVIDER_NETWORK_FAILED';
  return 'AI_PROVIDER_FAILED';
}

function cleanStringList(value, maxItems = 12, maxLength = 100) {
  return sanitizeAiOutputList(value, maxItems, maxLength);
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

function normalizeCandidate(candidate, index) {
  const name = sanitizeAiOutputText(candidate?.name || candidate?.product_name || candidate?.title, 140);
  if (!name) return null;
  const score = Math.max(1, Math.min(100, Math.round(Number(candidate?.match_score || candidate?.score || (95 - index * 7)) || 0)));
  return {
    name,
    brand: sanitizeAiOutputText(candidate?.brand, 80),
    model: sanitizeAiOutputText(candidate?.model, 100),
    match_score: score,
    reason: sanitizeAiOutputText(candidate?.reason || candidate?.reasoning, 240),
    matched_features: cleanStringList(candidate?.matched_features || candidate?.features, 8, 80),
    search_keywords: cleanStringList(candidate?.search_keywords || [name], 8, 100)
  };
}

export function normalizeAiIntent(payload = {}) {
  const rawCandidates = Array.isArray(payload?.product_candidates)
    ? payload.product_candidates
    : Array.isArray(payload?.candidates) ? payload.candidates : [];
  const productCandidates = rawCandidates
    .map(normalizeCandidate)
    .filter(Boolean)
    .slice(0, MAX_AI_CANDIDATES);
  return {
    category: sanitizeAiOutputText(payload?.category, 100),
    intent_summary: sanitizeAiOutputText(payload?.intent_summary || payload?.summary, 240),
    features: cleanStringList(payload?.features, 12, 80),
    product_candidates: productCandidates,
    search_keywords: cleanStringList(payload?.search_keywords, 16, 100),
    multilingual_keywords: {
      ja: cleanStringList(payload?.multilingual_keywords?.ja, 10, 100),
      en: cleanStringList(payload?.multilingual_keywords?.en, 10, 100),
      zh: cleanStringList(payload?.multilingual_keywords?.zh, 10, 100),
      ko: cleanStringList(payload?.multilingual_keywords?.ko, 10, 100)
    }
  };
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

function providerPrompt(query, language) {
  return `You are HOSHILU's product-intent analysis engine. Understand the user's vague memory or wish and convert it into product candidates and short marketplace search terms.\n\nUser input: ${query}\nDisplay language: ${language}\n\nReturn JSON only with this exact structure:\n{\n  "category": "",\n  "intent_summary": "",\n  "features": [""],\n  "product_candidates": [\n    {\n      "name": "",\n      "brand": "",\n      "model": "",\n      "match_score": 1,\n      "reason": "",\n      "matched_features": [""],\n      "search_keywords": [""]\n    }\n  ],\n  "search_keywords": [""],\n  "multilingual_keywords": {\n    "ja": [""],\n    "en": [""],\n    "zh": [""],\n    "ko": [""]\n  }\n}\n\nRules:\n- Return 3 to ${MAX_AI_CANDIDATES} realistic product candidates when possible.\n- Do not return URLs.\n- Do not invent exact model numbers when uncertain; use a product family or descriptive candidate instead.\n- Convert long vague sentences into multiple short marketplace-friendly search terms.\n- Keep the original meaning, visual clues, use case, style, place seen, and brand clues.\n- When the user says they saw it on social media or in an ad, treat that only as an unverified clue. Do not identify a brand or exact product from the platform name or memory alone; prefer a generic product category.\n- Include Japanese and English terms; include Chinese and Korean when useful.\n- match_score must be 1-100 and reason must explain why the candidate matches.\n- JSON only, no markdown.`;
}

async function providerFetch(fetchImpl, url, options, timeoutMs) {
  return fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
}

async function callGemini(query, language, env, fetchImpl) {
  const model = String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
  const response = await providerFetch(
    fetchImpl,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: providerPrompt(query, language) }] }],
        generationConfig: { temperature: 0.25, responseMimeType: 'application/json' }
      })
    },
    GEMINI_TIMEOUT_MS
  );
  if (!response.ok) {
    if (response.status === 429) geminiBlockedUntil = Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS;
    const error = new Error('GEMINI_PRODUCT_INTENT_FAILED');
    error.status = response.status;
    try {
      const failure = await response.clone().json();
      error.providerCode = cleanString(failure?.error?.status || failure?.error?.code, 80);
    } catch {}
    throw error;
  }
  const parsed = parseJsonText(geminiText(await response.json()));
  if (!parsed) throw new Error('GEMINI_PRODUCT_INTENT_INVALID_JSON');
  return { model, analysis: normalizeAiIntent(parsed) };
}

async function callOpenAi(query, language, env, fetchImpl) {
  const model = String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5');
  const response = await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: providerPrompt(query, language),
      max_output_tokens: 128,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } }
    })
  }, OPENAI_TIMEOUT_MS);
  if (!response.ok) {
    const error = new Error('OPENAI_PRODUCT_INTENT_FAILED');
    error.status = response.status;
    try {
      const failure = await response.clone().json();
      error.providerCode = cleanString(failure?.error?.code || failure?.error?.type, 80);
    } catch {}
    throw error;
  }
  const parsed = parseJsonText(openAiText(await response.json()));
  if (!parsed) throw new Error('OPENAI_PRODUCT_INTENT_INVALID_JSON');
  return { model, analysis: normalizeAiIntent(parsed) };
}

export function aiProductDiscoveryConfigured(env = {}) {
  return String(env.GEMINI_API_KEY || '').length >= 20 || openAiBackupEnabled(env);
}

export async function discoverProductsWithAi(query, language, env = {}, fetchImpl = fetch) {
  if (!aiProductDiscoveryConfigured(env)) {
    return { triggered: false, configured: false, candidates: [], analysis: null };
  }
  const geminiConfigured = String(env.GEMINI_API_KEY || '').length >= 20;
  const openAiConfigured = openAiBackupEnabled(env);
  const providers = [];
  if (geminiConfigured && Date.now() >= geminiBlockedUntil) providers.push('gemini');
  if (openAiConfigured) providers.push('openai');
  if (!providers.length && geminiConfigured) providers.push('gemini');

  let lastError;
  for (const provider of providers) {
    try {
      const result = provider === 'gemini'
        ? await callGemini(query, language, env, fetchImpl)
        : await callOpenAi(query, language, env, fetchImpl);
      const candidateCount = result.analysis.product_candidates.length;
      const keywordCount = result.analysis.search_keywords.length
        + Object.values(result.analysis.multilingual_keywords).flat().length;
      console.info('AI_PRODUCT_INTENT_RESULT', {
        provider,
        model: result.model,
        candidates: candidateCount,
        keywords: keywordCount,
        category_present: Boolean(result.analysis.category)
      });
      if (candidateCount || keywordCount || provider === providers.at(-1)) {
        return {
          triggered: true,
          configured: true,
          provider: provider === 'gemini' ? 'GEMINI_PRODUCT_INTENT' : 'OPENAI_PRODUCT_INTENT',
          model: result.model,
          analysis: result.analysis,
          candidates: []
        };
      }
    } catch (error) {
      lastError = error;
      console.warn('AI_PRODUCT_DISCOVERY_PROVIDER_FAILED', {
        provider,
        status: Number(error?.status || 0),
        provider_code: providerDiagnosticCode(error),
        timeout_ms: provider === 'gemini' ? GEMINI_TIMEOUT_MS : OPENAI_TIMEOUT_MS
      });
    }
  }
  if (lastError) throw lastError;
  return { triggered: true, configured: true, candidates: [], analysis: null };
}

export const aiProductDiscoveryTest = {
  resetCircuitBreaker() { geminiBlockedUntil = 0; },
  parseJsonText,
  normalizeAiIntent,
  providerPrompt
};
