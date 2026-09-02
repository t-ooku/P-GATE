export const YAHOO_REQUEST_INTERVAL_MS = 2100;
export const YAHOO_PROXY_RESULT_HEADER = 'x-hoshilu-yahoo-proxy-result';

const NEXT_START_KEY = 'next_start_at_ms';
const PROXY_PATH = '/proxy';
const MAX_PROVIDER_TIMEOUT_MS = 2500;
const MAX_QUEUE_WINDOW_MS = 30000;
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const API_URL = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';
const HIGH_RATING_TREND_RANKING_API =
  'https://shopping.yahooapis.jp/ShoppingWebService/V1/highRatingTrendRanking';

function abortableSleep(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function boundedDeadline(request, now) {
  const raw = String(request.headers.get('x-hoshilu-rate-deadline') || '').trim();
  if (!raw) return now + 8000;
  const value = Number(raw);
  // A supplied but stale/malformed deadline must fail closed. Treating it as
  // absent would let an already-aborted caller consume a later provider call.
  return Number.isFinite(value) && value > 0 && value <= now + MAX_QUEUE_WINDOW_MS
    ? value
    : now - 1;
}

function providerTimeout(request) {
  const raw = String(request.headers.get('x-hoshilu-provider-timeout-ms') || '').trim();
  if (!raw) return MAX_PROVIDER_TIMEOUT_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 100 && value <= MAX_PROVIDER_TIMEOUT_MS
    ? Math.floor(value)
    : 0;
}

function fixedResponse(status, result, body = null) {
  return new Response(body, {
    status,
    headers: {
      [YAHOO_PROXY_RESULT_HEADER]: result,
      ...(body === null ? {} : { 'content-type': 'application/json' })
    }
  });
}

async function readBoundedProviderBody(response, maximumBytes) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    throw error;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function discardProviderBody(response) {
  try { await response.body?.cancel(); } catch {}
}

function normalizeOperation(payload = {}) {
  const allowedKeys = new Set(['v', 'op', 'query', 'seller_id', 'sort']);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).some((key) => !allowedKeys.has(key))) return null;
  if (payload?.v !== 1) return null;
  const op = String(payload.op || '');
  if (!['ITEM_SEARCH', 'HIGH_RATING_TREND'].includes(op)) return null;
  const query = String(payload.query || '').normalize('NFKC').trim();
  if (!query || query.length > 200) return null;
  if (op === 'HIGH_RATING_TREND') return { v: 1, op, query };
  const sellerId = String(payload.seller_id || '').trim();
  if (sellerId && !/^[a-z0-9_-]{1,80}$/iu.test(sellerId)) return null;
  const sort = String(payload.sort || '');
  if (sort && !['-review_count', '-score'].includes(sort)) return null;
  return { v: 1, op, query, seller_id: sellerId, sort };
}

// This is shared with the non-production/test fallback so both paths use the
// same allowlisted Yahoo! endpoints and parameters. The caller's Client ID is
// never accepted by the Durable Object request body; production reads it only
// from the object's own environment binding.
export function buildYahooProviderUrl(operation, clientId) {
  const normalized = normalizeOperation(operation);
  const appId = String(clientId || '').trim();
  if (!normalized || !appId) return null;
  const highRating = normalized.op === 'HIGH_RATING_TREND';
  const url = new URL(highRating ? HIGH_RATING_TREND_RANKING_API : API_URL);
  url.searchParams.set('appid', appId);
  // 検索語がJAN(8桁/13桁の数字だけ)の場合は、キーワードではなく
  // itemSearch v3 の jan_code で識別子検索する(2026-09-02: 写真の
  // バーコード数字から一発特定する経路)。ランキングAPIは従来どおり。
  const janQuery = !highRating && /^\d{8}$|^\d{13}$/u.test(normalized.query) ? normalized.query : '';
  if (janQuery) url.searchParams.set('jan_code', janQuery);
  else url.searchParams.set('query', normalized.query);
  if (highRating) {
    url.searchParams.set('offset', '1');
    url.searchParams.set('limit', '30');
    return url;
  }
  if (normalized.seller_id) {
    url.searchParams.set('seller_id', normalized.seller_id);
    url.searchParams.set('results', '10');
  } else {
    url.searchParams.set('results', '30');
  }
  url.searchParams.set('image_size', '600');
  if (normalized.sort) url.searchParams.set('sort', normalized.sort);
  url.searchParams.set('in_stock', 'true');
  return url;
}

// Every Worker location calls one fixed Durable Object. The actual Yahoo!
// fetch—not a permit—is executed while this object holds the serial section.
// The next call waits until 2.1 seconds after the previous response completed,
// which guarantees provider starts cannot bunch up after caller/PoP jitter.
// Only a numeric timestamp is persisted; no query, credential, response, or
// user identifier is logged or stored.
function providerFetchFailureResult(error) {
  // Map only known runtime categories to fixed codes. Never return the raw
  // message because the provider URL contains appid and query parameters.
  const message = String(error?.message || '');
  if (/global scope|different request|request context|asynchronous I\/O/iu.test(message)) {
    return 'provider_fetch_context';
  }
  if (/invalid URL|unsupported URL|URL scheme|URL parser/iu.test(message)) {
    return 'provider_fetch_url';
  }
  if (/network connection|fetch failed|socket|TLS|certificate|DNS/iu.test(message)) {
    return 'provider_fetch_transport';
  }
  if (error?.name === 'TypeError') return 'provider_fetch_type';
  return 'provider_fetch_network';
}

export class YahooRequestCoordinator {
  constructor(state, env, options = {}) {
    this.state = state;
    this.env = env || {};
    this.clock = options.clock || Date.now;
    this.sleep = options.sleep || abortableSleep;
    this.fetcher = options.fetcher || null;
    this.providerSignalFactory = options.providerSignalFactory
      || ((milliseconds) => AbortSignal.timeout(milliseconds));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== PROXY_PATH) {
      return new Response(null, { status: 404 });
    }
    if (request.signal.aborted) return fixedResponse(408, 'control');
    return this.state.blockConcurrencyWhile(async () => {
      let providerStarted = false;
      // Privacy-safe phase only. Never store or log request/response data.
      let providerPhase = 'control';
      let reservationMade = false;
      let previousStored;
      let result;
      try {
        let operation;
        try {
          operation = normalizeOperation(await request.json());
        } catch {}
        const clientId = String(this.env.YAHOO_SHOPPING_CLIENT_ID || '').trim();
        const timeoutMs = providerTimeout(request);
        if (!operation || !clientId || !timeoutMs) return fixedResponse(400, 'control');
        const providerUrl = buildYahooProviderUrl(operation, clientId);
        if (!providerUrl) return fixedResponse(400, 'control');
        const observedNow = Number(this.clock());
        const now = Number.isFinite(observedNow) ? observedNow : Date.now();
        const deadline = boundedDeadline(request, now);
        if (request.signal.aborted || now > deadline) return fixedResponse(408, 'control');
        previousStored = await this.state.storage.get(NEXT_START_KEY);
        const stored = Number(previousStored || 0);
        const nextStartAt = Number.isFinite(stored) ? stored : 0;
        const waitMs = Math.max(0, nextStartAt - now);
        if (now + waitMs > deadline) return fixedResponse(408, 'control');
        if (waitMs > 0) await this.sleep(waitMs, request.signal);
        const observedStart = Number(this.clock());
        const startedAt = Number.isFinite(observedStart) ? observedStart : Date.now();
        if (request.signal.aborted || startedAt > deadline || startedAt < nextStartAt) {
          return fixedResponse(408, 'control');
        }

        // Persist a conservative crash reservation before dispatch. On the
        // normal path it is replaced with response-completion + 2.1 seconds.
        // If the object dies mid-request, a replacement cannot immediately
        // duplicate a provider call.
        await this.state.storage.put(NEXT_START_KEY,
          startedAt + MAX_QUEUE_WINDOW_MS + YAHOO_REQUEST_INTERVAL_MS);
        reservationMade = true;
        if (request.signal.aborted) return fixedResponse(408, 'control');
        providerStarted = true;
        providerPhase = 'signal';
        // The inbound Request signal belongs to the internal Worker -> Durable
        // Object hop. Once the crash reservation is persisted and the provider
        // starts, let only the bounded provider timeout control outbound fetch.
        // Reusing the hop signal across the DO boundary can make workerd reject
        // the provider fetch before any network connection is attempted.
        const providerSignal = this.providerSignalFactory(timeoutMs);
        providerPhase = 'fetch';
        // Resolve the platform fetch in the active request context. Durable
        // Objects can outlive one event, so retaining the global I/O function
        // from construction risks crossing workerd request contexts.
        const providerFetch = this.fetcher || globalThis.fetch;
        const response = await providerFetch(providerUrl.toString(), {
          headers: { accept: 'application/json' },
          redirect: 'manual',
          signal: providerSignal
        });
        providerPhase = 'body';
        const status = Number(response?.status) || 502;
        if (status < 200 || status > 299) {
          // Provider error bodies and headers can echo inputs. Preserve only
          // the numeric status needed for exact 401/403 canary classification.
          await discardProviderBody(response);
          result = fixedResponse(status >= 400 && status <= 599 ? status : 502, 'provider');
        } else {
          const declaredLength = Number(response.headers?.get?.('content-length') || 0);
          if (declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
            await discardProviderBody(response);
            result = fixedResponse(502, 'provider');
          } else {
            const body = await readBoundedProviderBody(response, MAX_PROVIDER_RESPONSE_BYTES);
            result = body
              ? fixedResponse(status, 'provider', body)
              : fixedResponse(502, 'provider');
          }
        }
      } catch (error) {
        if (!providerStarted) {
          result = fixedResponse(408, 'control');
        } else if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
          result = fixedResponse(504, 'provider_timeout');
        } else {
          result = fixedResponse(502, providerPhase === 'body'
            ? 'provider_body_network'
            : providerPhase === 'signal'
              ? 'provider_signal_type'
              : providerFetchFailureResult(error));
        }
      } finally {
        if (providerStarted) {
          const observedCompletion = Number(this.clock());
          const completedAt = Number.isFinite(observedCompletion) ? observedCompletion : Date.now();
          try {
            await this.state.storage.put(NEXT_START_KEY,
              completedAt + YAHOO_REQUEST_INTERVAL_MS);
          } catch {}
        } else if (reservationMade) {
          // The caller can abort while the crash reservation is being written.
          // No Yahoo request started, so restore the prior slot instead of
          // imposing a false 32-second global outage.
          try {
            if (previousStored === undefined) await this.state.storage.delete(NEXT_START_KEY);
            else await this.state.storage.put(NEXT_START_KEY, previousStored);
          } catch {}
        }
      }
      return result || fixedResponse(503, 'control');
    });
  }
}
