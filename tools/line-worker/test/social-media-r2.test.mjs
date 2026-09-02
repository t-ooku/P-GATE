import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRunwayMediaRoute } from '../src/social-media-r2.mjs';

const encoder = new TextEncoder();

function makeEnv({
  status = 'APPROVED_FOR_POST',
  storageKey = 'runway/job-123/output.mp4',
  body = '0123456789',
  etag = '"etag-1"',
  conditional = false
} = {}) {
  const calls = { db: [], bucket: [] };
  const bytes = encoder.encode(body);
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        return {
          bind(jobId) {
            calls.db.push({ sql, jobId });
            return {
              first: async () => ({ status, storage_key: storageKey })
            };
          }
        };
      }
    },
    SOCIAL_MEDIA_BUCKET: {
      async get(key, options) {
        calls.bucket.push({ key, options });
        if (conditional) {
          return {
            size: bytes.byteLength,
            httpEtag: etag,
            writeHttpMetadata(headers) {
              headers.set('content-type', 'video/mp4');
            }
          };
        }
        const range = options.range.get('range');
        let offset = 0;
        let length = bytes.byteLength;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (match?.[1]) {
            offset = Number(match[1]);
            const end = match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
            length = Math.max(0, end - offset + 1);
          } else if (match?.[2]) {
            length = Math.min(Number(match[2]), bytes.byteLength);
            offset = bytes.byteLength - length;
          }
        }
        return {
          body: bytes.slice(offset, offset + length),
          size: bytes.byteLength,
          range: range ? { offset, length } : undefined,
          httpEtag: etag,
          writeHttpMetadata(headers) {
            headers.set('content-type', 'video/mp4');
          }
        };
      }
    }
  };
  return { env, calls };
}

const request = (path = '/api/social/media/runway/job-123.mp4', options = {}) => new Request(`https://hoshilu.app${path}`, options);

test('unrelated routes return null without reading D1 or R2', async () => {
  const { env, calls } = makeEnv();
  assert.equal(await handleRunwayMediaRoute(request('/api/social/media/other/job-123'), env), null);
  assert.equal(calls.db.length, 0);
  assert.equal(calls.bucket.length, 0);
});

test('GET streams allowlisted ready media with R2 metadata and ETag', async () => {
  const { env, calls } = makeEnv();
  const response = await handleRunwayMediaRoute(request(), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('content-length'), '10');
  assert.equal(response.headers.get('etag'), '"etag-1"');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.match(response.headers.get('cache-control'), /^public,/);
  assert.equal(calls.db[0].jobId, 'job-123');
  assert.equal(calls.bucket[0].key, 'runway/job-123/output.mp4');
  assert.ok(calls.bucket[0].options.range instanceof Headers);
  assert.ok(calls.bucket[0].options.onlyIf instanceof Headers);
});

test('HEAD returns identical object metadata without a response body', async () => {
  const { env } = makeEnv();
  const response = await handleRunwayMediaRoute(request(undefined, { method: 'HEAD' }), env);
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('content-length'), '10');
  assert.equal(response.headers.get('content-type'), 'video/mp4');
});

test('single byte Range is served as 206 with Content-Range', async () => {
  const { env } = makeEnv();
  const response = await handleRunwayMediaRoute(request(undefined, {
    headers: { range: 'bytes=2-5' }
  }), env);
  assert.equal(response.status, 206);
  assert.equal(await response.text(), '2345');
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('content-length'), '4');
});

test('unsatisfiable or multi-range requests return 416', async () => {
  const { env } = makeEnv();
  const beyond = await handleRunwayMediaRoute(request(undefined, { headers: { range: 'bytes=20-30' } }), env);
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get('content-range'), 'bytes */10');

  const multiple = await handleRunwayMediaRoute(request(undefined, { headers: { range: 'bytes=0-1,4-5' } }), env);
  assert.equal(multiple.status, 416);
  assert.equal(multiple.headers.get('content-range'), 'bytes */*');
});

test('If-None-Match R2 conditional miss returns 304 with ETag', async () => {
  const { env } = makeEnv({ conditional: true });
  const response = await handleRunwayMediaRoute(request(undefined, {
    headers: { 'if-none-match': '"etag-1"' }
  }), env);
  assert.equal(response.status, 304);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('etag'), '"etag-1"');
});

test('If-Match R2 conditional miss returns 412', async () => {
  const { env } = makeEnv({ conditional: true });
  const response = await handleRunwayMediaRoute(request(undefined, {
    headers: { 'if-match': '"different-etag"' }
  }), env);
  assert.equal(response.status, 412);
  assert.equal(response.body, null);
});

test('invalid ids, encoded traversal, and unsafe storage keys never reach R2', async () => {
  const first = makeEnv();
  assert.equal(await handleRunwayMediaRoute(request('/api/social/media/runway/../secret.mp4'), first.env), null);
  assert.equal(await handleRunwayMediaRoute(request('/api/social/media/runway/%2e%2e%2fsecret.mp4'), first.env), null);
  assert.equal(first.calls.bucket.length, 0);

  const second = makeEnv({ storageKey: 'runway/../secret.mp4' });
  const response = await handleRunwayMediaRoute(request(), second.env);
  assert.equal(response.status, 404);
  assert.equal(second.calls.bucket.length, 0);
});

test('jobs not ready for review or publish remain private', async () => {
  const { env, calls } = makeEnv({ status: 'GENERATED_REVIEW_REQUIRED' });
  const response = await handleRunwayMediaRoute(request(), env);
  assert.equal(response.status, 404);
  assert.equal(calls.bucket.length, 0);
});

test('missing bucket binding fails closed', async () => {
  const { env, calls } = makeEnv();
  delete env.SOCIAL_MEDIA_BUCKET;
  const response = await handleRunwayMediaRoute(request(), env);
  assert.equal(response.status, 503);
  assert.equal(calls.db.length, 0);
});

// 2026-09-02: 承認前の動画を /admin/reels で再生できるように、管理者だけは
// GENERATED_REVIEW_REQUIRED の生成物を見られる。匿名は従来どおり404。
test('review-required media is viewable only with admin authorization and never cached', async () => {
  const secret = 'S'.repeat(40);
  const { env, calls } = makeEnv({ status: 'GENERATED_REVIEW_REQUIRED' });
  env.SOCIAL_ADMIN_SECRET = secret;
  const anonymous = await handleRunwayMediaRoute(request(), env);
  assert.equal(anonymous.status, 404);
  assert.equal(calls.bucket.length, 0);
  const admin = await handleRunwayMediaRoute(
    new Request('https://hoshilu.app/api/social/media/runway/job-123.mp4', { headers: { authorization: `Bearer ${secret}` } }),
    env
  );
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get('cache-control'), 'private, no-store');
  assert.equal(await admin.text(), '0123456789');
  const wrong = await handleRunwayMediaRoute(
    new Request('https://hoshilu.app/api/social/media/runway/job-123.mp4', { headers: { authorization: 'Bearer nope' } }),
    env
  );
  assert.equal(wrong.status, 404);
});

test('admin reels page can play same-origin video and shows a preview before approval', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../src/admin-sp-api-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /media-src 'self'/u);
  const script = readFileSync(new URL('../public/admin-reels.js', import.meta.url), 'utf8');
  assert.match(script, /document\.createElement\('video'\)/u);
  assert.match(script, /\/api\/social\/media\/runway\/\$\{encodeURIComponent\(job\.job_id\)\}\.mp4/u);
  assert.match(script, /\['GENERATED_REVIEW_REQUIRED','APPROVED_FOR_POST','PUBLISHED'\]\.includes\(job\.status\)/u);
});
