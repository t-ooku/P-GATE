import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchYahooHighRatingRanking,
  normalizeYahooHighRatingRanking,
  normalizeYahooShoppingItems,
  searchYahooShopping,
  withYahooRequestGate,
  yahooShoppingApiConfigured
} from '../src/yahoo-shopping-api.mjs';
import { YahooRequestCoordinator } from '../src/yahoo-request-coordinator.mjs';
import { safeProviderErrorCode } from '../src/provider-error-code.mjs';

function coordinatorState() {
  const values = new Map();
  const writes = [];
  let tail = Promise.resolve();
  return {
    values,
    writes,
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, value); writes.push(value); },
      async delete(key) { values.delete(key); }
    },
    blockConcurrencyWhile(callback) {
      const run = tail.then(callback);
      tail = run.then(() => undefined, () => undefined);
      return run;
    }
  };
}

test('provider log codeは既知allowlist以外のtoken風本文・key風本文も拒否する', () => {
  assert.equal(safeProviderErrorCode('PRIVATE_MEDICAL_QUERY', 400), 'HTTP_400');
  assert.equal(safeProviderErrorCode('AKIAIOSFODNN7EXAMPLE', 0), 'PROVIDER_REQUEST_FAILED');
  assert.equal(safeProviderErrorCode('insufficient_quota', 429), 'INSUFFICIENT_QUOTA');
});

test('Yahoo Shopping API requires an explicit client ID', () => {
  assert.equal(yahooShoppingApiConfigured({}), false);
  assert.equal(yahooShoppingApiConfigured({ YAHOO_SHOPPING_CLIENT_ID: 'client-id' }), true);
});

test('normalizes only product detail URLs and confirms totals only for free shipping', () => {
  const candidates = normalizeYahooShoppingItems({ hits: [
    { code: 'shop_item', name: '同一商品', url: 'https://store.shopping.yahoo.co.jp/shop/item.html', price: 3980, janCode: '4901234567894', shipping: { code: 2 }, delivery: { day: 2 }, image: { medium: 'https://item-shopping.c.yimg.jp/i/g/shop_item' } },
    { code: 'shop_other', name: '送料別商品', url: 'https://store.shopping.yahoo.co.jp/shop/other.html', price: 2980, shipping: { code: 3 } },
    { code: 'search', name: '検索ページ', url: 'https://shopping.yahoo.co.jp/search?p=x', price: 1000, shipping: { code: 2 } }
  ] });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].record_key, 'JAN:4901234567894');
  assert.equal(candidates[0].offers[0].total_cost, 3980);
  assert.equal(candidates[0].offers[0].shipping_fee_confirmed, true);
  assert.equal(candidates[0].offers[0].delivery_days, 2);
  assert.equal(candidates[1].offers[0].total_cost, 0);
  assert.equal(candidates[1].offers[0].shipping_fee_confirmed, false);
});

test('searches the official endpoint without exposing the client ID in output data', async () => {
  let requested = '';
  const results = await searchYahooShopping(
    { YAHOO_SHOPPING_CLIENT_ID: 'secret-client-id' },
    '光る スマホケース',
    async (url) => {
      requested = url;
      return { ok: true, json: async () => ({ hits: [] }) };
    }
  );
  const url = new URL(requested);
  assert.equal(url.hostname, 'shopping.yahooapis.jp');
  assert.equal(url.searchParams.get('appid'), 'secret-client-id');
  assert.equal(url.searchParams.get('query'), '光る スマホケース');
  assert.equal(url.searchParams.get('image_size'), '600');
  assert.deepEqual(results, []);
});

test('Yahoo provider自由文はqueryを含めずHTTP固定コードへ畳む', async () => {
  await assert.rejects(
    searchYahooShopping(
      { YAHOO_SHOPPING_CLIENT_ID: 'secret-client-id' }, '秘密の検索語',
      async () => Response.json({ Error: { Message: 'invalid query: 秘密の検索語' } }, { status: 400 })
    ),
    (error) => error.message === 'YAHOO_SHOPPING_SEARCH_FAILED'
      && error.providerCode === 'HTTP_400'
      && !String(error.providerCode).includes('秘密の検索語')
  );
});

test('Yahoo transport and JSON failures never expose credential or query prose', async () => {
  const credential = 'fake-sensitive-client-id';
  const query = 'private medical query';
  await assert.rejects(
    searchYahooShopping({ YAHOO_SHOPPING_CLIENT_ID: credential }, query, async () => {
      throw new Error(`network failed for appid=${credential}&query=${query}`);
    }),
    (error) => error.name === 'TypeError'
      && error.message === 'YAHOO_SHOPPING_SEARCH_FAILED_NETWORK'
      && !error.message.includes(credential)
      && !error.message.includes(query)
  );
  await assert.rejects(
    searchYahooShopping({ YAHOO_SHOPPING_CLIENT_ID: credential }, query,
      async () => new Response(`invalid JSON for ${credential} ${query}`)),
    (error) => error.name === 'SyntaxError'
      && error.message === 'YAHOO_PROVIDER_INVALID_JSON'
      && !error.message.includes(credential)
      && !error.message.includes(query)
  );
});

test('Yahoo production request gate keeps concurrent calls below 30 per minute', async () => {
  let now = 0;
  const waits = [];
  const starts = [];
  const timeoutStarts = [];
  const env = withYahooRequestGate({ YAHOO_SHOPPING_CLIENT_ID: 'client-id' }, {
    clock: () => now,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    }
  });
  const fetcher = async () => {
    starts.push(now);
    return Response.json({ hits: [] });
  };
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (milliseconds) => {
    assert.equal(milliseconds, 2500);
    timeoutStarts.push(now);
    return originalTimeout(60000);
  };
  try {
    await Promise.all([
      searchYahooShopping(env, 'first', fetcher),
      searchYahooShopping(env, 'second', fetcher),
      searchYahooShopping(env, 'third', fetcher)
    ]);
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
  assert.deepEqual(starts, [0, 2100, 4200]);
  assert.deepEqual(timeoutStarts, starts, 'provider timeout must start after queue wait');
  assert.deepEqual(waits, [2100, 2100]);
});

test('fixed Durable Object proxies separate Worker invocations and spaces actual Yahoo starts', async () => {
  const initialNow = Date.now();
  let now = initialNow;
  const starts = [];
  const objectNames = [];
  const proxyRequests = [];
  const callerReturns = [];
  let callerFetcherCalled = false;
  let markSecondReturned;
  const secondReturned = new Promise((resolve) => { markSecondReturned = resolve; });
  const state = coordinatorState();
  const coordinator = new YahooRequestCoordinator(state, {
    YAHOO_SHOPPING_CLIENT_ID: 'test-client-id'
  }, {
    clock: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
    fetcher: async () => {
      starts.push(now);
      now += 300;
      return Response.json({ hits: [] });
    }
  });
  const namespace = {
    idFromName(name) { objectNames.push(name); return 'fixed-object-id'; },
    get(id) {
      assert.equal(id, 'fixed-object-id');
      return { fetch: async (url, init) => {
        const request = new Request(url, init);
        const body = await request.clone().text();
        proxyRequests.push({
          url: String(url),
          method: init.method,
          headers: Object.fromEntries(request.headers),
          body
        });
        const response = await coordinator.fetch(request);
        // Simulate PoP/caller jitter that returns the second invocation first.
        // Provider starts must still be controlled entirely inside the DO.
        if (JSON.parse(body).query.includes('first')) {
          await secondReturned;
          callerReturns.push('first');
        } else {
          callerReturns.push('second');
          markSecondReturned();
        }
        return response;
      } };
    }
  };
  const callerFetcher = async () => {
    callerFetcherCalled = true;
    return Response.json({ hits: [] });
  };
  await Promise.all([
    searchYahooShopping({ YAHOO_SHOPPING_CLIENT_ID: 'test-client-id',
      YAHOO_REQUEST_COORDINATOR: namespace }, 'private first query', callerFetcher),
    searchYahooShopping({ YAHOO_SHOPPING_CLIENT_ID: 'test-client-id',
      YAHOO_REQUEST_COORDINATOR: namespace }, 'private second query', callerFetcher)
  ]);
  assert.equal(callerFetcherCalled, false, 'production provider fetch must run inside the Durable Object');
  assert.deepEqual(starts, [initialNow, initialNow + 2400]);
  assert.ok(starts[1] - starts[0] >= 2100);
  assert.deepEqual(callerReturns, ['second', 'first'],
    'caller response jitter must not control provider pacing');
  assert.deepEqual(objectNames, ['yahoo-shopping-application-global', 'yahoo-shopping-application-global']);
  assert.equal(proxyRequests.every(({ url }) =>
    url === 'https://yahoo-request-coordinator.internal/proxy'), true);
  assert.equal(proxyRequests.every(({ method }) => method === 'POST'), true);
  assert.equal(proxyRequests.every(({ body }) => JSON.parse(body).op === 'ITEM_SEARCH'), true);
  const serialized = JSON.stringify(proxyRequests);
  assert.equal(serialized.includes('test-client-id'), false,
    'Client ID must come from the Durable Object environment, never its request');
  assert.equal([...state.values.values()].every(Number.isFinite), true);
});

test('coordinator rejection stops the Yahoo provider request with a fixed safe code', async () => {
  let providerCalled = false;
  const env = {
    YAHOO_SHOPPING_CLIENT_ID: 'private-client-id',
    YAHOO_REQUEST_COORDINATOR: {
      idFromName: () => 'fixed-object-id',
      get: () => ({ fetch: async () => new Response(null, { status: 408 }) })
    }
  };
  await assert.rejects(
    searchYahooShopping(env, 'private query', async () => {
      providerCalled = true;
      return Response.json({ hits: [] });
    }),
    (error) => error.message === 'YAHOO_REQUEST_COORDINATOR_UNAVAILABLE' && error.status === 400
  );
  assert.equal(providerCalled, false);
});

test('coordinator proxy preserves exact Yahoo 401 and 403 classifications', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(searchYahooShopping({
      YAHOO_SHOPPING_CLIENT_ID: 'test-client-id',
      YAHOO_REQUEST_COORDINATOR: {
        idFromName: () => 'fixed-object-id',
        get: () => ({ fetch: async () => new Response(null, {
          status,
          headers: { 'x-hoshilu-yahoo-proxy-result': 'provider' }
        }) })
      }
    }, 'private query'), (error) =>
      error.message === 'YAHOO_SHOPPING_SEARCH_FAILED'
      && error.status === status
      && error.providerCode === `HTTP_${status}`);
  }
});

test('coordinator provider network detail is reduced to a fixed safe error', async () => {
  await assert.rejects(searchYahooShopping({
    YAHOO_SHOPPING_CLIENT_ID: 'test-client-id',
    YAHOO_REQUEST_COORDINATOR: {
      idFromName: () => 'fixed-object-id',
      get: () => ({ fetch: async () => new Response(null, {
        status: 502,
        headers: { 'x-hoshilu-yahoo-proxy-result': 'provider_network' }
      }) })
    }
  }, 'private query'), (error) =>
    error.name === 'TypeError' && error.message === 'YAHOO_PROVIDER_NETWORK_FAILED');
});

test('coordinator keeps fetch and body network phases distinct without private detail', async () => {
  for (const [result, message] of [
    ['provider_fetch_context', 'YAHOO_PROVIDER_FETCH_CONTEXT_FAILED'],
    ['provider_fetch_url', 'YAHOO_PROVIDER_FETCH_URL_FAILED'],
    ['provider_fetch_transport', 'YAHOO_PROVIDER_FETCH_TRANSPORT_FAILED'],
    ['provider_fetch_type', 'YAHOO_PROVIDER_FETCH_TYPE_FAILED'],
    ['provider_fetch_network', 'YAHOO_PROVIDER_FETCH_NETWORK_FAILED'],
    ['provider_body_network', 'YAHOO_PROVIDER_BODY_NETWORK_FAILED']
  ]) {
    await assert.rejects(searchYahooShopping({
      YAHOO_SHOPPING_CLIENT_ID: 'test-client-id',
      YAHOO_REQUEST_COORDINATOR: {
        idFromName: () => 'fixed-object-id',
        get: () => ({ fetch: async () => new Response(null, {
          status: 502,
          headers: { 'x-hoshilu-yahoo-proxy-result': result }
        }) })
      }
    }, 'private query'), (error) =>
      error.name === 'TypeError' && error.message === message);
  }
});

test('an expired caller signal never acquires a coordinator slot or contacts Yahoo', async () => {
  const controller = new AbortController();
  controller.abort();
  let coordinatorCalled = false;
  let providerCalled = false;
  await assert.rejects(searchYahooShopping({
    YAHOO_SHOPPING_CLIENT_ID: 'private-client-id',
    YAHOO_REQUEST_COORDINATOR: {
      idFromName() { coordinatorCalled = true; return 'fixed-object-id'; },
      get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
    }
  }, 'private query', async () => {
    providerCalled = true;
    return Response.json({ hits: [] });
  }, { signal: controller.signal }), /YAHOO_REQUEST_COORDINATOR_UNAVAILABLE/u);
  assert.equal(coordinatorCalled, false);
  assert.equal(providerCalled, false);
});

test('production mode fails closed instead of bypassing a missing coordinator binding', async () => {
  let providerCalled = false;
  await assert.rejects(searchYahooShopping({
    YAHOO_SHOPPING_CLIENT_ID: 'private-client-id',
    YAHOO_REQUEST_COORDINATOR_REQUIRED: 'true'
  }, 'private query', async () => {
    providerCalled = true;
    return Response.json({ hits: [] });
  }), /YAHOO_REQUEST_COORDINATOR_UNAVAILABLE/u);
  assert.equal(providerCalled, false);
});

test('高評価トレンドランキングは公式順位・評価集計・レビューURLだけを保持する', () => {
  const candidates = normalizeYahooHighRatingRanking({ high_rating_trend_ranking: {
    meta: { last_modified: '2026-08-13' },
    ranking_data: [{
      rank: 2,
      item_information: {
        name: '高評価イヤホン', code: 'earbuds-1', jan_code: '4901234567894',
        url: 'https://store.shopping.yahoo.co.jp/shop/earbuds-1.html',
        regular_price: 4980, bargain_price: 3980, premium_price: 2980
      },
      image: { medium: 'https://item-shopping.c.yimg.jp/i/g/shop_earbuds-1' },
      review: { rate: 4.72, count: 1597, url: 'https://shopping.yahoo.co.jp/review/item/list?store_id=shop&page_key=earbuds-1' }
    }]
  } });
  assert.equal(candidates[0].rank, 2);
  assert.equal(candidates[0].record_key, 'JAN:4901234567894');
  assert.equal(candidates[0].offers[0].price, 3980);
  assert.equal(candidates[0].offers[0].total_cost, 0);
  assert.equal(candidates[0].review_average, 4.72);
  assert.equal(candidates[0].review_count, 1597);
  assert.match(candidates[0].review_url, /shopping\.yahoo\.co\.jp\/review/u);
  assert.equal('review_body' in candidates[0], false);
});

test('高評価トレンドランキングAPIへ既存Client IDと検索語を送る', async () => {
  let requested = '';
  const candidates = await fetchYahooHighRatingRanking(
    { YAHOO_SHOPPING_CLIENT_ID: 'secret-client-id' },
    'ワイヤレスイヤホン',
    async (url) => {
      requested = String(url);
      return Response.json({ high_rating_trend_ranking: { ranking_data: [] } });
    }
  );
  const url = new URL(requested);
  assert.equal(url.pathname, '/ShoppingWebService/V1/highRatingTrendRanking');
  assert.equal(url.searchParams.get('appid'), 'secret-client-id');
  assert.equal(url.searchParams.get('query'), 'ワイヤレスイヤホン');
  assert.equal(url.searchParams.get('limit'), '30');
  assert.deepEqual(candidates, []);
});
