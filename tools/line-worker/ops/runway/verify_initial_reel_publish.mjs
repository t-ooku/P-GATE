import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const INITIAL_REEL = Object.freeze({
  jobId: 'runway-hoshilu-model-ugc-test-20260813-v1',
  postId: 'hoshilu-runway-model-ugc-20260813-v1',
  providerTaskId: 'b345b9a1-31bc-4421-a7ec-a57b4d9e30be',
  rawStorageKey: 'runway/runway-hoshilu-model-ugc-test-20260813-v1/output.mp4',
  rawSha256: '6caeb845203e7d1d6453c31fd7c44e6157befffd8e5699fb749f42c4e1d31ef7',
  rawSize: 3464151,
  candidateSha256: '88e65826b923bbf11cfcf99228367a629c76a2eddc51ab661a58be36395b71b9',
  candidateSize: 1565856,
  candidateStorageKey: 'runway/runway-hoshilu-model-ugc-test-20260813-v1/postprocessed-88e65826b923bbf11cfcf99228367a629c76a2eddc51ab661a58be36395b71b9.mp4',
  approvedVisualSourceSha256: '9e2a3a8079e925c3359bce243ef8b3f363ff204cdac0974c771d38f38d6612ad',
  audioSha256: '2bb301fc39c09189059571e827589f92ad349dc337c69eec98d7204fc9888385',
  mediaUrl: 'https://hoshilu.app/api/social/media/runway/runway-hoshilu-model-ugc-test-20260813-v1.mp4',
  link: 'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social&utm_campaign=hoshilu_runway_test&utm_content=runway_product_ugc_test_20260813_v1',
  caption: '商品名が分からなくても、覚えている見た目や使い方から探せる言葉へ。AIは理解、HOSHILUは探す。続きは @hoshilu.app のプロフィールから。気になった商品をコメントで教えてね。 #HOSHILU #ホシル #あいまい検索 #商品検索 #13モール横断 #ほしっとく'
});

function fail(code, detail = '') {
  throw new Error(detail ? `${code}: ${detail}` : code);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function d1Rows(payload) {
  return (Array.isArray(payload) ? payload : [payload])
    .flatMap((entry) => entry?.results || entry?.result?.results || []);
}

export function verifyMutationChanges(payload, expected) {
  const entries = Array.isArray(payload) ? payload : [payload];
  const actual = entries.map((entry) => Number(entry?.meta?.changes ?? entry?.result?.meta?.changes));
  if (entries.length === 1 && expected.length > 1) {
    const rowsWritten = Number(entries[0]?.meta?.rows_written ?? entries[0]?.result?.meta?.rows_written);
    const expectedWrites = expected.reduce((sum, value) => sum + value, 0);
    if (rowsWritten === expectedWrites && actual[0] >= expectedWrites) return true;
    fail('D1_MUTATION_CHANGE_COUNT_INVALID', JSON.stringify({ actual, rows_written: rowsWritten, expected }));
  }
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail('D1_MUTATION_CHANGE_COUNT_INVALID', JSON.stringify({ actual, expected }));
  }
  return true;
}

function exactlyOne(payload, code) {
  const rows = d1Rows(payload);
  if (rows.length !== 1) fail(code, `rows=${rows.length}`);
  return rows[0];
}

function string(value) {
  return String(value ?? '');
}

function number(value) {
  return Number(value);
}

function assertEqual(actual, expected, code) {
  if (actual !== expected) fail(code, JSON.stringify({ actual, expected }));
}

function validateCommonJob(job) {
  assertEqual(job.job_id, INITIAL_REEL.jobId, 'JOB_ID_MISMATCH');
  assertEqual(job.post_id, INITIAL_REEL.postId, 'POST_ID_MISMATCH');
  assertEqual(job.provider_task_id, INITIAL_REEL.providerTaskId, 'PROVIDER_TASK_MISMATCH');
  assertEqual(number(job.expected_credits), 336, 'EXPECTED_CREDITS_MISMATCH');
  assertEqual(number(job.rights_confirmed), 1, 'RIGHTS_NOT_CONFIRMED');
  assertEqual(number(job.ai_disclosure_confirmed), 1, 'AI_DISCLOSURE_NOT_CONFIRMED');
  assertEqual(number(job.attempt_count), 1, 'ATTEMPT_COUNT_MISMATCH');
  assertEqual(number(job.max_attempts), 1, 'MAX_ATTEMPTS_MISMATCH');
}

function validateCommonQueue(queue) {
  assertEqual(queue.post_id, INITIAL_REEL.postId, 'QUEUE_POST_ID_MISMATCH');
  assertEqual(queue.platform, 'INSTAGRAM', 'QUEUE_PLATFORM_MISMATCH');
  assertEqual(queue.campaign_id, 'hoshilu-runway-video', 'QUEUE_CAMPAIGN_MISMATCH');
  assertEqual(queue.content_id, INITIAL_REEL.jobId, 'QUEUE_CONTENT_MISMATCH');
  assertEqual(queue.link, INITIAL_REEL.link, 'QUEUE_LINK_MISMATCH');
  assertEqual(queue.media_url, INITIAL_REEL.mediaUrl, 'QUEUE_MEDIA_URL_MISMATCH');
  assertEqual(number(queue.affiliate), 0, 'QUEUE_AFFILIATE_MISMATCH');
}

export function verifyHealth(health) {
  if (health?.ok !== true) fail('HEALTH_NOT_OK');
  if (health?.checks?.social_publishers?.INSTAGRAM !== true) fail('INSTAGRAM_PUBLISHER_NOT_READY');
  if (health?.checks?.instagram_oauth?.configured !== true
    || health?.checks?.instagram_oauth?.connected !== true) fail('INSTAGRAM_OAUTH_NOT_CONNECTED');
  const runway = health?.checks?.runway_video_generation;
  if (runway?.database_configured !== true || runway?.media_storage_configured !== true
    || runway?.enabled !== true || runway?.ready !== true) fail('RUNWAY_STORAGE_NOT_READY');
  for (const table of [
    'instagram_oauth_credentials', 'runway_budget_policy', 'runway_generation_jobs',
    'runway_generation_attempts', 'runway_cost_reservations', 'runway_audit_log'
  ]) {
    if (health?.checks?.database_features?.[table] !== true) fail('DATABASE_FEATURE_MISSING', table);
  }
  return true;
}

export function verifyPreflight({ health, jobs, queue, duplicates, credential, policy }, now = new Date()) {
  verifyHealth(health);
  const job = exactlyOne(jobs, 'JOB_NOT_UNIQUE');
  const post = exactlyOne(queue, 'QUEUE_POST_NOT_UNIQUE');
  const duplicate = exactlyOne(duplicates, 'DUPLICATE_QUERY_INVALID');
  const oauth = exactlyOne(credential, 'INSTAGRAM_CREDENTIAL_NOT_UNIQUE');
  const budget = exactlyOne(policy, 'RUNWAY_POLICY_NOT_UNIQUE');
  validateCommonJob(job);
  validateCommonQueue(post);

  assertEqual(number(duplicate.duplicate_count), 0, 'DUPLICATE_PUBLICATION_FOUND');
  assertEqual(number(duplicate.competing_due_count), 0, 'COMPETING_INSTAGRAM_POST_DUE');
  assertEqual(oauth.status, 'ACTIVE', 'INSTAGRAM_CREDENTIAL_INACTIVE');
  assertEqual(string(oauth.account_id), '17841441143206766', 'INSTAGRAM_ACCOUNT_ID_MISMATCH');
  if (!string(oauth.scopes).split(',').map((scope) => scope.trim())
    .includes('instagram_business_content_publish')) fail('INSTAGRAM_PUBLISH_SCOPE_MISSING');
  if (!Number.isFinite(Date.parse(oauth.expires_at))
    || Date.parse(oauth.expires_at) <= now.getTime() + 5 * 60 * 1000) {
    fail('INSTAGRAM_CREDENTIAL_EXPIRING');
  }
  assertEqual(number(budget.initial_cap_credits), 1000, 'INITIAL_CAP_MISMATCH');
  assertEqual(number(budget.monthly_cap_credits), 3000, 'MONTHLY_CAP_MISMATCH');
  assertEqual(number(budget.enabled), 1, 'RUNWAY_POLICY_DISABLED');
  assertEqual(number(budget.kill_switch), 0, 'RUNWAY_KILL_SWITCH_ACTIVE');

  if (post.status === 'PUBLISHED') {
    if (!string(post.external_post_id) || !Number.isFinite(Date.parse(post.published_at))) {
      fail('PUBLISHED_RESULT_INCOMPLETE');
    }
    if (job.status === 'PUBLISHED') {
      assertEqual(number(budget.initial_test_completed), 1, 'PUBLISHED_INITIAL_TEST_STATE_INVALID');
      return 'published';
    }
    assertEqual(job.status, 'APPROVED_FOR_POST', 'PUBLISHED_JOB_STATE_INVALID');
    assertEqual(number(budget.initial_test_completed), 0, 'UNRECONCILED_INITIAL_TEST_STATE_INVALID');
    return 'published_unreconciled';
  }
  if (['APPROVED', 'PUBLISHING'].includes(post.status)) {
    assertEqual(job.status, 'APPROVED_FOR_POST', 'IN_FLIGHT_JOB_STATE_INVALID');
    assertEqual(job.qa_status, 'PASSED', 'IN_FLIGHT_QA_STATE_INVALID');
    assertEqual(job.storage_key, INITIAL_REEL.candidateStorageKey, 'IN_FLIGHT_STORAGE_KEY_INVALID');
    if (![0, 1].includes(number(budget.initial_test_completed))) fail('IN_FLIGHT_INITIAL_TEST_STATE_INVALID');
    return 'in_flight';
  }
  if (post.status !== 'REVIEW_REQUIRED') fail('QUEUE_STATE_NOT_REVIEWABLE', post.status);
  if (string(post.external_post_id) || string(post.platform_job_id) || string(post.published_at)) {
    fail('QUEUE_HAS_EXTERNAL_PUBLICATION_STATE');
  }
  if (job.status === 'APPROVED_FOR_POST') {
    assertEqual(job.qa_status, 'PASSED', 'RESUMED_QA_STATE_INVALID');
    assertEqual(job.storage_key, INITIAL_REEL.candidateStorageKey, 'RESUMED_STORAGE_KEY_INVALID');
    assertEqual(number(job.storage_size_bytes), INITIAL_REEL.candidateSize, 'RESUMED_STORAGE_SIZE_INVALID');
    assertEqual(job.storage_content_type, 'video/mp4', 'RESUMED_CONTENT_TYPE_INVALID');
    if (job.storage_etag !== null) fail('RESUMED_ETAG_MUST_BE_SQL_NULL');
    assertEqual(job.caption, INITIAL_REEL.caption, 'RESUMED_JOB_CAPTION_INVALID');
    assertEqual(post.caption, INITIAL_REEL.caption, 'RESUMED_QUEUE_CAPTION_INVALID');
    assertEqual(number(budget.initial_test_completed), 0, 'RESUMED_INITIAL_TEST_STATE_INVALID');
    return 'qa_approved';
  }
  assertEqual(job.status, 'GENERATED_REVIEW_REQUIRED', 'JOB_STATE_NOT_REVIEWABLE');
  assertEqual(job.qa_status, 'PENDING', 'JOB_QA_NOT_PENDING');
  const raw = job.storage_key === INITIAL_REEL.rawStorageKey
    && number(job.storage_size_bytes) === INITIAL_REEL.rawSize;
  const staged = job.storage_key === INITIAL_REEL.candidateStorageKey
    && number(job.storage_size_bytes) === INITIAL_REEL.candidateSize
    && job.storage_content_type === 'video/mp4' && job.storage_etag == null;
  if (!raw && !staged) fail('REVIEW_STORAGE_IDENTITY_INVALID');
  assertEqual(number(budget.initial_test_completed), 0, 'REVIEW_INITIAL_TEST_STATE_INVALID');
  return 'review';
}

export function verifyCandidate(path, probe, audioSha256) {
  const bytes = readFileSync(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assertEqual(digest, INITIAL_REEL.candidateSha256, 'CANDIDATE_SHA256_MISMATCH');
  assertEqual(statSync(path).size, INITIAL_REEL.candidateSize, 'CANDIDATE_SIZE_MISMATCH');
  assertEqual(audioSha256, INITIAL_REEL.audioSha256, 'CANDIDATE_AUDIO_MISMATCH');
  const video = (probe?.streams || []).find((stream) => stream.codec_type === 'video');
  const audio = (probe?.streams || []).find((stream) => stream.codec_type === 'audio');
  if (!video || !audio || (probe?.streams || []).length !== 2) fail('CANDIDATE_STREAMS_INVALID');
  assertEqual(video.codec_name, 'h264', 'CANDIDATE_VIDEO_CODEC_INVALID');
  assertEqual(video.profile, 'High', 'CANDIDATE_VIDEO_PROFILE_INVALID');
  assertEqual(number(video.width), 720, 'CANDIDATE_WIDTH_INVALID');
  assertEqual(number(video.height), 1280, 'CANDIDATE_HEIGHT_INVALID');
  assertEqual(video.pix_fmt, 'yuv420p', 'CANDIDATE_PIXEL_FORMAT_INVALID');
  assertEqual(video.r_frame_rate, '24/1', 'CANDIDATE_FRAME_RATE_INVALID');
  assertEqual(audio.codec_name, 'aac', 'CANDIDATE_AUDIO_CODEC_INVALID');
  assertEqual(number(audio.sample_rate), 44100, 'CANDIDATE_AUDIO_RATE_INVALID');
  assertEqual(number(audio.channels), 2, 'CANDIDATE_AUDIO_CHANNELS_INVALID');
  if (Math.abs(number(probe?.format?.duration) - 8.057007) > 0.000001) {
    fail('CANDIDATE_DURATION_INVALID', string(probe?.format?.duration));
  }
  return {
    sha256: digest,
    size_bytes: INITIAL_REEL.candidateSize,
    audio_sha256: audioSha256,
    duration_seconds: number(probe.format.duration),
    video: 'h264 High 720x1280 yuv420p 24fps',
    audio: 'aac 44100Hz stereo'
  };
}

export function verifyStaged({ jobs, queue, duplicates }) {
  const job = exactlyOne(jobs, 'STAGED_JOB_NOT_UNIQUE');
  const post = exactlyOne(queue, 'STAGED_QUEUE_NOT_UNIQUE');
  const duplicate = exactlyOne(duplicates, 'STAGED_DUPLICATE_QUERY_INVALID');
  validateCommonJob(job);
  validateCommonQueue(post);
  assertEqual(number(duplicate.duplicate_count), 0, 'STAGED_DUPLICATE_FOUND');
  assertEqual(number(duplicate.competing_due_count), 0, 'STAGED_COMPETING_INSTAGRAM_POST_DUE');
  assertEqual(job.status, 'GENERATED_REVIEW_REQUIRED', 'STAGED_JOB_STATE_INVALID');
  assertEqual(job.qa_status, 'PENDING', 'STAGED_QA_STATE_INVALID');
  assertEqual(job.storage_key, INITIAL_REEL.candidateStorageKey, 'STAGED_STORAGE_KEY_INVALID');
  assertEqual(number(job.storage_size_bytes), INITIAL_REEL.candidateSize, 'STAGED_STORAGE_SIZE_INVALID');
  assertEqual(job.storage_content_type, 'video/mp4', 'STAGED_CONTENT_TYPE_INVALID');
  if (job.storage_etag !== null) fail('STAGED_ETAG_MUST_BE_SQL_NULL');
  assertEqual(job.caption, INITIAL_REEL.caption, 'STAGED_JOB_CAPTION_INVALID');
  assertEqual(post.status, 'REVIEW_REQUIRED', 'STAGED_QUEUE_STATE_INVALID');
  assertEqual(post.caption, INITIAL_REEL.caption, 'STAGED_QUEUE_CAPTION_INVALID');
  if (string(post.external_post_id) || string(post.platform_job_id)) fail('STAGED_EXTERNAL_STATE_FOUND');
  return true;
}

export function verifyApproved({ jobs, queue, audit }) {
  const job = exactlyOne(jobs, 'APPROVED_JOB_NOT_UNIQUE');
  const post = exactlyOne(queue, 'APPROVED_QUEUE_NOT_UNIQUE');
  const auditRow = exactlyOne(audit, 'APPROVAL_AUDIT_NOT_UNIQUE');
  validateCommonJob(job);
  validateCommonQueue(post);
  assertEqual(job.status, 'APPROVED_FOR_POST', 'APPROVED_JOB_STATE_INVALID');
  assertEqual(job.qa_status, 'PASSED', 'APPROVED_QA_STATE_INVALID');
  assertEqual(job.storage_key, INITIAL_REEL.candidateStorageKey, 'APPROVED_STORAGE_KEY_INVALID');
  if (!['APPROVED', 'PUBLISHING', 'PUBLISHED'].includes(post.status)) {
    fail('APPROVED_QUEUE_STATE_INVALID', post.status);
  }
  assertEqual(post.caption, INITIAL_REEL.caption, 'APPROVED_QUEUE_CAPTION_INVALID');
  if (!Number.isFinite(Date.parse(post.scheduled_at)) || !Number.isFinite(Date.parse(post.approved_at))) {
    fail('APPROVED_TIMESTAMPS_INVALID');
  }
  if (string(post.last_error)) fail('APPROVED_QUEUE_ERROR_STATE');
  if (post.status === 'PUBLISHED') {
    if (!string(post.external_post_id) || !Number.isFinite(Date.parse(post.published_at))) {
      fail('APPROVED_FORWARD_PUBLISHED_RESULT_INCOMPLETE');
    }
    if (string(post.platform_job_id)) fail('APPROVED_FORWARD_PUBLISHED_JOB_ID_FOUND');
  } else {
    if (string(post.external_post_id) || string(post.published_at)) {
      fail('APPROVED_FORWARD_EXTERNAL_STATE_FOUND');
    }
    if (post.status === 'APPROVED' && string(post.platform_job_id)) {
      fail('APPROVED_FORWARD_JOB_ID_BEFORE_CLAIM');
    }
  }
  assertEqual(auditRow.audit_id, 'runway-initial-reel-v4-qa-approved-20260813', 'APPROVAL_AUDIT_ID_INVALID');
  assertEqual(auditRow.event, 'QA_APPROVED_FOR_POST', 'APPROVAL_AUDIT_EVENT_INVALID');
  const detail = JSON.parse(string(auditRow.detail));
  assertEqual(detail.candidate_sha256, INITIAL_REEL.candidateSha256, 'APPROVAL_AUDIT_SHA_INVALID');
  assertEqual(detail.approved_visual_source_sha256, INITIAL_REEL.approvedVisualSourceSha256, 'APPROVAL_AUDIT_VISUAL_SOURCE_INVALID');
  assertEqual(detail.technical_reencode, true, 'APPROVAL_AUDIT_REENCODE_INVALID');
  assertEqual(number(detail.ssim_all), 0.997868, 'APPROVAL_AUDIT_SSIM_INVALID');
  assertEqual(number(detail.psnr_average_db), 50.505671, 'APPROVAL_AUDIT_PSNR_INVALID');
  assertEqual(detail.platform_ai_label, true, 'APPROVAL_AUDIT_AI_LABEL_INVALID');
  const requiredChecks = [
    'identity_consistent', 'face_hands_ok', 'hoshilu_visible', 'japanese_subtitles',
    'url_visible', 'audio_present', 'no_unrelated_brand', 'factual', 'ai_disclosure',
    'rights_confirmed', 'duplicate_checked', 'postprocessed'
  ];
  if (JSON.stringify(detail.checks) !== JSON.stringify(requiredChecks)) fail('APPROVAL_AUDIT_CHECKS_INVALID');
  return true;
}

export function verifyQaApproved({ jobs, queue, audit }) {
  const job = exactlyOne(jobs, 'QA_APPROVED_JOB_NOT_UNIQUE');
  const post = exactlyOne(queue, 'QA_APPROVED_QUEUE_NOT_UNIQUE');
  const auditRow = exactlyOne(audit, 'APPROVAL_AUDIT_NOT_UNIQUE');
  validateCommonJob(job);
  validateCommonQueue(post);
  assertEqual(job.status, 'APPROVED_FOR_POST', 'QA_APPROVED_JOB_STATE_INVALID');
  assertEqual(job.qa_status, 'PASSED', 'QA_APPROVED_QA_STATE_INVALID');
  assertEqual(job.storage_key, INITIAL_REEL.candidateStorageKey, 'QA_APPROVED_STORAGE_KEY_INVALID');
  assertEqual(post.status, 'REVIEW_REQUIRED', 'QA_APPROVED_QUEUE_STATE_INVALID');
  assertEqual(post.caption, INITIAL_REEL.caption, 'QA_APPROVED_QUEUE_CAPTION_INVALID');
  if (string(post.external_post_id) || string(post.platform_job_id)) fail('QA_APPROVED_EXTERNAL_STATE_FOUND');
  assertEqual(auditRow.audit_id, 'runway-initial-reel-v4-qa-approved-20260813', 'APPROVAL_AUDIT_ID_INVALID');
  assertEqual(auditRow.event, 'QA_APPROVED_FOR_POST', 'APPROVAL_AUDIT_EVENT_INVALID');
  const detail = JSON.parse(string(auditRow.detail));
  assertEqual(detail.candidate_sha256, INITIAL_REEL.candidateSha256, 'APPROVAL_AUDIT_SHA_INVALID');
  assertEqual(detail.approved_visual_source_sha256, INITIAL_REEL.approvedVisualSourceSha256, 'APPROVAL_AUDIT_VISUAL_SOURCE_INVALID');
  assertEqual(detail.technical_reencode, true, 'APPROVAL_AUDIT_REENCODE_INVALID');
  assertEqual(number(detail.ssim_all), 0.997868, 'APPROVAL_AUDIT_SSIM_INVALID');
  assertEqual(number(detail.psnr_average_db), 50.505671, 'APPROVAL_AUDIT_PSNR_INVALID');
  assertEqual(detail.platform_ai_label, true, 'APPROVAL_AUDIT_AI_LABEL_INVALID');
  return true;
}

export function verifyPublished({ queue, performance, publicResult }) {
  const post = exactlyOne(queue, 'PUBLISHED_QUEUE_NOT_UNIQUE');
  const snapshot = exactlyOne(performance, 'PUBLISHED_PERFORMANCE_NOT_UNIQUE');
  validateCommonQueue(post);
  assertEqual(post.status, 'PUBLISHED', 'PUBLISHED_QUEUE_STATE_INVALID');
  if (!string(post.external_post_id) || !Number.isFinite(Date.parse(post.published_at))) {
    fail('PUBLISHED_QUEUE_RESULT_INCOMPLETE');
  }
  if (string(post.last_error) || string(post.platform_job_id)) fail('PUBLISHED_QUEUE_ERROR_STATE');
  assertEqual(snapshot.post_id, INITIAL_REEL.postId, 'PERFORMANCE_POST_ID_INVALID');
  assertEqual(snapshot.platform, 'INSTAGRAM', 'PERFORMANCE_PLATFORM_INVALID');
  assertEqual(snapshot.public_url, publicResult?.public_url, 'PERFORMANCE_PUBLIC_URL_MISMATCH');
  const url = new URL(string(snapshot.public_url));
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) {
    fail('PERFORMANCE_PUBLIC_URL_INVALID');
  }
  assertEqual(publicResult?.ok, true, 'PUBLIC_RESULT_NOT_OK');
  assertEqual(publicResult?.post_id, INITIAL_REEL.postId, 'PUBLIC_RESULT_POST_ID_INVALID');
  assertEqual(publicResult?.external_post_id, post.external_post_id, 'PUBLIC_RESULT_EXTERNAL_ID_MISMATCH');
  return true;
}

export function verifyReconciled({ jobs, policy, audit }) {
  const job = exactlyOne(jobs, 'RECONCILED_JOB_NOT_UNIQUE');
  const budget = exactlyOne(policy, 'RECONCILED_POLICY_NOT_UNIQUE');
  const auditRow = exactlyOne(audit, 'PUBLISHED_AUDIT_NOT_UNIQUE');
  validateCommonJob(job);
  assertEqual(job.status, 'PUBLISHED', 'RECONCILED_JOB_STATE_INVALID');
  assertEqual(job.qa_status, 'PASSED', 'RECONCILED_QA_STATE_INVALID');
  assertEqual(job.storage_key, INITIAL_REEL.candidateStorageKey, 'RECONCILED_STORAGE_KEY_INVALID');
  assertEqual(number(budget.initial_test_completed), 1, 'RECONCILED_INITIAL_TEST_STATE_INVALID');
  assertEqual(number(budget.initial_cap_credits), 1000, 'RECONCILED_INITIAL_CAP_INVALID');
  assertEqual(number(budget.monthly_cap_credits), 3000, 'RECONCILED_MONTHLY_CAP_INVALID');
  assertEqual(auditRow.audit_id, 'runway-initial-reel-v4-published-20260813', 'PUBLISHED_AUDIT_ID_INVALID');
  assertEqual(auditRow.event, 'PUBLISHED', 'PUBLISHED_AUDIT_EVENT_INVALID');
  const detail = JSON.parse(string(auditRow.detail));
  assertEqual(detail.post_id, INITIAL_REEL.postId, 'PUBLISHED_AUDIT_POST_ID_INVALID');
  if (!string(detail.external_post_id) || !string(detail.public_url)) fail('PUBLISHED_AUDIT_DETAIL_INCOMPLETE');
  return true;
}

function usage() {
  console.error('Usage: verify_initial_reel_publish.mjs <preflight|candidate|mutation|staged|qa-approved|approved|status|published|reconciled> ...');
  process.exit(64);
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === 'preflight' && args.length === 6) {
    const [health, jobs, queue, duplicates, credential, policy] = args.map(readJson);
    process.stdout.write(verifyPreflight({ health, jobs, queue, duplicates, credential, policy }));
    return;
  }
  if (command === 'candidate' && args.length === 3) {
    const [path, probePath, audioSha256] = args;
    process.stdout.write(`${JSON.stringify(verifyCandidate(path, readJson(probePath), audioSha256), null, 2)}\n`);
    return;
  }
  if (command === 'mutation' && args.length === 2) {
    verifyMutationChanges(readJson(args[0]), args[1].split(',').map(Number));
    return;
  }
  if (command === 'staged' && args.length === 3) {
    const [jobs, queue, duplicates] = args.map(readJson);
    verifyStaged({ jobs, queue, duplicates });
    return;
  }
  if (command === 'qa-approved' && args.length === 3) {
    const [jobs, queue, audit] = args.map(readJson);
    verifyQaApproved({ jobs, queue, audit });
    return;
  }
  if (command === 'approved' && args.length === 3) {
    const [jobs, queue, audit] = args.map(readJson);
    verifyApproved({ jobs, queue, audit });
    return;
  }
  if (command === 'status' && args.length === 1) {
    process.stdout.write(string(exactlyOne(readJson(args[0]), 'STATUS_QUEUE_NOT_UNIQUE').status));
    return;
  }
  if (command === 'published' && args.length === 3) {
    verifyPublished({ queue: readJson(args[0]), performance: readJson(args[1]), publicResult: readJson(args[2]) });
    return;
  }
  if (command === 'reconciled' && args.length === 3) {
    const [jobs, policy, audit] = args.map(readJson);
    verifyReconciled({ jobs, policy, audit });
    return;
  }
  usage();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
