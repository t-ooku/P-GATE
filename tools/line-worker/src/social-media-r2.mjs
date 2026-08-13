const ROUTE = /^\/api\/social\/media\/runway\/([A-Za-z0-9][A-Za-z0-9_-]{0,119})\.mp4$/;
const PUBLIC_JOB_STATUSES = new Set([
  'APPROVED_FOR_POST',
  'PUBLISHED'
]);
const SAFE_STORAGE_KEY = /^runway\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:mp4|mov|m4v|webm)$/i;

const jsonError = (status, error, extraHeaders = {}) => Response.json(
  { ok: false, error },
  {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  }
);

function parseRangeHeader(value) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if ((start !== null && !Number.isSafeInteger(start))
    || (end !== null && !Number.isSafeInteger(end))
    || (start !== null && end !== null && end < start)
    || (start === null && end === 0)) return { invalid: true };
  return { start, end };
}

function resolveRange(parsed, size, r2Range) {
  if (!parsed) return null;
  if (parsed.invalid || !Number.isSafeInteger(size) || size < 0) return { invalid: true };
  if (size === 0) return { invalid: true };

  if (r2Range && Number.isSafeInteger(r2Range.offset) && Number.isSafeInteger(r2Range.length)) {
    const start = r2Range.offset;
    const end = start + r2Range.length - 1;
    if (start < 0 || start >= size || end < start || end >= size) return { invalid: true };
    return { start, end, length: r2Range.length };
  }

  if (parsed.start === null) {
    const length = Math.min(parsed.end, size);
    return { start: size - length, end: size - 1, length };
  }
  if (parsed.start >= size) return { invalid: true };
  const end = parsed.end === null ? size - 1 : Math.min(parsed.end, size - 1);
  return { start: parsed.start, end, length: end - parsed.start + 1 };
}

function conditionalStatus(request) {
  if (request.headers.has('if-match') || request.headers.has('if-unmodified-since')) return 412;
  if (request.headers.has('if-none-match') || request.headers.has('if-modified-since')) return 304;
  return 412;
}

function applyObjectMetadata(object, headers) {
  if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers);
  const metadata = object.httpMetadata || {};
  if (!headers.has('content-type') && metadata.contentType) headers.set('content-type', metadata.contentType);
  if (!headers.has('content-language') && metadata.contentLanguage) headers.set('content-language', metadata.contentLanguage);
  if (object.httpEtag) headers.set('etag', object.httpEtag);
}

function safeStorageKey(value) {
  const key = typeof value === 'string' ? value : '';
  return SAFE_STORAGE_KEY.test(key) && !key.includes('..') && !key.includes('\\') ? key : '';
}

/**
 * Serves QA-approved Runway media from the private social R2 bucket. Raw
 * REVIEW_REQUIRED outputs stay private and are retrieved only through the
 * authenticated deployment workflow for human review.
 * Returns null when the request is unrelated so the main Worker router can continue.
 */
export async function handleRunwayMediaRoute(request, env = {}) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const match = ROUTE.exec(url.pathname);
  if (!match) return null;
  if (!['GET', 'HEAD'].includes(request.method)) {
    return jsonError(405, 'METHOD_NOT_ALLOWED', { allow: 'GET, HEAD' });
  }
  if (!env.PRODUCT_DB || !env.SOCIAL_MEDIA_BUCKET) {
    return jsonError(503, 'SOCIAL_MEDIA_UNAVAILABLE');
  }

  const rangeHeader = request.headers.get('range');
  const parsedRange = parseRangeHeader(rangeHeader);
  if (parsedRange?.invalid) {
    return jsonError(416, 'RANGE_NOT_SATISFIABLE', {
      'accept-ranges': 'bytes',
      'content-range': 'bytes */*'
    });
  }

  let job;
  try {
    job = await env.PRODUCT_DB.prepare(`SELECT status,storage_key
      FROM runway_generation_jobs WHERE job_id=?1 LIMIT 1`)
      .bind(match[1])
      .first();
  } catch {
    return jsonError(503, 'SOCIAL_MEDIA_UNAVAILABLE');
  }
  if (!job || !PUBLIC_JOB_STATUSES.has(String(job.status || '').toUpperCase())) {
    return jsonError(404, 'SOCIAL_MEDIA_NOT_FOUND');
  }
  const key = safeStorageKey(job.storage_key);
  if (!key) return jsonError(404, 'SOCIAL_MEDIA_NOT_FOUND');

  let object;
  try {
    object = await env.SOCIAL_MEDIA_BUCKET.get(key, {
      range: request.headers,
      onlyIf: request.headers
    });
  } catch (error) {
    if (rangeHeader && Number(error?.status) === 416) {
      return jsonError(416, 'RANGE_NOT_SATISFIABLE', {
        'accept-ranges': 'bytes',
        'content-range': 'bytes */*'
      });
    }
    return jsonError(503, 'SOCIAL_MEDIA_UNAVAILABLE');
  }
  if (!object) return jsonError(404, 'SOCIAL_MEDIA_NOT_FOUND');

  const headers = new Headers();
  applyObjectMetadata(object, headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400');
  headers.set('x-content-type-options', 'nosniff');

  if (!('body' in object)) {
    return new Response(null, { status: conditionalStatus(request), headers });
  }

  const size = Number(object.size);
  const resolvedRange = resolveRange(parsedRange, size, object.range);
  if (resolvedRange?.invalid) {
    headers.set('content-range', `bytes */${Number.isSafeInteger(size) ? size : '*'}`);
    headers.set('cache-control', 'no-store');
    return new Response(null, { status: 416, headers });
  }

  let status = 200;
  if (resolvedRange) {
    status = 206;
    headers.set('content-range', `bytes ${resolvedRange.start}-${resolvedRange.end}/${size}`);
    headers.set('content-length', String(resolvedRange.length));
  } else if (Number.isSafeInteger(size) && size >= 0) {
    headers.set('content-length', String(size));
  }
  const body = request.method === 'HEAD' ? null : object.body;
  return new Response(body, { status, headers });
}
