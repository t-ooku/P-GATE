import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProductUgcCredits,
  calculateRunwayCredits,
  createRunwayClient,
  createRunwayProductUgc,
  getRunwayOrganization,
  getRunwayOrganizationUsage,
  getRunwayTask,
  normalizeProductUgcRequest
} from '../src/runway-client.mjs';

const ENV = { RUNWAYML_API_SECRET: 'runway-secret-never-log' };

test('Runway cost calculator returns exact integer credit costs', () => {
  assert.equal(calculateProductUgcCredits(4), 192);
  assert.equal(calculateProductUgcCredits(8), 336);
  assert.equal(calculateProductUgcCredits(15), 588);
  assert.equal(calculateProductUgcCredits(4, '1080:1920'), 208);
  assert.equal(calculateProductUgcCredits(8, '1080:1920'), 368);
  assert.equal(calculateProductUgcCredits(15, '1080:1920'), 648);
  assert.equal(calculateRunwayCredits({ model: 'product_ugc', duration: 10 }), 408);
  assert.equal(calculateRunwayCredits({ model: 'gen4_turbo', duration: 8 }), 40);
  assert.throws(() => calculateProductUgcCredits(3), /RUNWAY_DURATION_INVALID/);
  assert.throws(() => calculateRunwayCredits({ model: 'unknown', duration: 8 }), /RUNWAY_MODEL_INVALID/);
});

test('organization request uses the official endpoint, bearer auth, and pinned API header', async () => {
  let request;
  const result = await getRunwayOrganization(ENV, async (url, options) => {
    request = { url, options };
    return Response.json({ creditBalance: 1000, tier: {}, usage: {} });
  });
  assert.equal(result.creditBalance, 1000);
  assert.equal(request.url, 'https://api.dev.runwayml.com/v1/organization');
  assert.equal(request.options.method, 'GET');
  assert.deepEqual(request.options.headers, {
    accept: 'application/json',
    authorization: 'Bearer runway-secret-never-log',
    'X-Runway-Version': '2024-11-06'
  });
});

test('organization usage request sends the exact UTC date body', async () => {
  let request;
  const usage = await getRunwayOrganizationUsage(ENV, {
    startDate: '2026-08-01',
    beforeDate: '2026-09-01'
  }, async (url, options) => {
    request = { url, options };
    return Response.json({ models: ['product_ugc'], results: [] });
  });
  assert.deepEqual(usage, { models: ['product_ugc'], results: [] });
  assert.equal(request.url, 'https://api.dev.runwayml.com/v1/organization/usage');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), {
    startDate: '2026-08-01',
    beforeDate: '2026-09-01'
  });
});

test('Product UGC request is pinned to 2026-06 and 720:1280', async () => {
  let request;
  let calls = 0;
  const result = await createRunwayProductUgc(ENV, {
    characterImage: { uri: 'https://hoshilu.app/social/reference/model.jpg' },
    productImage: { uri: 'https://hoshilu.app/social/reference/product.jpg' },
    version: '2026-06',
    ratio: '720:1280',
    duration: 8,
    audio: true,
    productInfo: 'HOSHILUの商品検索サービス',
    userConcept: '事実だけを日本語で短く紹介する'
  }, async (url, options) => {
    calls += 1;
    request = { url, options };
    return Response.json({ id: 'task-product-1' }, { status: 200 });
  });
  assert.deepEqual(result, { id: 'task-product-1' });
  assert.equal(calls, 1);
  assert.equal(request.url, 'https://api.dev.runwayml.com/v1/recipes/product_ugc');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer runway-secret-never-log');
  assert.equal(request.options.headers['X-Runway-Version'], '2024-11-06');
  assert.deepEqual(JSON.parse(request.options.body), {
    characterImage: { uri: 'https://hoshilu.app/social/reference/model.jpg' },
    productImage: { uri: 'https://hoshilu.app/social/reference/product.jpg' },
    version: '2026-06',
    duration: 8,
    ratio: '720:1280',
    audio: true,
    productInfo: 'HOSHILUの商品検索サービス',
    userConcept: '事実だけを日本語で短く紹介する'
  });
});

test('Product UGC validation rejects unsafe or over-budget shapes before fetch', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({ id: 'must-not-run' });
  };
  const base = {
    characterImage: { uri: 'https://hoshilu.app/model.jpg' },
    productImage: { uri: 'https://hoshilu.app/product.jpg' },
    duration: 8
  };
  assert.throws(() => normalizeProductUgcRequest({ ...base, version: 'unsafe-latest' }), /VERSION_INVALID/);
  assert.throws(() => normalizeProductUgcRequest({ ...base, ratio: '1080:1920' }), /RATIO_INVALID/);
  assert.throws(() => createRunwayProductUgc(ENV, { ...base, duration: 16 }, fetchImpl), /DURATION_INVALID/);
  assert.equal(calls, 0);
});

test('generation POST is never retried and provider or network bodies cannot expose the secret', async () => {
  const request = {
    characterImage: { uri: 'https://hoshilu.app/model.jpg' },
    productImage: { uri: 'https://hoshilu.app/product.jpg' },
    duration: 8
  };
  let calls = 0;
  await assert.rejects(async () => createRunwayProductUgc(ENV, request, async () => {
    calls += 1;
    return new Response(`authorization=Bearer ${ENV.RUNWAYML_API_SECRET}`, { status: 401 });
  }), (error) => {
    assert.equal(error.message, 'RUNWAY_PRODUCT_UGC_CREATE_HTTP_401');
    assert.doesNotMatch(String(error.stack), new RegExp(ENV.RUNWAYML_API_SECRET));
    return true;
  });
  assert.equal(calls, 1);

  await assert.rejects(() => createRunwayProductUgc(ENV, request, async () => {
    throw new Error(`transport leaked ${ENV.RUNWAYML_API_SECRET}`);
  }), (error) => {
    assert.equal(error.message, 'RUNWAY_PRODUCT_UGC_CREATE_NETWORK');
    assert.doesNotMatch(String(error.stack), new RegExp(ENV.RUNWAYML_API_SECRET));
    return true;
  });
});

test('task response is returned without mutation and task id is URL encoded', async () => {
  let requestUrl = '';
  const task = await getRunwayTask(ENV, 'task/id 1', async (url) => {
    requestUrl = url;
    return Response.json({
      id: 'task/id 1',
      createdAt: '2026-08-13T08:00:00.000Z',
      status: 'SUCCEEDED',
      output: ['https://example.runwayml.com/output.mp4']
    });
  });
  assert.equal(requestUrl, 'https://api.dev.runwayml.com/v1/tasks/task%2Fid%201');
  assert.deepEqual(task, {
    id: 'task/id 1',
    createdAt: '2026-08-13T08:00:00.000Z',
    status: 'SUCCEEDED',
    output: ['https://example.runwayml.com/output.mp4']
  });
});

test('client wrapper binds environment and fetch implementation', async () => {
  const urls = [];
  const client = createRunwayClient(ENV, async (url) => {
    urls.push(url);
    return Response.json({ creditBalance: 664 });
  });
  assert.equal((await client.getOrganization()).creditBalance, 664);
  assert.deepEqual(urls, ['https://api.dev.runwayml.com/v1/organization']);
});
