import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  handleRunwayGenerationRoutes,
  runRunwayGenerationCycle,
  runwayGenerationReadiness
} from '../src/runway-generation.mjs';
import { handleRunwayMediaRoute } from '../src/social-media-r2.mjs';
import { handleSocialAdminRoutes } from '../src/social-publisher.mjs';

const queueMigration = readFileSync(new URL('../migrations/0006_social_post_queue.sql', import.meta.url), 'utf8');
const runwayMigration = readFileSync(new URL('../migrations/0050_runway_video_generation.sql', import.meta.url), 'utf8');
const initialTestJob = readFileSync(new URL('../ops/runway/initial_test_job_20260813.sql', import.meta.url), 'utf8');

function d1Database(database) {
  class Query {
    constructor(sql, values = []) {
      this.sql = sql;
      this.values = values;
    }
    bind(...values) { return new Query(this.sql, values); }
    async first() { return database.prepare(this.sql).get(...this.values); }
    async all() { return { results: database.prepare(this.sql).all(...this.values) }; }
    async run() {
      const result = database.prepare(this.sql).run(...this.values);
      return { meta: { changes: Number(result.changes) } };
    }
  }
  return {
    prepare: (sql) => new Query(sql),
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function insertApprovedJob(database, overrides = {}) {
  const row = {
    job_id: 'runway-test-20260813-v1',
    post_id: 'hoshilu-runway-test-20260813-v1',
    request_fingerprint: 'fingerprint-v1',
    status: 'APPROVED',
    recipe: 'product_ugc',
    recipe_version: '2026-06',
    character_image_url: 'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v1.jpg',
    product_image_url: 'https://hoshilu.app/social/runway/hoshilu-product-screen-v1.jpg',
    duration_seconds: 8,
    ratio: '720:1280',
    audio: 1,
    product_info: 'HOSHILUは、名前が分からない商品も覚えている特徴から探せる商品検索サービスです。',
    user_concept: '日本語で短く、事実だけを話す。',
    caption: '名前が分からなくても、欲しい物を探せる。※この動画はAI生成・AI加工映像です。',
    link: 'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_test&utm_content=20260813',
    expected_credits: 336,
    rights_confirmed: 1,
    ai_disclosure_confirmed: 1,
    scheduled_at: '2026-08-13T00:00:00.000Z',
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:00.000Z',
    ...overrides
  };
  const columns = Object.keys(row);
  database.prepare(`INSERT INTO runway_generation_jobs (${columns.join(',')})
    VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((column) => row[column]));
}

function testEnvironment(database, stored, overrides = {}) {
  return {
    RUNWAY_GENERATION_ENABLED: 'true',
    RUNWAYML_API_SECRET: 'test-secret-never-log',
    RUNWAY_INITIAL_TEST_CREDIT_LIMIT: '1000',
    RUNWAY_MONTHLY_CREDIT_LIMIT: '3000',
    SOCIAL_ADMIN_SECRET: 's'.repeat(32),
    PRODUCT_DB: d1Database(database),
    SOCIAL_MEDIA_BUCKET: {
      async put(key, body, options) {
        const bytes = new Uint8Array(await new Response(body).arrayBuffer());
        stored.push({ key, bytes, options });
        return { size: bytes.byteLength, httpEtag: '"stored-etag"' };
      },
      async delete(key) { stored.push({ deleted: key }); }
    },
    ...overrides
  };
}

test('Runway readiness never exposes the API secret', () => {
  const readiness = runwayGenerationReadiness({
    RUNWAY_GENERATION_ENABLED: 'true',
    RUNWAYML_API_SECRET: 'must-not-appear',
    PRODUCT_DB: {},
    SOCIAL_MEDIA_BUCKET: {}
  });
  assert.deepEqual(readiness, {
    api_configured: true,
    database_configured: true,
    media_storage_configured: true,
    enabled: true,
    ready: true
  });
  assert.doesNotMatch(JSON.stringify(readiness), /must-not-appear/);
});

test('初回テストジョブは許諾・AI表記・UTM・336 creditsを固定して冪等登録する', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(runwayMigration);
  database.exec(initialTestJob);
  database.exec(initialTestJob);
  const job = database.prepare('SELECT * FROM runway_generation_jobs').get();
  assert.equal(job.status, 'APPROVED');
  assert.equal(job.expected_credits, 336);
  assert.equal(job.max_attempts, 1);
  assert.equal(job.rights_confirmed, 1);
  assert.equal(job.ai_disclosure_confirmed, 1);
  assert.match(job.caption, /AI生成・AI加工映像/);
  assert.equal(new URL(job.link).searchParams.get('utm_content'), 'runway_product_ugc_test_20260813_v1');
  const fingerprintPayload = {
    recipe: job.recipe,
    recipe_version: job.recipe_version,
    character_image_url: job.character_image_url,
    product_image_url: job.product_image_url,
    duration_seconds: job.duration_seconds,
    ratio: job.ratio,
    audio: job.audio,
    expected_credits: job.expected_credits,
    product_info: job.product_info,
    user_concept: job.user_concept
  };
  assert.equal(job.request_fingerprint,
    createHash('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex'));
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM runway_generation_jobs').get().total, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM runway_approval_grants').get().total, 1);
});

test('承認済み1件だけを生成し、R2保存後はREVIEW_REQUIREDで停止する', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  database.exec(queueMigration);
  database.exec(runwayMigration);
  insertApprovedJob(database);
  const stored = [];
  const env = testEnvironment(database, stored);
  let creates = 0;
  let taskChecks = 0;
  const providerFetch = async (url, options = {}) => {
    if (url.endsWith('/v1/organization')) {
      return Response.json({ creditBalance: 1000, tier: {}, usage: {} });
    }
    if (url.endsWith('/v1/organization/usage')) {
      return Response.json({ models: [], results: [] });
    }
    if (url.endsWith('/v1/recipes/product_ugc')) {
      creates += 1;
      assert.equal(options.headers.authorization, 'Bearer test-secret-never-log');
      assert.equal(JSON.parse(options.body).duration, 8);
      return Response.json({ id: 'provider-task-1' });
    }
    if (url.endsWith('/v1/tasks/provider-task-1')) {
      taskChecks += 1;
      return Response.json({
        id: 'provider-task-1', status: 'SUCCEEDED',
        output: ['https://cdn.runway.example/output.mp4']
      });
    }
    if (url === 'https://cdn.runway.example/output.mp4') {
      return new Response(new Uint8Array([0, 1, 2, 3]), {
        headers: { 'content-type': 'video/mp4', 'content-length': '4' }
      });
    }
    return Response.json({ error: 'unexpected' }, { status: 404 });
  };

  const submitted = await runRunwayGenerationCycle(env, new Date('2026-08-13T08:00:00.000Z'), providerFetch);
  assert.equal(submitted.result.action, 'submitted');
  assert.equal(submitted.result.expected_credits, 336);
  assert.equal(creates, 1);
  assert.equal(database.prepare("SELECT status FROM runway_generation_jobs").get().status, 'PROCESSING');
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM runway_cost_reservations WHERE status='SUBMITTED'").get().total, 2);

  const generated = await runRunwayGenerationCycle(env, new Date('2026-08-13T08:15:00.000Z'), providerFetch);
  assert.equal(generated.result.action, 'generated_review_required');
  assert.equal(taskChecks, 1);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].key, 'runway/runway-test-20260813-v1/output.mp4');
  assert.equal(database.prepare("SELECT status FROM runway_generation_jobs").get().status, 'GENERATED_REVIEW_REQUIRED');
  assert.equal(database.prepare("SELECT status FROM social_post_queue").get().status, 'REVIEW_REQUIRED');
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM runway_cost_reservations WHERE status='SETTLED'").get().total, 2);

  const rawMedia = await handleRunwayMediaRoute(new Request(
    'https://hoshilu.app/api/social/media/runway/runway-test-20260813-v1.mp4'
  ), env);
  assert.equal(rawMedia.status, 404);

  const genericApproval = await handleSocialAdminRoutes(new Request(
    'https://hoshilu.app/api/internal/social/approve', {
      method: 'POST',
      headers: { authorization: `Bearer ${'s'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        post_id: 'hoshilu-runway-test-20260813-v1',
        scheduled_at: '2026-08-13T09:00:00.000Z'
      })
    }
  ), env);
  assert.equal(genericApproval.status, 409);
  assert.equal((await genericApproval.json()).error, 'RUNWAY_QA_REQUIRED');
  assert.equal(database.prepare("SELECT status FROM social_post_queue").get().status, 'REVIEW_REQUIRED');

  const prematureApproval = await handleRunwayGenerationRoutes(new Request(
    'https://hoshilu.app/api/internal/runway/approve', {
      method: 'POST',
      headers: { authorization: `Bearer ${'s'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: 'runway-test-20260813-v1',
        scheduled_at: '2026-08-13T09:00:00.000Z',
        checks: { identity_consistent: true }
      })
    }
  ), env);
  assert.equal(prematureApproval.status, 409);
  assert.equal((await prematureApproval.json()).error, 'RUNWAY_QA_INCOMPLETE');

  const stopped = await runRunwayGenerationCycle(env, new Date('2026-08-13T08:30:00.000Z'), providerFetch);
  assert.equal(stopped.result.action, 'review_required');
  assert.equal(creates, 1);

  const completeChecks = Object.fromEntries([
    'identity_consistent', 'face_hands_ok', 'hoshilu_visible', 'japanese_subtitles',
    'url_visible', 'audio_present', 'no_unrelated_brand', 'factual', 'ai_disclosure',
    'rights_confirmed', 'duplicate_checked', 'postprocessed'
  ].map((name) => [name, true]));
  const approval = await handleRunwayGenerationRoutes(new Request(
    'https://hoshilu.app/api/internal/runway/approve', {
      method: 'POST',
      headers: { authorization: `Bearer ${'s'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: 'runway-test-20260813-v1',
        scheduled_at: '2026-08-13T09:00:00.000Z',
        checks: completeChecks
      })
    }
  ), env);
  assert.equal(approval.status, 200);
  assert.equal(database.prepare('SELECT status FROM runway_generation_jobs').get().status, 'APPROVED_FOR_POST');
  assert.equal(database.prepare('SELECT status FROM social_post_queue').get().status, 'APPROVED');
  assert.equal(database.prepare('SELECT initial_test_completed FROM runway_budget_policy').get().initial_test_completed, 1);
  assert.equal(database.prepare('SELECT media_url FROM social_post_queue').get().media_url,
    'https://hoshilu.app/api/social/media/runway/runway-test-20260813-v1.mp4');
});

test('Runway報告使用量が初回上限を超える生成はAPI送信前に止める', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(queueMigration);
  database.exec(runwayMigration);
  insertApprovedJob(database, { job_id: 'budget-job', post_id: 'budget-post', request_fingerprint: 'budget-fp' });
  const env = testEnvironment(database, []);
  let creates = 0;
  const providerFetch = async (url) => {
    if (url.endsWith('/v1/organization')) return Response.json({ creditBalance: 1000, tier: {}, usage: {} });
    if (url.endsWith('/v1/organization/usage')) {
      return Response.json({
        models: ['product_ugc'],
        results: [{ date: '2026-08-13', usedCredits: [{ model: 'product_ugc', amount: 800 }] }]
      });
    }
    creates += 1;
    return Response.json({ id: 'must-not-create' });
  };
  const result = await runRunwayGenerationCycle(env, new Date('2026-08-13T09:00:00.000Z'), providerFetch);
  assert.equal(result.result.action, 'blocked');
  assert.equal(result.result.error, 'RUNWAY_INITIAL_TEST_LIMIT');
  assert.equal(creates, 0);
  assert.equal(database.prepare("SELECT status FROM runway_generation_jobs").get().status, 'BUDGET_BLOCKED');
});

test('投稿キューとの承認競合時は初回1000-credit上限を解除しない', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(queueMigration);
  database.exec(runwayMigration);
  insertApprovedJob(database, {
    status: 'GENERATED_REVIEW_REQUIRED',
    storage_key: 'runway/runway-test-20260813-v1/output.mp4',
    qa_status: 'PENDING'
  });
  const env = testEnvironment(database, []);
  const checks = Object.fromEntries([
    'identity_consistent', 'face_hands_ok', 'hoshilu_visible', 'japanese_subtitles',
    'url_visible', 'audio_present', 'no_unrelated_brand', 'factual', 'ai_disclosure',
    'rights_confirmed', 'duplicate_checked', 'postprocessed'
  ].map((name) => [name, true]));
  const response = await handleRunwayGenerationRoutes(new Request(
    'https://hoshilu.app/api/internal/runway/approve', {
      method: 'POST',
      headers: { authorization: `Bearer ${'s'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: 'runway-test-20260813-v1',
        scheduled_at: '2026-08-13T09:00:00.000Z',
        checks
      })
    }
  ), env);
  assert.equal(response.status, 409);
  assert.equal(database.prepare('SELECT initial_test_completed FROM runway_budget_policy').get().initial_test_completed, 0);
});

test('課金見込みと確定料金式が一致しないジョブは送信しない', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(queueMigration);
  database.exec(runwayMigration);
  insertApprovedJob(database, {
    job_id: 'mismatch-job', post_id: 'mismatch-post', request_fingerprint: 'mismatch-fp', expected_credits: 40
  });
  const env = testEnvironment(database, []);
  let creates = 0;
  const providerFetch = async (url) => {
    if (url.endsWith('/v1/organization')) return Response.json({ creditBalance: 1000, tier: {}, usage: {} });
    if (url.endsWith('/v1/organization/usage')) return Response.json({ models: [], results: [] });
    creates += 1;
    return Response.json({ id: 'must-not-create' });
  };
  const result = await runRunwayGenerationCycle(env, new Date('2026-08-13T09:00:00.000Z'), providerFetch);
  assert.equal(result.result.error, 'RUNWAY_COST_MISMATCH');
  assert.equal(creates, 0);
  assert.equal(database.prepare("SELECT status FROM runway_generation_jobs").get().status, 'FAILED_FINAL');
});

test('生成APIの2xx応答にtask IDがない場合は予算を保持して再送しない', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(queueMigration);
  database.exec(runwayMigration);
  insertApprovedJob(database, { job_id: 'unknown-job', post_id: 'unknown-post', request_fingerprint: 'unknown-fp' });
  const env = testEnvironment(database, []);
  let creates = 0;
  const providerFetch = async (url) => {
    if (url.endsWith('/v1/organization')) return Response.json({ creditBalance: 1000 });
    if (url.endsWith('/v1/organization/usage')) return Response.json({ results: [] });
    if (url.endsWith('/v1/recipes/product_ugc')) {
      creates += 1;
      return Response.json({});
    }
    return Response.json({}, { status: 404 });
  };
  const first = await runRunwayGenerationCycle(env, new Date('2026-08-13T09:00:00.000Z'), providerFetch);
  assert.equal(first.result.action, 'unknown');
  assert.equal(database.prepare('SELECT status FROM runway_generation_jobs').get().status, 'AMBIGUOUS_SUBMISSION');
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM runway_cost_reservations WHERE status='UNKNOWN'").get().total, 2);
  const second = await runRunwayGenerationCycle(env, new Date('2026-08-13T09:15:00.000Z'), providerFetch);
  assert.equal(second.result.action, 'manual_reconciliation_required');
  assert.equal(creates, 1);
});

test('Runway使用量応答の形が不明な場合は生成をfail-closedする', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(queueMigration);
  database.exec(runwayMigration);
  insertApprovedJob(database, { job_id: 'usage-job', post_id: 'usage-post', request_fingerprint: 'usage-fp' });
  const env = testEnvironment(database, []);
  let creates = 0;
  const providerFetch = async (url) => {
    if (url.endsWith('/v1/organization')) return Response.json({ creditBalance: 1000 });
    if (url.endsWith('/v1/organization/usage')) return Response.json({ unexpected: [] });
    creates += 1;
    return Response.json({ id: 'must-not-create' });
  };
  const result = await runRunwayGenerationCycle(env, new Date('2026-08-13T09:00:00.000Z'), providerFetch);
  assert.equal(result.action, 'usage_sync_failed');
  assert.equal(creates, 0);
  assert.equal(database.prepare('SELECT status FROM runway_generation_jobs').get().status, 'APPROVED');
});
