import {
  calculateProductUgcCredits,
  createRunwayProductUgc,
  getRunwayOrganization,
  getRunwayOrganizationUsage,
  getRunwayTask
} from './runway-client.mjs';
import { authorizeAdminRequest } from './admin-auth.mjs';

const ACTIVE_STATUSES = new Set([
  'BUDGET_RESERVED', 'SUBMITTING', 'PROCESSING', 'AMBIGUOUS_SUBMISSION'
]);
const OUTPUT_LIMIT_DEFAULT = 100 * 1024 * 1024;
const TEST_PERIOD_KEY = 'INITIAL_2026-08-13';

const clean = (value, max = 500) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const integer = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

const utcDate = (date) => date.toISOString().slice(0, 10);
const utcMonth = (date) => date.toISOString().slice(0, 7);
const monthStartDate = (date) => `${utcMonth(date)}-01`;
const tomorrowDate = (date) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return utcDate(next);
};

function safeHttpsUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('RUNWAY_URL_INVALID');
  return url.toString();
}

function safeHoshiluUrl(value, requiredPrefix = '') {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'hoshilu.app' || url.username || url.password) {
    throw new Error('RUNWAY_HOSHILU_URL_INVALID');
  }
  if (requiredPrefix && !url.pathname.startsWith(requiredPrefix)) throw new Error('RUNWAY_ASSET_URL_INVALID');
  return url.toString();
}

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function isPostprocessedStorageKey(jobId, storageKey) {
  const prefix = `runway/${jobId}/postprocessed-`;
  const value = typeof storageKey === 'string' ? storageKey : '';
  return value.startsWith(prefix)
    && /^[0-9a-f]{64}\.mp4$/i.test(value.slice(prefix.length));
}

function normalizeStrongEtag(value) {
  const etag = String(value ?? '').trim();
  if (!etag || /^W\//i.test(etag)) return '';
  return etag.startsWith('"') && etag.endsWith('"')
    ? etag.slice(1, -1)
    : etag;
}

async function verifyPostprocessedMedia(env, job) {
  if (!isPostprocessedStorageKey(job.job_id, job.storage_key)) {
    return { ok: false, reason: 'STORAGE_KEY_INVALID' };
  }
  if (!env.SOCIAL_MEDIA_BUCKET || typeof env.SOCIAL_MEDIA_BUCKET.head !== 'function') {
    return { ok: false, unavailable: true, reason: 'STORAGE_UNAVAILABLE' };
  }

  let object;
  try {
    object = await env.SOCIAL_MEDIA_BUCKET.head(job.storage_key);
  } catch {
    return { ok: false, unavailable: true, reason: 'STORAGE_UNAVAILABLE' };
  }
  if (!object) return { ok: false, reason: 'OBJECT_NOT_FOUND' };

  const objectContentType = String(object.httpMetadata?.contentType || '').trim().toLowerCase();
  const databaseContentType = String(job.storage_content_type || '').trim().toLowerCase();
  if (objectContentType !== 'video/mp4' || databaseContentType !== 'video/mp4') {
    return { ok: false, reason: 'CONTENT_TYPE_MISMATCH' };
  }

  const objectSize = Number(object.size);
  const databaseSize = Number(job.storage_size_bytes);
  if (!Number.isSafeInteger(objectSize) || objectSize <= 0
    || !Number.isSafeInteger(databaseSize) || databaseSize <= 0
    || objectSize !== databaseSize) {
    return { ok: false, reason: 'SIZE_MISMATCH' };
  }

  // Older rows may have a true SQL NULL storage_etag. They remain eligible only
  // when key, existence, type and size all match. Blank strings are not treated
  // as NULL. When an ETag was recorded, a strong R2 ETag match is mandatory;
  // blank/weak/missing/mismatched values fail shut.
  const databaseEtagIsNull = job.storage_etag == null;
  const databaseEtag = normalizeStrongEtag(job.storage_etag);
  if (!databaseEtagIsNull && !databaseEtag) {
    return { ok: false, reason: 'ETAG_MISMATCH' };
  }
  if (databaseEtag) {
    const objectEtags = [object.httpEtag, object.etag]
      .map(normalizeStrongEtag)
      .filter(Boolean);
    if (!objectEtags.includes(databaseEtag)) {
      return { ok: false, reason: 'ETAG_MISMATCH' };
    }
  }

  return {
    ok: true,
    storage_key: job.storage_key,
    storage_size_bytes: databaseSize,
    storage_content_type: job.storage_content_type,
    storage_etag_is_null: databaseEtagIsNull ? 1 : 0,
    storage_etag: databaseEtagIsNull ? '' : String(job.storage_etag)
  };
}

async function promoteReviewedMedia(env, job, now = new Date()) {
  if (isPostprocessedStorageKey(job.job_id, job.storage_key)) return job;
  if (job.storage_key !== `runway/${job.job_id}/output.mp4`
    || typeof env.SOCIAL_MEDIA_BUCKET?.get !== 'function') return job;
  const size = integer(job.storage_size_bytes);
  if (!env.SOCIAL_MEDIA_BUCKET || !job.storage_key || size <= 0 || size > 25 * 1024 * 1024) {
    throw new Error('RUNWAY_REVIEWED_MEDIA_UNAVAILABLE');
  }
  const object = await env.SOCIAL_MEDIA_BUCKET.get(job.storage_key);
  if (!object || String(object.httpMetadata?.contentType || '').toLowerCase() !== 'video/mp4') {
    throw new Error('RUNWAY_REVIEWED_MEDIA_INVALID');
  }
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== size) throw new Error('RUNWAY_REVIEWED_MEDIA_SIZE_MISMATCH');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const storageKey = `runway/${job.job_id}/postprocessed-${digest}.mp4`;
  await env.SOCIAL_MEDIA_BUCKET.put(storageKey, bytes, {
    httpMetadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=3600, stale-while-revalidate=86400' },
    customMetadata: { jobId: job.job_id, reviewedInAdmin: 'true', sha256: digest }
  });
  const timestamp = now.toISOString();
  await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET storage_key=?2,storage_etag=NULL,
      storage_size_bytes=?3,storage_content_type='video/mp4',updated_at=?4
      WHERE job_id=?1 AND status='GENERATED_REVIEW_REQUIRED' AND storage_key=?5`)
      .bind(job.job_id, storageKey, bytes.byteLength, timestamp, job.storage_key),
    auditStatement(env, 'ADMIN_REVIEWED_MEDIA_PROMOTED', job.job_id, {
      storage_key: storageKey, size_bytes: bytes.byteLength, sha256: digest
    }, timestamp)
  ]);
  return { ...job, storage_key: storageKey, storage_etag: null,
    storage_size_bytes: bytes.byteLength, storage_content_type: 'video/mp4' };
}

function auditStatement(env, eventType, jobId, details, timestamp) {
  return env.PRODUCT_DB.prepare(`INSERT INTO runway_audit_log
    (audit_id,event,job_id,attempt_id,detail,created_at)
    VALUES (?1,?2,?3,?4,?5,?6)`)
    .bind(
      crypto.randomUUID(), eventType, jobId || '', clean(details?.attempt_id, 100),
      JSON.stringify(details || {}), timestamp
    );
}

export function runwayGenerationReadiness(env = {}) {
  const apiConfigured = Boolean(String(env.RUNWAYML_API_SECRET || '').trim());
  const databaseConfigured = Boolean(env.PRODUCT_DB);
  const mediaStorageConfigured = Boolean(env.SOCIAL_MEDIA_BUCKET);
  const enabled = env.RUNWAY_GENERATION_ENABLED === 'true';
  return {
    api_configured: apiConfigured,
    database_configured: databaseConfigured,
    media_storage_configured: mediaStorageConfigured,
    enabled,
    ready: apiConfigured && databaseConfigured && mediaStorageConfigured && enabled
  };
}

function providerUsageTotals(payload, initialStart, monthStart) {
  if (!Array.isArray(payload?.results)) throw new Error('RUNWAY_USAGE_RESPONSE_INVALID');
  let initial = 0;
  let month = 0;
  const rows = [];
  for (const day of payload.results) {
    const date = clean(day?.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(day?.usedCredits)) {
      throw new Error('RUNWAY_USAGE_RESPONSE_INVALID');
    }
    for (const item of day.usedCredits) {
      const model = clean(item?.model, 80);
      const rawCredits = Number(item?.amount);
      if (!model || !Number.isSafeInteger(rawCredits)) throw new Error('RUNWAY_USAGE_RESPONSE_INVALID');
      // Refunds can make a provider row negative. Ignoring the negative part is
      // conservative; local settled credits remain in the max() budget guard.
      const credits = Math.max(0, rawCredits);
      rows.push({ date, model, credits });
      if (date >= initialStart) initial += credits;
      if (date >= monthStart) month += credits;
    }
  }
  return { initial, month, rows };
}

async function syncProviderUsage(env, policy, now, fetchImpl) {
  const monthStart = monthStartDate(now);
  const initialStart = clean(policy.initial_started_at, 10) || '2026-08-13';
  const startDate = initialStart < monthStart ? initialStart : monthStart;
  const [organization, usage] = await Promise.all([
    getRunwayOrganization(env, fetchImpl),
    getRunwayOrganizationUsage(env, { startDate, beforeDate: tomorrowDate(now) }, fetchImpl)
  ]);
  const totals = providerUsageTotals(usage, initialStart, monthStart);
  const timestamp = now.toISOString();
  const statements = totals.rows.map((row) => env.PRODUCT_DB.prepare(`INSERT INTO runway_provider_usage_daily
    (usage_date,model,credits,fetched_at)
    VALUES (?1,?2,?3,?4)
    ON CONFLICT(usage_date,model) DO UPDATE SET
      credits=excluded.credits,fetched_at=excluded.fetched_at`)
    .bind(row.date, row.model, row.credits, timestamp));
  if (statements.length) await env.PRODUCT_DB.batch(statements);
  return {
    balance: Math.max(0, integer(organization?.creditBalance)),
    initial: totals.initial,
    month: totals.month,
    observed_at: timestamp
  };
}

async function reservationTotals(env, monthKey) {
  const rows = await env.PRODUCT_DB.prepare(`SELECT scope,
    COALESCE(SUM(CASE WHEN status='SETTLED' THEN credits ELSE 0 END),0) AS settled,
    COALESCE(SUM(CASE WHEN status IN ('RESERVED','SUBMITTED','UNKNOWN') THEN credits ELSE 0 END),0) AS held
    FROM runway_cost_reservations
    WHERE (scope='TEST' AND period_key=?1) OR (scope='MONTH' AND period_key=?2)
    GROUP BY scope`).bind(TEST_PERIOD_KEY, monthKey).all();
  const totals = { TEST: { settled: 0, held: 0 }, MONTH: { settled: 0, held: 0 } };
  for (const row of rows.results || []) {
    if (!totals[row.scope]) continue;
    totals[row.scope] = {
      settled: Math.max(0, integer(row.settled)),
      held: Math.max(0, integer(row.held))
    };
  }
  return totals;
}

function budgetDecision(policy, provider, local, expectedCredits, env = {}) {
  const initialLimit = Math.min(
    integer(policy.initial_cap_credits, 1000),
    integer(env.RUNWAY_INITIAL_TEST_CREDIT_LIMIT, 1000)
  );
  const monthlyLimit = Math.min(
    integer(policy.monthly_cap_credits, 3000),
    integer(env.RUNWAY_MONTHLY_CREDIT_LIMIT, 3000)
  );
  // Provider usage may include manual jobs while a just-finished local task may
  // not yet appear in that usage snapshot. Adding both can conservatively double
  // count, but never undercounts or lets mixed external/local usage cross a cap.
  const monthlyUsed = local.MONTH.settled + provider.month + local.MONTH.held;
  const initialUsed = local.TEST.settled + provider.initial + local.TEST.held;
  if (provider.balance < expectedCredits) return { ok: false, code: 'RUNWAY_BALANCE_INSUFFICIENT' };
  if (monthlyUsed + expectedCredits > monthlyLimit) return { ok: false, code: 'RUNWAY_MONTHLY_LIMIT' };
  if (!integer(policy.initial_test_completed)
    && initialUsed + expectedCredits > initialLimit) return { ok: false, code: 'RUNWAY_INITIAL_TEST_LIMIT' };
  return { ok: true, monthlyUsed, initialUsed, monthlyLimit, initialLimit };
}

async function reserveJob(env, job, now) {
  const timestamp = now.toISOString();
  const attemptNumber = integer(job.attempt_count) + 1;
  const attemptId = crypto.randomUUID();
  const monthKey = utcMonth(now);
  const activeList = [...ACTIVE_STATUSES].map((value) => `'${value}'`).join(',');
  const statements = [
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs
      SET status='BUDGET_RESERVED',attempt_count=?2,updated_at=?3
      WHERE job_id=?1 AND status='APPROVED' AND attempt_count<max_attempts
      AND NOT EXISTS (SELECT 1 FROM runway_generation_jobs
        WHERE job_id<>?1 AND status IN (${activeList}))`)
      .bind(job.job_id, attemptNumber, timestamp),
    env.PRODUCT_DB.prepare(`INSERT INTO runway_generation_attempts
      (attempt_id,job_id,attempt_number,status,expected_credits,created_at,updated_at)
      SELECT ?1,job_id,?2,'RESERVED',expected_credits,?3,?3
      FROM runway_generation_jobs WHERE job_id=?4 AND status='BUDGET_RESERVED'`)
      .bind(attemptId, attemptNumber, timestamp, job.job_id),
    env.PRODUCT_DB.prepare(`INSERT INTO runway_cost_reservations
      (reservation_id,attempt_id,job_id,scope,period_key,status,credits,created_at,updated_at)
      SELECT ?1,?2,job_id,'TEST',?3,'RESERVED',expected_credits,?4,?4
      FROM runway_generation_jobs WHERE job_id=?5 AND status='BUDGET_RESERVED'`)
      .bind(crypto.randomUUID(), attemptId, TEST_PERIOD_KEY, timestamp, job.job_id),
    env.PRODUCT_DB.prepare(`INSERT INTO runway_cost_reservations
      (reservation_id,attempt_id,job_id,scope,period_key,status,credits,created_at,updated_at)
      SELECT ?1,?2,job_id,'MONTH',?3,'RESERVED',expected_credits,?4,?4
      FROM runway_generation_jobs WHERE job_id=?5 AND status='BUDGET_RESERVED'`)
      .bind(crypto.randomUUID(), attemptId, monthKey, timestamp, job.job_id),
    auditStatement(env, 'COST_RESERVED', job.job_id, {
      attempt_id: attemptId,
      attempt_number: attemptNumber,
      credits: integer(job.expected_credits),
      month: monthKey
    }, timestamp)
  ];
  const results = await env.PRODUCT_DB.batch(statements);
  if (changes(results?.[0]) !== 1) return null;
  return { attemptId, attemptNumber };
}

async function markSubmissionUnknown(env, job, attemptId, errorCode, now) {
  const timestamp = now.toISOString();
  await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='AMBIGUOUS_SUBMISSION',
      last_error_code=?2,last_error_stage='SUBMIT',last_error_detail='',updated_at=?3
      WHERE job_id=?1 AND status IN ('BUDGET_RESERVED','SUBMITTING')`)
      .bind(job.job_id, errorCode, timestamp),
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_attempts SET status='UNKNOWN',
      error_code=?2,updated_at=?3 WHERE attempt_id=?1`).bind(attemptId, errorCode, timestamp),
    env.PRODUCT_DB.prepare(`UPDATE runway_cost_reservations SET status='UNKNOWN',updated_at=?2
      WHERE attempt_id=?1 AND status IN ('RESERVED','SUBMITTED')`).bind(attemptId, timestamp),
    auditStatement(env, 'SUBMISSION_UNKNOWN', job.job_id, { attempt_id: attemptId, error_code: errorCode }, timestamp)
  ]);
}

async function releaseRejectedSubmission(env, job, attemptId, errorCode, now) {
  const timestamp = now.toISOString();
  await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='FAILED_FINAL',
      last_error_code=?2,last_error_stage='SUBMIT',last_error_detail='',updated_at=?3
      WHERE job_id=?1`).bind(job.job_id, errorCode, timestamp),
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_attempts SET status='REJECTED',
      error_code=?2,updated_at=?3 WHERE attempt_id=?1`).bind(attemptId, errorCode, timestamp),
    env.PRODUCT_DB.prepare(`UPDATE runway_cost_reservations SET status='RELEASED',updated_at=?2
      WHERE attempt_id=?1 AND status='RESERVED'`).bind(attemptId, timestamp),
    auditStatement(env, 'SUBMISSION_REJECTED', job.job_id, { attempt_id: attemptId, error_code: errorCode }, timestamp)
  ]);
}

async function submitApprovedJob(env, job, policy, provider, now, fetchImpl) {
  let calculatedCredits = 0;
  try {
    if (job.recipe !== 'product_ugc' || job.recipe_version !== '2026-06' || job.ratio !== '720:1280') {
      throw new Error('RUNWAY_RECIPE_NOT_APPROVED');
    }
    calculatedCredits = calculateProductUgcCredits(integer(job.duration_seconds), job.ratio);
  } catch (error) {
    const errorCode = clean(error?.message || error, 100);
    await env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='FAILED_FINAL',
      last_error_code=?2,last_error_stage='VALIDATE',last_error_detail='',updated_at=?3
      WHERE job_id=?1 AND status='APPROVED'`).bind(job.job_id, errorCode, now.toISOString()).run();
    return { action: 'rejected', job_id: job.job_id, error: errorCode };
  }
  if (calculatedCredits !== integer(job.expected_credits)) {
    await env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='FAILED_FINAL',
      last_error_code='RUNWAY_COST_MISMATCH',last_error_stage='VALIDATE',last_error_detail='',updated_at=?2
      WHERE job_id=?1 AND status='APPROVED'`).bind(job.job_id, now.toISOString()).run();
    return { action: 'rejected', job_id: job.job_id, error: 'RUNWAY_COST_MISMATCH' };
  }
  const local = await reservationTotals(env, utcMonth(now));
  const decision = budgetDecision(policy, provider, local, integer(job.expected_credits), env);
  if (!decision.ok) {
    await env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='BUDGET_BLOCKED',
      last_error_code=?2,last_error_stage='BUDGET',last_error_detail='',updated_at=?3
      WHERE job_id=?1 AND status='APPROVED'`).bind(job.job_id, decision.code, now.toISOString()).run();
    return { action: 'blocked', job_id: job.job_id, error: decision.code };
  }
  const reserved = await reserveJob(env, job, now);
  if (!reserved) return { action: 'claim_lost', job_id: job.job_id };
  const timestamp = now.toISOString();
  await env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='SUBMITTING',updated_at=?2
    WHERE job_id=?1 AND status='BUDGET_RESERVED'`).bind(job.job_id, timestamp).run();
  try {
    const task = await createRunwayProductUgc(env, {
      characterImage: { uri: safeHoshiluUrl(job.character_image_url, '/social/runway/') },
      productImage: { uri: safeHoshiluUrl(job.product_image_url, '/social/runway/') },
      version: job.recipe_version,
      ratio: job.ratio,
      duration: integer(job.duration_seconds),
      audio: integer(job.audio) === 1,
      productInfo: clean(job.product_info, 2500),
      // 成人であることは全ジョブ共通の安全弁として付加する。具体的な年齢・
      // 雰囲気は2ペルソナ運用(2026-08-19: v2=22歳想定の若者向け/v1=30〜50代向け)
      // に伴い、各ジョブのuser_concept側で指定する。
      userConcept: `${clean(job.user_concept, 3400)} The performer is an adult woman.`.trim()
    }, fetchImpl);
    const taskId = clean(task?.id, 200);
    if (!taskId) throw new Error('RUNWAY_TASK_ID_MISSING');
    await env.PRODUCT_DB.batch([
      env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='PROCESSING',
        provider_task_id=?2,submitted_at=?3,updated_at=?3 WHERE job_id=?1 AND status='SUBMITTING'`)
        .bind(job.job_id, taskId, timestamp),
      env.PRODUCT_DB.prepare(`UPDATE runway_generation_attempts SET status='SUBMITTED',
        provider_task_id=?2,updated_at=?3 WHERE attempt_id=?1`).bind(reserved.attemptId, taskId, timestamp),
      env.PRODUCT_DB.prepare(`UPDATE runway_cost_reservations SET status='SUBMITTED',updated_at=?2
        WHERE attempt_id=?1 AND status='RESERVED'`).bind(reserved.attemptId, timestamp),
      auditStatement(env, 'TASK_CREATED', job.job_id, { attempt_id: reserved.attemptId, task_id: taskId }, timestamp)
    ]);
    return { action: 'submitted', job_id: job.job_id, task_id: taskId, expected_credits: integer(job.expected_credits) };
  } catch (error) {
    const errorCode = clean(error?.code || error?.message || 'RUNWAY_SUBMIT_FAILED', 100);
    // A 2xx response without a task ID is ambiguous: Runway may already have
    // accepted and charged the task. Hold the budget and never auto-repost it.
    const definitelyRejected = /_HTTP_(400|401|403|404|405)$/.test(errorCode);
    if (definitelyRejected) await releaseRejectedSubmission(env, job, reserved.attemptId, errorCode, now);
    else await markSubmissionUnknown(env, job, reserved.attemptId, errorCode, now);
    return { action: definitelyRejected ? 'rejected' : 'unknown', job_id: job.job_id, error: errorCode };
  }
}

function safeOutputUrl(value) {
  const url = new URL(safeHttpsUrl(value));
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')
    || /^127\./.test(hostname) || hostname === '0.0.0.0' || hostname === '::1') {
    throw new Error('RUNWAY_OUTPUT_URL_INVALID');
  }
  return url.toString();
}

async function persistOutput(env, job, task, now, fetchImpl) {
  const outputUrl = safeOutputUrl(task?.output?.[0]);
  const response = await fetchImpl(outputUrl, {
    headers: { accept: 'video/*,application/octet-stream' },
    redirect: 'error'
  });
  if (!response.ok || !response.body) throw new Error(`RUNWAY_OUTPUT_DOWNLOAD_${response.status || 'FAILED'}`);
  const maxBytes = Math.max(1, integer(env.RUNWAY_MAX_OUTPUT_BYTES, OUTPUT_LIMIT_DEFAULT));
  const announcedSize = integer(response.headers.get('content-length'), -1);
  if (announcedSize > maxBytes) throw new Error('RUNWAY_OUTPUT_TOO_LARGE');
  const contentType = clean(response.headers.get('content-type'), 100).toLowerCase();
  if (contentType && !contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
    throw new Error('RUNWAY_OUTPUT_TYPE_INVALID');
  }
  const storageKey = `runway/${job.job_id}/output.mp4`;
  const stored = await env.SOCIAL_MEDIA_BUCKET.put(storageKey, response.body, {
    httpMetadata: {
      contentType: contentType.startsWith('video/') ? contentType : 'video/mp4',
      cacheControl: 'public, max-age=3600, stale-while-revalidate=86400'
    },
    customMetadata: { jobId: job.job_id, providerTaskId: job.provider_task_id }
  });
  const storedSize = integer(stored?.size, announcedSize);
  if (storedSize > maxBytes) {
    await env.SOCIAL_MEDIA_BUCKET.delete(storageKey);
    throw new Error('RUNWAY_OUTPUT_TOO_LARGE');
  }
  const timestamp = now.toISOString();
  // Keep the extension in the URL: the existing Instagram publisher uses the
  // URL path to select the REELS container type. The route itself remains
  // unavailable until the job passes QA and becomes APPROVED_FOR_POST.
  const mediaUrl = `https://hoshilu.app/api/social/media/runway/${encodeURIComponent(job.job_id)}.mp4`;
  await env.PRODUCT_DB.batch([
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='GENERATED_REVIEW_REQUIRED',
      storage_key=?2,storage_etag=?3,storage_size_bytes=?4,storage_content_type=?5,
      qa_status='PENDING',generated_at=?6,updated_at=?6,last_error_code='',last_error_stage='',last_error_detail=''
      WHERE job_id=?1 AND status='PROCESSING'`).bind(
      job.job_id, storageKey, clean(stored?.httpEtag || stored?.etag, 200), storedSize,
      contentType.startsWith('video/') ? contentType : 'video/mp4', timestamp
    ),
    env.PRODUCT_DB.prepare(`UPDATE runway_generation_attempts SET status='SUCCEEDED',updated_at=?2
      WHERE job_id=?1 AND provider_task_id=?3`).bind(job.job_id, timestamp, job.provider_task_id),
    env.PRODUCT_DB.prepare(`UPDATE runway_cost_reservations SET status='SETTLED',updated_at=?2
      WHERE job_id=?1 AND status IN ('RESERVED','SUBMITTED','UNKNOWN')`).bind(job.job_id, timestamp),
    env.PRODUCT_DB.prepare(`INSERT INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
       affiliate,created_at,updated_at)
      VALUES (?1,'INSTAGRAM','hoshilu-runway-video',?2,?3,?4,?5,?6,'REVIEW_REQUIRED',0,?7,?7)
      ON CONFLICT(post_id) DO UPDATE SET caption=excluded.caption,link=excluded.link,
        media_url=excluded.media_url,updated_at=excluded.updated_at
      WHERE social_post_queue.status='REVIEW_REQUIRED'`).bind(
      job.post_id, job.job_id, job.caption, job.link, mediaUrl,
      clean(job.scheduled_at, 40) || timestamp, timestamp
    ),
    auditStatement(env, 'OUTPUT_STORED', job.job_id, {
      storage_key: storageKey,
      size_bytes: storedSize,
      review_required: true
    }, timestamp)
  ]);
  return { action: 'generated_review_required', job_id: job.job_id, media_url: mediaUrl, size_bytes: storedSize };
}

async function pollProcessingJob(env, job, now, fetchImpl) {
  try {
    const task = await getRunwayTask(env, job.provider_task_id, fetchImpl);
    const status = clean(task?.status, 30).toUpperCase();
    if (status === 'SUCCEEDED') return await persistOutput(env, job, task, now, fetchImpl);
    if (['PENDING', 'RUNNING', 'THROTTLED'].includes(status)) {
      await env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET updated_at=?2,
        last_error_code='',last_error_stage='',last_error_detail='' WHERE job_id=?1 AND status='PROCESSING'`)
        .bind(job.job_id, now.toISOString()).run();
      return { action: 'polling', job_id: job.job_id, task_status: status };
    }
    const failureCode = clean(task?.failureCode || `RUNWAY_TASK_${status || 'INVALID'}`, 100);
    const charged = /^SAFETY\.INPUT\./.test(failureCode);
    const timestamp = now.toISOString();
    await env.PRODUCT_DB.batch([
      env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='FAILED_FINAL',
        last_error_code=?2,last_error_stage='TASK',last_error_detail=?3,updated_at=?4
        WHERE job_id=?1 AND status='PROCESSING'`).bind(
        job.job_id, failureCode, clean(task?.failure, 300), timestamp
      ),
      env.PRODUCT_DB.prepare(`UPDATE runway_generation_attempts SET status='FAILED',
        error_code=?2,updated_at=?3 WHERE job_id=?1 AND provider_task_id=?4`)
        .bind(job.job_id, failureCode, timestamp, job.provider_task_id),
      env.PRODUCT_DB.prepare(`UPDATE runway_cost_reservations SET status=?2,updated_at=?3
        WHERE job_id=?1 AND status IN ('RESERVED','SUBMITTED','UNKNOWN')`)
        .bind(job.job_id, charged ? 'SETTLED' : 'UNKNOWN', timestamp),
      auditStatement(env, 'TASK_FAILED', job.job_id, { failure_code: failureCode, charged_assumed: charged }, timestamp)
    ]);
    return { action: 'failed', job_id: job.job_id, error: failureCode };
  } catch (error) {
    const errorCode = clean(error?.code || error?.message || 'RUNWAY_TASK_POLL_FAILED', 100);
    await env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET last_error_code=?2,
      last_error_stage='POLL',last_error_detail='',updated_at=?3 WHERE job_id=?1 AND status='PROCESSING'`)
      .bind(job.job_id, errorCode, now.toISOString()).run();
    return { action: 'poll_error', job_id: job.job_id, error: errorCode };
  }
}

export async function runRunwayGenerationCycle(env, now = new Date(), fetchImpl = fetch) {
  const readiness = runwayGenerationReadiness(env);
  if (!readiness.ready) return { enabled: readiness.enabled, action: 'disabled', readiness };
  let policy;
  try {
    policy = await env.PRODUCT_DB.prepare(`SELECT * FROM runway_budget_policy WHERE policy_id=1`).first();
  } catch {
    return { enabled: true, action: 'schema_unavailable' };
  }
  if (!policy || !integer(policy.enabled) || integer(policy.kill_switch)) {
    return { enabled: true, action: 'policy_blocked', kill_switch: Boolean(integer(policy?.kill_switch)) };
  }
  let provider;
  try {
    provider = await syncProviderUsage(env, policy, now, fetchImpl);
  } catch (error) {
    return { enabled: true, action: 'usage_sync_failed', error: clean(error?.code || error?.message, 100) };
  }
  const active = await env.PRODUCT_DB.prepare(`SELECT * FROM runway_generation_jobs
    WHERE status='PROCESSING' AND provider_task_id<>'' ORDER BY submitted_at ASC LIMIT 1`).first();
  if (active) return { enabled: true, provider, result: await pollProcessingJob(env, active, now, fetchImpl) };
  const ambiguous = await env.PRODUCT_DB.prepare(`SELECT job_id FROM runway_generation_jobs
    WHERE status='AMBIGUOUS_SUBMISSION' LIMIT 1`).first();
  if (ambiguous) return { enabled: true, provider, result: { action: 'manual_reconciliation_required', job_id: ambiguous.job_id } };
  const pendingReview = await env.PRODUCT_DB.prepare(`SELECT job_id FROM runway_generation_jobs
    WHERE status='GENERATED_REVIEW_REQUIRED' LIMIT 1`).first();
  if (pendingReview) {
    return { enabled: true, provider, result: { action: 'review_required', job_id: pendingReview.job_id } };
  }
  const job = await env.PRODUCT_DB.prepare(`SELECT * FROM runway_generation_jobs
    WHERE status='APPROVED' AND rights_confirmed=1 AND ai_disclosure_confirmed=1
    AND scheduled_at<=?1 ORDER BY scheduled_at ASC LIMIT 1`).bind(now.toISOString()).first();
  if (!job) return { enabled: true, provider, result: { action: 'idle' } };
  return { enabled: true, provider, result: await submitApprovedJob(env, job, policy, provider, now, fetchImpl) };
}

function constantTimeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function authorized(request, env) {
  const expected = String(env.SOCIAL_ADMIN_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length >= 32 && constantTimeEqual(received, expected)) return true;
  return Boolean(await authorizeAdminRequest(request, env));
}

export async function handleRunwayGenerationRoutes(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/runway/')) return null;
  if (!await authorized(request, env)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  if (!env.PRODUCT_DB) return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  if (request.method === 'GET' && url.pathname === '/api/internal/runway/status') {
    const policy = await env.PRODUCT_DB.prepare(`SELECT enabled,kill_switch,initial_cap_credits,
      monthly_cap_credits,initial_test_completed,updated_at FROM runway_budget_policy WHERE policy_id=1`).first();
    const jobs = await env.PRODUCT_DB.prepare(`SELECT job_id,post_id,status,recipe,duration_seconds,
      expected_credits,provider_task_id,storage_size_bytes,qa_status,last_error_code,last_error_stage,
      scheduled_at,submitted_at,generated_at,updated_at FROM runway_generation_jobs
      ORDER BY created_at DESC LIMIT 50`).all();
    return Response.json({ ok: true, readiness: runwayGenerationReadiness(env), policy, jobs: jobs.results || [] }, {
      headers: { 'cache-control': 'no-store' }
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/runway/run') {
    return Response.json({ ok: true, cycle: await runRunwayGenerationCycle(env, new Date()) }, {
      headers: { 'cache-control': 'no-store' }
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/runway/approve') {
    const input = await request.json();
    const jobId = clean(input?.job_id, 120);
    const scheduledAt = clean(input?.scheduled_at, 40);
    const checks = input?.checks && typeof input.checks === 'object' ? input.checks : {};
    const requiredChecks = [
      'identity_consistent', 'face_hands_ok', 'hoshilu_visible', 'japanese_subtitles',
      'url_visible', 'audio_present', 'no_unrelated_brand', 'factual', 'ai_disclosure',
      'rights_confirmed', 'duplicate_checked', 'postprocessed'
    ];
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(jobId)
      || !Number.isFinite(Date.parse(scheduledAt))) {
      return Response.json({ ok: false, error: 'RUNWAY_APPROVAL_INVALID' }, { status: 400 });
    }
    const failedChecks = requiredChecks.filter((name) => checks[name] !== true);
    if (failedChecks.length) {
      return Response.json({ ok: false, error: 'RUNWAY_QA_INCOMPLETE', failed_checks: failedChecks }, { status: 409 });
    }
    let job = await env.PRODUCT_DB.prepare(`SELECT job_id,post_id,status,storage_key,storage_etag,
      storage_size_bytes,storage_content_type,rights_confirmed,ai_disclosure_confirmed
      FROM runway_generation_jobs WHERE job_id=?1`)
      .bind(jobId).first();
    if (!job || job.status !== 'GENERATED_REVIEW_REQUIRED' || !job.storage_key
      || integer(job.rights_confirmed) !== 1 || integer(job.ai_disclosure_confirmed) !== 1) {
      return Response.json({ ok: false, error: 'RUNWAY_JOB_NOT_REVIEWABLE' }, { status: 409 });
    }
    try {
      job = await promoteReviewedMedia(env, job);
    } catch (error) {
      return Response.json({ ok: false, error: clean(error?.message || error, 100) }, { status: 409 });
    }
    const mediaVerification = await verifyPostprocessedMedia(env, job);
    if (!mediaVerification.ok) {
      return Response.json({
        ok: false,
        error: mediaVerification.unavailable
          ? 'RUNWAY_MEDIA_STORAGE_UNAVAILABLE'
          : 'RUNWAY_POSTPROCESSED_MEDIA_INVALID',
        reason: mediaVerification.reason
      }, { status: mediaVerification.unavailable ? 503 : 409 });
    }
    const timestamp = new Date().toISOString();
    const results = await env.PRODUCT_DB.batch([
      env.PRODUCT_DB.prepare(`UPDATE runway_generation_jobs SET status='APPROVED_FOR_POST',
        qa_status='PASSED',updated_at=?2 WHERE job_id=?1 AND status='GENERATED_REVIEW_REQUIRED'
        AND storage_key=?4 AND storage_size_bytes=?5 AND storage_content_type=?6
        AND ((?7=1 AND storage_etag IS NULL) OR (?7=0 AND storage_etag=?8))
        AND EXISTS (SELECT 1 FROM social_post_queue WHERE post_id=?3 AND status='REVIEW_REQUIRED')`)
        .bind(
          jobId, timestamp, job.post_id, mediaVerification.storage_key,
          mediaVerification.storage_size_bytes, mediaVerification.storage_content_type,
          mediaVerification.storage_etag_is_null, mediaVerification.storage_etag
        ),
      // Completing the explicitly bounded first test hands subsequent jobs to
      // the monthly 3,000-credit cap. This transition is possible only after
      // every required QA check above passed.
      env.PRODUCT_DB.prepare(`UPDATE runway_budget_policy SET initial_test_completed=1,updated_at=?1
        WHERE policy_id=1 AND initial_test_completed=0
        AND EXISTS (SELECT 1 FROM runway_generation_jobs WHERE job_id=?2 AND post_id=?3
          AND status='APPROVED_FOR_POST' AND qa_status='PASSED')`)
        .bind(timestamp, jobId, job.post_id),
      env.PRODUCT_DB.prepare(`UPDATE social_post_queue SET status='APPROVED',scheduled_at=?2,
        approved_at=?3,updated_at=?3 WHERE post_id=?1 AND status='REVIEW_REQUIRED'
        AND EXISTS (SELECT 1 FROM runway_generation_jobs WHERE job_id=?4 AND post_id=?1
          AND status='APPROVED_FOR_POST' AND qa_status='PASSED')`)
        .bind(job.post_id, new Date(scheduledAt).toISOString(), timestamp, jobId),
      env.PRODUCT_DB.prepare(`INSERT INTO social_post_queue
        (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
         affiliate,created_at,updated_at,approved_at)
        SELECT ?2,'X',campaign_id,content_id,caption,link,media_url,?3,'APPROVED',affiliate,?4,?4,?4
        FROM social_post_queue WHERE post_id=?1
        AND NOT EXISTS (SELECT 1 FROM social_post_queue x WHERE x.platform='X'
          AND x.content_id=?5 AND (x.status IN ('APPROVED','PUBLISHING','PUBLISHED') OR x.external_post_id<>''))`)
        .bind(job.post_id, `${job.post_id}-x`, new Date(scheduledAt).toISOString(), timestamp, jobId),
      auditStatement(env, 'QA_APPROVED_FOR_POST', jobId, {
        checks: requiredChecks,
        scheduled_at: new Date(scheduledAt).toISOString()
      }, timestamp)
    ]);
    if (changes(results?.[0]) !== 1 || changes(results?.[2]) !== 1) {
      return Response.json({ ok: false, error: 'RUNWAY_APPROVAL_CONFLICT' }, { status: 409 });
    }
    return Response.json({
      ok: true,
      job_id: jobId,
      post_id: job.post_id,
      status: 'APPROVED_FOR_POST',
      scheduled_at: new Date(scheduledAt).toISOString()
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/runway/crosspost-x') {
    const input = await request.json();
    const jobId = clean(input?.job_id, 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(jobId)) {
      return Response.json({ ok: false, error: 'RUNWAY_CROSSPOST_INVALID' }, { status: 400 });
    }
    const timestamp = new Date().toISOString();
    const result = await env.PRODUCT_DB.prepare(`INSERT INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,status,
       affiliate,created_at,updated_at,approved_at)
      SELECT q.post_id||'-x','X',q.campaign_id,q.content_id,q.caption,q.link,q.media_url,?2,
       'APPROVED',q.affiliate,?2,?2,?2 FROM social_post_queue q
      JOIN runway_generation_jobs j ON j.post_id=q.post_id
      WHERE j.job_id=?1 AND j.status IN ('APPROVED_FOR_POST','PUBLISHED')
      AND NOT EXISTS (SELECT 1 FROM social_post_queue x WHERE x.platform='X'
        AND x.content_id=?1 AND (x.status IN ('APPROVED','PUBLISHING','PUBLISHED') OR x.external_post_id<>''))
      ON CONFLICT(post_id) DO UPDATE SET status='APPROVED',scheduled_at=excluded.scheduled_at,
        approved_at=excluded.approved_at,updated_at=excluded.updated_at,last_error=''
      WHERE social_post_queue.status='FAILED' AND social_post_queue.external_post_id=''`)
      .bind(jobId, timestamp).run();
    return Response.json({ ok: true, job_id: jobId, queued: changes(result) });
  }
  return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
