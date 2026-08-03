const MAX_AI_CANDIDATES = 3;
const GEMINI_TIMEOUT_MS = 30000;
const OPENAI_TIMEOUT_MS = 8000;
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
let geminiBlockedUntil = 0;

function safePublicHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host === '[::1]' || host.endsWith('.local') || host.endsWith('.internal')) return '';
    if (/^(?:127|10|0)\.|^169\.254\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return '';
    if (host === 'hoshilu.app' || host.endsWith('.hoshilu.app')) return '';
    return url.href;
  } catch {
    return '';
  }
}

function textOutputAndCitations(payload) {
  let text = '';
  const citations = new Map();
  for (const step of Array.isArray(payload?.steps) ? payload.steps : []) {
    if (step?.type !== 'model_output') continue;
    for (const block of Array.isArray(step.content) ? step.content : []) {
      if (block?.type !== 'text') continue;
      text += `${block.text || ''}\n`;
      for (const citation of Array.isArray(block.annotations) ? block.annotations : []) {
        if (citation?.type !== 'url_citation') continue;
        const url = safePublicHttpsUrl(citation.url);
        if (url) citations.set(url, String(citation.title || ''));
      }
    }
  }
  return { text: text.trim(), citations };
}

function openAiOutputAndCitations(payload) {
  let text = '';
  const citations = new Map();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;
    for (const block of Array.isArray(item.content) ? item.content : []) {
      if (block?.type !== 'output_text') continue;
      text += `${block.text || ''}\n`;
      for (const annotation of Array.isArray(block.annotations) ? block.annotations : []) {
        if (annotation?.type !== 'url_citation') continue;
        const url = safePublicHttpsUrl(annotation.url);
        if (url) citations.set(url, String(annotation.title || ''));
      }
    }
  }
  return { text: text.trim(), citations };
}

function generateContentOutputAndCitations(payload) {
  let text = '';
  const citations = new Map();
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (part?.text) text += `${part.text}\n`;
    }
    for (const chunk of Array.isArray(candidate?.groundingMetadata?.groundingChunks)
      ? candidate.groundingMetadata.groundingChunks : []) {
      const url = safePublicHttpsUrl(chunk?.web?.uri);
      if (url) citations.set(url, String(chunk?.web?.title || ''));
    }
  }
  return { text: text.trim(), citations };
}

function parseSuggestedProducts(text) {
  const match = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = match?.[1] || String(text || '');
  try {
    const parsed = JSON.parse(source.trim());
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : [];
  } catch {
    return [];
  }
}

function citedProductUrl(value, citations) {
  const candidateUrl = safePublicHttpsUrl(value);
  if (!candidateUrl) return '';
  const candidate = new URL(candidateUrl);
  for (const citedUrl of citations.keys()) {
    const cited = new URL(citedUrl);
    if (candidate.hostname === cited.hostname) return candidateUrl;
  }
  return '';
}

function metaValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
  return String(html.match(forward)?.[1] || html.match(reverse)?.[1] || '').replace(/&amp;/g, '&').trim();
}

async function verifiedProductPage(candidate, citationTitle, fetchImpl) {
  const requestedUrl = safePublicHttpsUrl(candidate?.url);
  if (!requestedUrl) return null;
  let currentUrl = requestedUrl;
  let response;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    response = await fetchImpl(currentUrl, {
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'HOSHILU-ProductDiscovery/1.0' },
      redirect: 'manual', signal: AbortSignal.timeout(6000)
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    currentUrl = safePublicHttpsUrl(new URL(String(response.headers.get('location') || ''), currentUrl).href);
    if (!currentUrl) return null;
  }
  if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return null;
  const productUrl = safePublicHttpsUrl(response.url || currentUrl);
  if (!productUrl) return null;
  const html = (await response.text()).slice(0, 500_000);
  const image = safePublicHttpsUrl(metaValue(html, 'og:image') || metaValue(html, 'twitter:image'));
  const pageTitle = metaValue(html, 'og:title') || String(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
  const productSignals = [
    /["']@type["']\s*:\s*["']Product["']/i.test(html),
    /property=["']og:type["'][^>]+content=["']product/i.test(html),
    /(?:add.?to.?cart|カートに入れる|商品価格|itemprop=["']price)/i.test(html),
    /\/(?:product|products|item|items|dp)\//i.test(productUrl)
  ].filter(Boolean).length;
  if (!image || productSignals < 1) return null;
  return {
    title: String(candidate?.title || pageTitle || citationTitle || 'AI検索の商品候補').slice(0, 160),
    description: String(candidate?.reason || '').slice(0, 240),
    image,
    url: productUrl,
    source: new URL(productUrl).hostname,
    verification: 'AI_DISCOVERY_UNCONFIRMED'
  };
}

async function providerFetch(fetchImpl, url, options, timeoutMs) {
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function verifiedCandidates(parsed, provider, fetchImpl) {
  const structured = parseSuggestedProducts(parsed.text).filter((item) => Boolean(citedProductUrl(item?.url, parsed.citations)));
  const suggestions = (structured.length ? structured : [...parsed.citations].map(([url, title]) => ({
    title,
    url,
    reason: `${provider === 'gemini' ? 'Gemini' : 'GPT'} web search result`
  }))).slice(0, MAX_AI_CANDIDATES);
  const outcomes = await Promise.allSettled(suggestions.map((item) => verifiedProductPage(item, parsed.citations.get(safePublicHttpsUrl(item.url)), fetchImpl)));
  const candidates = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : []);
  console.info('AI_PRODUCT_DISCOVERY_RESULT', {
    provider,
    citations: parsed.citations.size,
    suggestions: suggestions.length,
    verified: candidates.length,
    verification_errors: outcomes.filter((outcome) => outcome.status === 'rejected').length
  });
  return candidates;
}

export function aiProductDiscoveryConfigured(env = {}) {
  return String(env.GEMINI_API_KEY || '').length >= 20 || String(env.OPENAI_API_KEY || '').length >= 20;
}

export async function discoverProductsWithAi(query, language, env = {}, fetchImpl = fetch) {
  if (!aiProductDiscoveryConfigured(env)) return { triggered: false, configured: false, candidates: [] };
  const prompt = `Find up to ${MAX_AI_CANDIDATES} likely purchasable products matching this HOSHILU search: ${query}\nLanguage: ${language}. Return only a JSON object {"products":[{"title":"","url":"","reason":""}]}. URLs must be direct public product detail pages, not search results, articles, social posts, homepages, or shortened links. Prefer exact visual/use clues. Do not invent products or URLs.`;
  const geminiConfigured = String(env.GEMINI_API_KEY || '').length >= 20;
  const openAiConfigured = String(env.OPENAI_API_KEY || '').length >= 20;
  const providers = [];
  if (geminiConfigured && Date.now() >= geminiBlockedUntil) providers.push('gemini');
  if (openAiConfigured) providers.push('openai');
  if (!providers.length && geminiConfigured) providers.push('gemini');

  let lastError;
  for (const provider of providers) {
    let model;
    try {
      let parsed;
      if (provider === 'gemini') {
        model = String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
        const response = await providerFetch(fetchImpl, 'https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ model, input: prompt, tools: [{ type: 'google_search' }] })
        }, GEMINI_TIMEOUT_MS);
        if (!response.ok) {
          if (response.status === 429) geminiBlockedUntil = Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS;
          const error = new Error('GEMINI_PRODUCT_DISCOVERY_FAILED');
          error.status = response.status;
          try {
            const failure = await response.clone().json();
            error.providerCode = String(failure?.error?.status || failure?.error?.code || '').slice(0, 80);
          } catch {}
          throw error;
        }
        parsed = textOutputAndCitations(await response.json());
      } else {
        model = String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5.6-luna');
        const response = await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model, input: prompt, reasoning: { effort: 'low' }, tools: [{ type: 'web_search' }] })
        }, OPENAI_TIMEOUT_MS);
        if (!response.ok) {
          const error = new Error('OPENAI_PRODUCT_DISCOVERY_FAILED');
          error.status = response.status;
          try {
            const failure = await response.clone().json();
            error.providerCode = String(failure?.error?.code || failure?.error?.type || '').slice(0, 80);
          } catch {}
          throw error;
        }
        parsed = openAiOutputAndCitations(await response.json());
      }
      const candidates = await verifiedCandidates(parsed, provider, fetchImpl);
      if (candidates.length || provider === providers.at(-1)) {
        return {
          triggered: true,
          configured: true,
          provider: provider === 'gemini' ? 'GEMINI_GOOGLE_SEARCH' : 'OPENAI_WEB_SEARCH',
          model,
          candidates
        };
      }
    } catch (error) {
      lastError = error;
      console.warn('AI_PRODUCT_DISCOVERY_PROVIDER_FAILED', {
        provider,
        status: Number(error?.status || 0),
        provider_code: String(error?.providerCode || error?.name || '').slice(0, 80),
        timeout_ms: provider === 'gemini' ? GEMINI_TIMEOUT_MS : OPENAI_TIMEOUT_MS
      });
    }
  }
  if (lastError) throw lastError;
  return { triggered: true, configured: true, candidates: [] };
}

export const aiProductDiscoveryTest = {
  resetCircuitBreaker() { geminiBlockedUntil = 0; },
  safePublicHttpsUrl,
  textOutputAndCitations,
  generateContentOutputAndCitations,
  openAiOutputAndCitations,
  parseSuggestedProducts,
  citedProductUrl,
  verifiedProductPage
};
