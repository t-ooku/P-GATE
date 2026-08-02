const MAX_AI_CANDIDATES = 3;

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
    title: String(candidate?.title || pageTitle || citationTitle || 'AI探索の商品候補').slice(0, 160),
    description: String(candidate?.reason || '').slice(0, 240),
    image,
    url: productUrl,
    source: new URL(productUrl).hostname,
    verification: 'AI_DISCOVERY_UNCONFIRMED'
  };
}

export function aiProductDiscoveryConfigured(env = {}) {
  return String(env.GEMINI_API_KEY || '').length >= 20;
}

export async function discoverProductsWithAi(query, language, env = {}, fetchImpl = fetch) {
  if (!aiProductDiscoveryConfigured(env)) return { triggered: false, configured: false, candidates: [] };
  const model = String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      model,
      input: `Find up to ${MAX_AI_CANDIDATES} likely purchasable products matching this HOSHILU search: ${query}\nLanguage: ${language}. Return only a JSON object {"products":[{"title":"","url":"","reason":""}]}. URLs must be direct public product detail pages, not search results, articles, social posts, homepages, or shortened links. Prefer exact visual/use clues. Do not invent products or URLs.`,
      tools: [{ type: 'google_search' }]
    })
  });
  if (!response.ok) {
    let providerCode = '';
    try {
      const failure = await response.json();
      providerCode = String(failure?.error?.status || failure?.error?.code || '').slice(0, 80);
    } catch {}
    const error = new Error('AI_PRODUCT_DISCOVERY_FAILED');
    error.status = response.status;
    error.providerCode = providerCode;
    throw error;
  }
  const parsed = textOutputAndCitations(await response.json());
  const structuredSuggestions = parseSuggestedProducts(parsed.text).filter((item) => {
    const url = safePublicHttpsUrl(item?.url);
    return url && parsed.citations.has(url);
  });
  const suggestions = (structuredSuggestions.length ? structuredSuggestions : [...parsed.citations].map(([url, title]) => ({
    title,
    url,
    reason: 'GeminiのGoogle検索で、この検索条件に近い候補として引用されました。'
  }))).slice(0, MAX_AI_CANDIDATES);
  const outcomes = await Promise.allSettled(suggestions.map((item) => verifiedProductPage(item, parsed.citations.get(safePublicHttpsUrl(item.url)), fetchImpl)));
  const candidates = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : []);
  console.info('AI_PRODUCT_DISCOVERY_RESULT', {
    citations: parsed.citations.size,
    suggestions: suggestions.length,
    verified: candidates.length,
    verification_errors: outcomes.filter((outcome) => outcome.status === 'rejected').length
  });
  return { triggered: true, configured: true, provider: 'GEMINI_GOOGLE_SEARCH', candidates };
}

export const aiProductDiscoveryTest = { safePublicHttpsUrl, textOutputAndCitations, parseSuggestedProducts, verifiedProductPage };
