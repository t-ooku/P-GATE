import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  YahooRequestCoordinator, YAHOO_PROXY_RESULT_HEADER, YAHOO_REQUEST_INTERVAL_MS
} from '../src/yahoo-request-coordinator.mjs';

function fakeState(options = {}) {
  const values = new Map();
  const writes = [];
  const deletes = [];
  let tail = Promise.resolve();
  return {
    values,
    writes,
    deletes,
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) {
        values.set(key, value);
        writes.push(value);
        await options.onPut?.(key, value);
      },
      async delete(key) { values.delete(key); deletes.push(key); }
    },
    blockConcurrencyWhile(callback) {
      const run = tail.then(callback);
      tail = run.then(() => undefined, () => undefined);
      return run;
    }
  };
}

function proxy(payload = { v: 1, op: 'ITEM_SEARCH', query: 'イヤホン' }, {
  deadline = 30000, signal, providerTimeout = 2500
} = {}) {
  return new Request('https://coordinator.internal/proxy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hoshilu-rate-deadline': String(deadline),
      'x-hoshilu-provider-timeout-ms': String(providerTimeout)
    },
    body: JSON.stringify(payload),
    signal
  });
}

function coordinator(state, options = {}) {
  return new YahooRequestCoordinator(state, {
    YAHOO_SHOPPING_CLIENT_ID: 'test-client-id'
  }, options);
}

test('one durable proxy spaces actual provider starts from prior response completion', async () => {
  let now = 0;
  const starts = [];
  const state = fakeState();
  const object = coordinator(state, {
    clock: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
    fetcher: async () => {
      starts.push(now);
      now += 300;
      return Response.json({ hits: [] });
    }
  });
  const responses = await Promise.all([
    object.fetch(proxy()), object.fetch(proxy()), object.fetch(proxy())
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);
  assert.equal(responses.every((response) =>
    response.headers.get(YAHOO_PROXY_RESULT_HEADER) === 'provider'), true);
  assert.deepEqual(starts, [0, 2400, 4800]);
  assert.equal(starts.every((start, index) => index === 0
    || start - starts[index - 1] >= YAHOO_REQUEST_INTERVAL_MS), true);
  assert.equal([...state.values.values()].every(Number.isFinite), true);
  assert.equal(state.values.get('next_start_at_ms'), 7200);
});

test('persisted completion slot survives object restart and expired work consumes no call', async () => {
  let now = 0;
  let calls = 0;
  const state = fakeState();
  const options = {
    clock: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
    fetcher: async () => { calls += 1; return Response.json({ hits: [] }); }
  };
  assert.equal((await coordinator(state, options).fetch(proxy())).status, 200);
  const restarted = coordinator(state, options);
  assert.equal((await restarted.fetch(proxy(undefined, { deadline: 1000 }))).status, 408);
  assert.equal(calls, 1);
  assert.equal(state.values.get('next_start_at_ms'), 2100);
  assert.equal((await restarted.fetch(proxy())).status, 200);
  assert.equal(calls, 2);
  assert.equal(state.values.get('next_start_at_ms'), 4200);
});

test('past, malformed, and aborted proxy calls never contact Yahoo or change the slot', async () => {
  let now = 5000;
  let calls = 0;
  const state = fakeState();
  state.values.set('next_start_at_ms', 7000);
  const object = coordinator(state, {
    clock: () => now,
    sleep: async (milliseconds) => { now += milliseconds; },
    fetcher: async () => { calls += 1; return Response.json({ hits: [] }); }
  });
  assert.equal((await object.fetch(proxy(undefined, { deadline: 4000 }))).status, 408);
  assert.equal((await object.fetch(proxy(undefined, { deadline: 'invalid' }))).status, 408);
  assert.equal((await object.fetch(proxy({ v: 1, op: 'ITEM_SEARCH', query: 'x',
    appid: 'must-not-be-accepted' }))).status, 400);
  const controller = new AbortController();
  controller.abort();
  assert.equal((await object.fetch(proxy(undefined, { signal: controller.signal }))).status, 408);
  assert.equal(calls, 0);
  assert.deepEqual(state.writes, []);
  assert.equal(state.values.get('next_start_at_ms'), 7000);
});

test('abort while waiting and timer overshoot consume no provider call or slot', async () => {
  let now = 0;
  let calls = 0;
  const state = fakeState();
  state.values.set('next_start_at_ms', 2100);
  const controller = new AbortController();
  const aborting = coordinator(state, {
    clock: () => now,
    sleep: async (milliseconds) => { now += milliseconds; controller.abort(); },
    fetcher: async () => { calls += 1; return Response.json({ hits: [] }); }
  });
  assert.equal((await aborting.fetch(proxy(undefined, { signal: controller.signal }))).status, 408);
  assert.equal(calls, 0);
  assert.deepEqual(state.writes, []);

  now = 0;
  state.values.set('next_start_at_ms', 1000);
  const overshooting = coordinator(state, {
    clock: () => now,
    sleep: async () => { now = 2000; },
    fetcher: async () => { calls += 1; return Response.json({ hits: [] }); }
  });
  assert.equal((await overshooting.fetch(proxy(undefined, { deadline: 1100 }))).status, 408);
  assert.equal(calls, 0);
  assert.deepEqual(state.writes, []);
  assert.equal(state.values.get('next_start_at_ms'), 1000);
});

test('abort during crash-reservation write restores the previous slot', async () => {
  let providerCalled = false;
  const controller = new AbortController();
  const state = fakeState({ onPut: async () => controller.abort() });
  const object = coordinator(state, {
    clock: () => 0,
    fetcher: async () => { providerCalled = true; return Response.json({ hits: [] }); }
  });
  const response = await object.fetch(proxy(undefined, { signal: controller.signal }));
  assert.equal(response.status, 408);
  assert.equal(providerCalled, false);
  assert.equal(state.values.has('next_start_at_ms'), false);
  assert.deepEqual(state.deletes, ['next_start_at_ms']);
});

test('provider fetch uses a local timeout signal after the durable reservation', async () => {
  const controller = new AbortController();
  const request = proxy(undefined, { signal: controller.signal });
  let providerSignal;
  const object = coordinator(fakeState(), {
    clock: () => 0,
    fetcher: async (_url, init) => {
      providerSignal = init.signal;
      controller.abort();
      return Response.json({ hits: [] });
    }
  });
  const response = await object.fetch(request);
  assert.equal(response.status, 200);
  assert.equal(request.signal.aborted, true);
  assert.notEqual(providerSignal, request.signal);
  assert.equal(providerSignal.aborted, false,
    'the internal caller signal must not cancel an already-reserved provider fetch');
});

test('provider 401/403 status is preserved but provider body and headers are discarded', async () => {
  const state = fakeState();
  let cancelled = false;
  const object = coordinator(state, {
    clock: () => 0,
    fetcher: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('query and credential must not escape'));
      },
      cancel() { cancelled = true; }
    }), {
      status: 403,
      headers: { 'x-provider-private': 'must-not-escape' }
    })
  });
  const response = await object.fetch(proxy());
  assert.equal(response.status, 403);
  assert.equal(response.headers.get(YAHOO_PROXY_RESULT_HEADER), 'provider');
  assert.equal(response.headers.has('x-provider-private'), false);
  assert.equal(await response.text(), '');
  assert.equal(cancelled, true);
});

test('chunked provider responses are cancelled at the hard two-megabyte cap', async () => {
  const state = fakeState();
  let cancelled = false;
  const oversizedChunk = new Uint8Array((1024 * 1024) + 1);
  const object = coordinator(state, {
    clock: () => 0,
    fetcher: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(oversizedChunk);
        controller.enqueue(oversizedChunk);
      },
      cancel() { cancelled = true; }
    }), { headers: { 'content-type': 'application/json' } })
  });
  const response = await object.fetch(proxy());
  assert.equal(response.status, 502);
  assert.equal(response.headers.get(YAHOO_PROXY_RESULT_HEADER), 'provider');
  assert.equal(await response.text(), '');
  assert.equal(cancelled, true);
});

test('proxy only calls fixed Yahoo endpoints and never persists request data', async () => {
  let requested = '';
  const state = fakeState();
  const object = coordinator(state, {
    clock: () => 0,
    fetcher: async (url) => { requested = String(url); return Response.json({ hits: [] }); }
  });
  const response = await object.fetch(proxy({
    v: 1, op: 'ITEM_SEARCH', query: 'private query', seller_id: 'zozo', sort: '-score'
  }));
  assert.equal(response.status, 200);
  const url = new URL(requested);
  assert.equal(url.origin, 'https://shopping.yahooapis.jp');
  assert.equal(url.pathname, '/ShoppingWebService/V3/itemSearch');
  assert.equal(url.searchParams.get('seller_id'), 'zozo');
  assert.equal(url.searchParams.get('sort'), '-score');
  assert.equal([...state.values.values()].every(Number.isFinite), true);
  assert.equal(JSON.stringify([...state.values.entries()]).includes('private query'), false);
  assert.equal((await object.fetch(proxy({
    v: 1, op: 'ITEM_SEARCH', query: 'x', url: 'https://attacker.example/'
  }))).status, 400);
});

test('provider fetch and response-body failures use distinct fixed codes', async () => {
  const fetchFailure = coordinator(fakeState(), {
    clock: () => 0,
    fetcher: async () => { throw new TypeError('private transport detail'); }
  });
  const fetchResponse = await fetchFailure.fetch(proxy());
  assert.equal(fetchResponse.status, 502);
  assert.equal(fetchResponse.headers.get(YAHOO_PROXY_RESULT_HEADER), 'provider_fetch_type');
  assert.equal(await fetchResponse.text(), '');

  for (const [message, expected] of [
    ['Disallowed operation called within global scope', 'provider_fetch_context'],
    ['Invalid URL scheme', 'provider_fetch_url'],
    ['Network connection lost', 'provider_fetch_transport']
  ]) {
    const object = coordinator(fakeState(), {
      clock: () => 0,
      fetcher: async () => { throw new TypeError(message); }
    });
    const response = await object.fetch(proxy());
    assert.equal(response.headers.get(YAHOO_PROXY_RESULT_HEADER), expected);
    assert.equal(await response.text(), '');
  }

  const bodyFailure = coordinator(fakeState(), {
    clock: () => 0,
    fetcher: async () => new Response(new ReadableStream({
      pull() { throw new TypeError('private stream detail'); }
    }), { headers: { 'content-type': 'application/json' } })
  });
  const bodyResponse = await bodyFailure.fetch(proxy());
  assert.equal(bodyResponse.status, 502);
  assert.equal(bodyResponse.headers.get(YAHOO_PROXY_RESULT_HEADER), 'provider_body_network');
  assert.equal(await bodyResponse.text(), '');
});

test('Wrangler binds one SQLite Durable Object coordinator', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.durable_objects.bindings, [{
    name: 'YAHOO_REQUEST_COORDINATOR', class_name: 'YahooRequestCoordinator'
  }]);
  assert.deepEqual(config.migrations, [{
    tag: 'yahoo-request-coordinator-v1', new_sqlite_classes: ['YahooRequestCoordinator']
  }]);
  assert.ok(config.compatibility_flags.includes('enable_request_signal'));
  assert.equal(config.observability.traces.enabled, false,
    'automatic fetch tracing must stay disabled because Yahoo requires appid in its URL');
});
