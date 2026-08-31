import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runGeminiPrivateVideoComparison, geminiPrivateVideoComparisonTest
} from '../src/gemini-private-video-compare.mjs';

function bucket() {
  const objects = new Map();
  return {
    objects,
    async head(key) { return objects.has(key) ? { key } : null; },
    async put(key, value, options = {}) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
      objects.set(key, { bytes, options });
      return { key };
    }
  };
}

const base64 = (length) => btoa('v'.repeat(length));

test('one private Gemini comparison writes review-required media once', async () => {
  const storage = bucket();
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/social/runway/')) {
      return new Response(new Uint8Array(2000), {
        headers: { 'content-type': 'image/jpeg' }
      });
    }
    return Response.json({
      output_video: { mime_type: 'video/mp4', data: base64(12000) }
    });
  };
  const env = {
    GEMINI_PRIVATE_COMPARE_ENABLED: 'true',
    GEMINI_API_KEY: 'g'.repeat(32),
    SOCIAL_MEDIA_BUCKET: storage
  };
  const result = await runGeminiPrivateVideoComparison(
    env, new Date('2026-08-31T06:44:00.000Z'), fetcher
  );
  assert.equal(result.status, 'GENERATED_REVIEW_REQUIRED');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  const request = JSON.parse(calls[1].options.body);
  assert.equal(request.model, 'gemini-omni-1.1-flash');
  assert.equal(request.response_format.aspect_ratio, '9:16');
  assert.equal(request.response_format.resolution, '720p');
  assert.equal(request.generation_config.video_config.task, 'image_to_video');
  assert.equal(request.input.some((item) => item.type === 'text'
    && /No logos, products, text, captions, voice, music/u.test(item.text)), true);
  assert.equal(storage.objects.has(geminiPrivateVideoComparisonTest.VIDEO_KEY), true);
  const marker = JSON.parse(new TextDecoder().decode(
    storage.objects.get(geminiPrivateVideoComparisonTest.MARKER_KEY).bytes
  ));
  assert.equal(marker.private_only, true);
  assert.equal(marker.public_or_social_publish, false);
  assert.equal(marker.adoption_decision, 'REVIEW_REQUIRED');
  assert.equal(marker.status, 'GENERATED_REVIEW_REQUIRED');

  const repeated = await runGeminiPrivateVideoComparison(env, new Date(), fetcher);
  assert.deepEqual(repeated, { skipped: true, reason: 'ALREADY_ATTEMPTED' });
  assert.equal(calls.length, 2);
});

test('provider failure is fixed-code, final, and does not retry', async () => {
  const storage = bucket();
  let calls = 0;
  const result = await runGeminiPrivateVideoComparison({
    GEMINI_PRIVATE_COMPARE_ENABLED: 'true',
    GEMINI_API_KEY: 'g'.repeat(32),
    SOCIAL_MEDIA_BUCKET: storage
  }, new Date(), async (url) => {
    calls += 1;
    if (String(url).includes('/social/runway/')) return new Response(new Uint8Array(2000));
    return new Response('private provider detail', { status: 429 });
  });
  assert.equal(result.status, 'FAILED_FINAL');
  assert.equal(result.error_code, 'GEMINI_COMPARE_RATE_LIMITED');
  const markerText = new TextDecoder().decode(
    storage.objects.get(geminiPrivateVideoComparisonTest.MARKER_KEY).bytes
  );
  assert.match(markerText, /GEMINI_COMPARE_RATE_LIMITED/u);
  assert.doesNotMatch(markerText, /private provider detail/u);
  const repeated = await runGeminiPrivateVideoComparison({
    GEMINI_PRIVATE_COMPARE_ENABLED: 'true',
    GEMINI_API_KEY: 'g'.repeat(32),
    SOCIAL_MEDIA_BUCKET: storage
  }, new Date(), async () => { calls += 1; return new Response(); });
  assert.deepEqual(repeated, { skipped: true, reason: 'ALREADY_ATTEMPTED' });
  assert.equal(calls, 2);
});

test('disabled or unconfigured comparison has no storage or provider effect', async () => {
  const storage = bucket();
  let calls = 0;
  assert.deepEqual(await runGeminiPrivateVideoComparison({
    SOCIAL_MEDIA_BUCKET: storage
  }, new Date(), async () => { calls += 1; }), { skipped: true, reason: 'DISABLED' });
  assert.deepEqual(await runGeminiPrivateVideoComparison({
    GEMINI_PRIVATE_COMPARE_ENABLED: 'true',
    SOCIAL_MEDIA_BUCKET: storage
  }, new Date(), async () => { calls += 1; }), {
    skipped: true, reason: 'GEMINI_NOT_CONFIGURED'
  });
  assert.equal(calls, 0);
  assert.equal(storage.objects.size, 0);
});
