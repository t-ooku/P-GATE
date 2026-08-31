const MARKER_KEY = 'gemini-private/20260831/marker.json';
const VIDEO_KEY = 'gemini-private/20260831/gemini-omni-1.1-flash-v2.mp4';
const REPORT_KEY = 'gemini-private/20260831/comparison-input.json';
const REFERENCE_URL =
  'https://hoshilu.app/social/runway/hoshilu-approved-model-reference-v2.jpg';
const MODEL = 'gemini-omni-1.1-flash';
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};
const fixedCode = (error) => {
  const status = Number(error?.status || 0);
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'GEMINI_COMPARE_TIMEOUT';
  if (status === 401 || status === 403) return 'GEMINI_COMPARE_AUTH_FAILED';
  if (status === 429) return 'GEMINI_COMPARE_RATE_LIMITED';
  if (status >= 500) return 'GEMINI_COMPARE_UPSTREAM_5XX';
  if (status >= 400) return 'GEMINI_COMPARE_REQUEST_REJECTED';
  const message = String(error?.message || '');
  if (/REFERENCE/u.test(message)) return 'GEMINI_COMPARE_REFERENCE_FAILED';
  if (/VIDEO_MISSING/u.test(message)) return 'GEMINI_COMPARE_VIDEO_MISSING';
  if (/VIDEO_SIZE/u.test(message)) return 'GEMINI_COMPARE_VIDEO_SIZE_INVALID';
  if (error instanceof TypeError) return 'GEMINI_COMPARE_NETWORK_FAILED';
  return 'GEMINI_COMPARE_FAILED';
};

const reportBody = (value) => JSON.stringify({
  schema: 'hoshilu.private-video-compare.v1',
  private_only: true,
  public_or_social_publish: false,
  model: MODEL,
  reference_asset: 'hoshilu-approved-model-reference-v2.jpg',
  rights: {
    approved_reference: true,
    fictional_adult: true,
    celebrity_or_real_person: false
  },
  adoption_decision: 'REVIEW_REQUIRED',
  ...value
}, null, 2);

function videoBlock(payload) {
  if (payload?.output_video?.data
    && (!payload.output_video.mime_type || payload.output_video.mime_type === 'video/mp4')) {
    return { type: 'video', mime_type: 'video/mp4', data: payload.output_video.data };
  }
  for (const step of Array.isArray(payload?.steps) ? payload.steps : []) {
    for (const item of Array.isArray(step?.content) ? step.content : []) {
      if (item?.type === 'video' && item?.mime_type === 'video/mp4' && item?.data) return item;
    }
  }
  return null;
}

export async function runGeminiPrivateVideoComparison(env = {}, scheduledAt = new Date(),
  fetchImpl = fetch) {
  if (env.GEMINI_PRIVATE_COMPARE_ENABLED !== 'true') {
    return { skipped: true, reason: 'DISABLED' };
  }
  if (!env.SOCIAL_MEDIA_BUCKET) return { skipped: true, reason: 'STORAGE_UNAVAILABLE' };
  if (String(env.GEMINI_API_KEY || '').length < 20) {
    return { skipped: true, reason: 'GEMINI_NOT_CONFIGURED' };
  }
  const existing = await env.SOCIAL_MEDIA_BUCKET.head(MARKER_KEY);
  if (existing) return { skipped: true, reason: 'ALREADY_ATTEMPTED' };

  const startedAt = Date.now();
  await env.SOCIAL_MEDIA_BUCKET.put(MARKER_KEY, reportBody({
    status: 'STARTED',
    scheduled_at: new Date(scheduledAt).toISOString()
  }), { httpMetadata: { contentType: 'application/json' } });

  try {
    const referenceResponse = await fetchImpl(REFERENCE_URL, {
      headers: { accept: 'image/jpeg' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    if (!referenceResponse.ok) throw new Error('REFERENCE_HTTP_FAILED');
    const reference = new Uint8Array(await referenceResponse.arrayBuffer());
    if (reference.byteLength < 1000 || reference.byteLength > 10 * 1024 * 1024) {
      throw new Error('REFERENCE_SIZE_INVALID');
    }

    const prompt = [
      'Create a 3-second vertical social video from this reference image.',
      'The fictional 22-year-old adult AI actress makes one small natural hand gesture',
      'toward her smartphone and smiles, with subtle realistic breathing and stable facial identity.',
      'Keep the bright modern living room, natural daylight, clothing, hands, face, and phone coherent.',
      'No logos, products, text, captions, voice, music, celebrity resemblance, or real-person imitation.',
      'This is a private quality comparison and must not introduce a different person.'
    ].join(' ');
    const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { type: 'image', data: bytesToBase64(reference), mime_type: 'image/jpeg' },
          { type: 'text', text: prompt }
        ],
        generation_config: { video_config: { task: 'image_to_video' } },
        response_format: { type: 'video', aspect_ratio: '9:16', resolution: '720p' }
      }),
      signal: AbortSignal.timeout(14 * 60 * 1000)
    });
    if (!response.ok) {
      const error = new Error('GEMINI_COMPARE_PROVIDER_FAILED');
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const video = videoBlock(payload);
    if (!video) throw new Error('GEMINI_COMPARE_VIDEO_MISSING');
    const binary = atob(video.data);
    if (binary.length < 10000 || binary.length > MAX_VIDEO_BYTES) {
      throw new Error('GEMINI_COMPARE_VIDEO_SIZE_INVALID');
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    await env.SOCIAL_MEDIA_BUCKET.put(VIDEO_KEY, bytes, {
      httpMetadata: { contentType: 'video/mp4' },
      customMetadata: { private: 'true', qa: 'review_required', model: MODEL }
    });
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 100) / 10;
    const report = reportBody({
      status: 'GENERATED_REVIEW_REQUIRED',
      elapsed_seconds: elapsedSeconds,
      output_bytes: bytes.byteLength,
      estimated_max_usd: 1
    });
    await env.SOCIAL_MEDIA_BUCKET.put(REPORT_KEY, report, {
      httpMetadata: { contentType: 'application/json' }
    });
    await env.SOCIAL_MEDIA_BUCKET.put(MARKER_KEY, report, {
      httpMetadata: { contentType: 'application/json' }
    });
    return { skipped: false, status: 'GENERATED_REVIEW_REQUIRED',
      elapsed_seconds: elapsedSeconds, output_bytes: bytes.byteLength };
  } catch (error) {
    const code = fixedCode(error);
    await env.SOCIAL_MEDIA_BUCKET.put(MARKER_KEY, reportBody({
      status: 'FAILED_FINAL', error_code: code
    }), { httpMetadata: { contentType: 'application/json' } });
    return { skipped: false, status: 'FAILED_FINAL', error_code: code };
  }
}

export const geminiPrivateVideoComparisonTest = {
  MARKER_KEY, VIDEO_KEY, REPORT_KEY, REFERENCE_URL, MODEL, fixedCode, videoBlock
};
