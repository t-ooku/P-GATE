import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  INITIAL_REEL,
  parseJsonDocument,
  verifyApproved,
  verifyCandidate,
  verifyHealth,
  verifyMutationChanges,
  verifyPreflight,
  verifyPublished,
  verifyReconciled,
  verifyStaged
} from '../ops/runway/verify_initial_reel_publish.mjs';

const rowPayload = (row, changes = 0) => [{ results: [row], meta: { changes } }];
const health = {
  ok: true,
  checks: {
    social_publishers: { INSTAGRAM: true },
    instagram_oauth: { configured: true, connected: true },
    runway_video_generation: {
      database_configured: true, media_storage_configured: true, enabled: true, ready: true
    },
    database_features: Object.fromEntries([
      'instagram_oauth_credentials', 'runway_budget_policy', 'runway_generation_jobs',
      'runway_generation_attempts', 'runway_cost_reservations', 'runway_audit_log'
    ].map((name) => [name, true]))
  }
};
const job = {
  job_id: INITIAL_REEL.jobId,
  post_id: INITIAL_REEL.postId,
  provider_task_id: INITIAL_REEL.providerTaskId,
  status: 'GENERATED_REVIEW_REQUIRED',
  expected_credits: 336,
  rights_confirmed: 1,
  ai_disclosure_confirmed: 1,
  attempt_count: 1,
  max_attempts: 1,
  storage_key: INITIAL_REEL.rawStorageKey,
  storage_etag: 'raw-etag',
  storage_size_bytes: INITIAL_REEL.rawSize,
  storage_content_type: 'video/mp4',
  qa_status: 'PENDING',
  caption: 'old caption'
};
const queue = {
  post_id: INITIAL_REEL.postId,
  platform: 'INSTAGRAM',
  campaign_id: 'hoshilu-runway-video',
  content_id: INITIAL_REEL.jobId,
  caption: 'old caption',
  link: INITIAL_REEL.link,
  media_url: INITIAL_REEL.mediaUrl,
  scheduled_at: '2026-08-13T08:00:00.000Z',
  status: 'REVIEW_REQUIRED',
  affiliate: 0,
  platform_job_id: '',
  external_post_id: '',
  last_error: '',
  approved_at: '',
  published_at: ''
};
const collision = { duplicate_count: 0, competing_due_count: 0 };
const credential = {
  account_id: '17841441143206766',
  scopes: 'instagram_business_basic,instagram_business_content_publish',
  expires_at: '2026-10-01T00:00:00.000Z',
  status: 'ACTIVE'
};
const policy = {
  initial_cap_credits: 1000, monthly_cap_credits: 3000,
  enabled: 1, kill_switch: 0, initial_test_completed: 0
};

test('preflight accepts only the reviewable exact initial job', () => {
  assert.equal(verifyPreflight({
    health,
    jobs: rowPayload(job),
    queue: rowPayload(queue),
    duplicates: rowPayload(collision),
    credential: rowPayload(credential),
    policy: rowPayload(policy)
  }, new Date('2026-08-13T10:00:00.000Z')), 'review');
});

test('preflight blocks a duplicate, a competing due post and an expired token', () => {
  const base = {
    health, jobs: rowPayload(job), queue: rowPayload(queue),
    duplicates: rowPayload(collision), credential: rowPayload(credential), policy: rowPayload(policy)
  };
  assert.throws(() => verifyPreflight({
    ...base, duplicates: rowPayload({ ...collision, duplicate_count: 1 })
  }, new Date('2026-08-13T10:00:00.000Z')), /DUPLICATE_PUBLICATION_FOUND/);
  assert.throws(() => verifyPreflight({
    ...base, duplicates: rowPayload({ ...collision, competing_due_count: 1 })
  }, new Date('2026-08-13T10:00:00.000Z')), /COMPETING_INSTAGRAM_POST_DUE/);
  assert.throws(() => verifyPreflight({
    ...base, credential: rowPayload({ ...credential, expires_at: '2026-08-13T10:04:59.000Z' })
  }, new Date('2026-08-13T10:00:00.000Z')), /INSTAGRAM_CREDENTIAL_EXPIRING/);
  assert.throws(() => verifyPreflight({
    ...base, credential: rowPayload({ ...credential, account_id: 'wrong-account' })
  }, new Date('2026-08-13T10:00:00.000Z')), /INSTAGRAM_ACCOUNT_ID_MISMATCH/);
});

test('candidate verification accepts the exact approved bytes and probe only', () => {
  const candidate = new URL('../../../../runway-initial-test-31681423405/postprocess/HOSHILU_Runway_initial_test_candidate_20260813_v6a.mp4', import.meta.url);
  if (!candidate.protocol.startsWith('file')) return;
  let bytes;
  try { bytes = readFileSync(candidate); } catch { return; }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== INITIAL_REEL.candidateSha256) return;
  const probe = {
    streams: [
      { codec_type: 'video', codec_name: 'h264', profile: 'High', width: 720, height: 1280, pix_fmt: 'yuv420p', r_frame_rate: '24/1' },
      { codec_type: 'audio', codec_name: 'aac', sample_rate: '44100', channels: 2 }
    ],
    format: { duration: '8.057007' }
  };
  assert.equal(verifyCandidate(candidate, probe, INITIAL_REEL.audioSha256).sha256, digest);
  assert.throws(() => verifyCandidate(candidate, { ...probe, format: { duration: '8.1' } }, INITIAL_REEL.audioSha256), /CANDIDATE_DURATION_INVALID/);
});

test('staged, approved, published and reconciled evidence remains exact', () => {
  const stagedJob = {
    ...job, storage_key: INITIAL_REEL.candidateStorageKey, storage_etag: null,
    storage_size_bytes: INITIAL_REEL.candidateSize, caption: INITIAL_REEL.caption
  };
  const stagedQueue = { ...queue, caption: INITIAL_REEL.caption };
  assert.equal(verifyStaged({
    jobs: rowPayload(stagedJob), queue: rowPayload(stagedQueue), duplicates: rowPayload(collision)
  }), true);

  const approvalDetail = {
    checks: [
      'identity_consistent', 'face_hands_ok', 'hoshilu_visible', 'japanese_subtitles',
      'url_visible', 'audio_present', 'no_unrelated_brand', 'factual', 'ai_disclosure',
      'rights_confirmed', 'duplicate_checked', 'postprocessed'
    ],
    candidate_sha256: INITIAL_REEL.candidateSha256,
    approved_visual_source_sha256: INITIAL_REEL.approvedVisualSourceSha256,
    technical_reencode: true,
    ssim_all: 0.997868,
    psnr_average_db: 50.505671,
    platform_ai_label: true
  };
  const approvedJob = { ...stagedJob, status: 'APPROVED_FOR_POST', qa_status: 'PASSED' };
  const approvedQueue = {
    ...stagedQueue, status: 'APPROVED',
    scheduled_at: '2026-08-13T10:00:00.000Z', approved_at: '2026-08-13T10:00:00.000Z'
  };
  assert.equal(verifyApproved({
    jobs: rowPayload(approvedJob), queue: rowPayload(approvedQueue),
    audit: rowPayload({ audit_id: 'runway-initial-reel-v4-qa-approved-20260813', event: 'QA_APPROVED_FOR_POST', detail: JSON.stringify(approvalDetail) })
  }), true);

  for (const forwardQueue of [
    { ...approvedQueue, status: 'PUBLISHING', platform_job_id: 'ig-container-1' },
    { ...approvedQueue, status: 'PUBLISHED', external_post_id: 'ig-media-1', published_at: '2026-08-13T10:15:00.000Z' }
  ]) {
    assert.equal(verifyApproved({
      jobs: rowPayload(approvedJob), queue: rowPayload(forwardQueue),
      audit: rowPayload({ audit_id: 'runway-initial-reel-v4-qa-approved-20260813', event: 'QA_APPROVED_FOR_POST', detail: JSON.stringify(approvalDetail) })
    }), true);
  }

  const publicUrl = 'https://www.instagram.com/reel/ExampleCode/';
  const publishedQueue = {
    ...approvedQueue, status: 'PUBLISHED', external_post_id: 'ig-media-1',
    published_at: '2026-08-13T10:15:00.000Z'
  };
  assert.equal(verifyPublished({
    queue: rowPayload(publishedQueue),
    performance: rowPayload({ post_id: INITIAL_REEL.postId, platform: 'INSTAGRAM', public_url: publicUrl }),
    publicResult: { ok: true, post_id: INITIAL_REEL.postId, external_post_id: 'ig-media-1', public_url: publicUrl }
  }), true);

  assert.equal(verifyReconciled({
    jobs: rowPayload({ ...approvedJob, status: 'PUBLISHED' }),
    policy: rowPayload({ ...policy, initial_test_completed: 1 }),
    audit: rowPayload({ audit_id: 'runway-initial-reel-v4-published-20260813', event: 'PUBLISHED', detail: JSON.stringify({ post_id: INITIAL_REEL.postId, external_post_id: 'ig-media-1', public_url: publicUrl }) })
  }), true);
});

test('mutation verifier rejects partial writes', () => {
  assert.equal(verifyMutationChanges([{ meta: { changes: 1 } }, { meta: { changes: 1 } }], [1, 1]), true);
  assert.equal(verifyMutationChanges([{ meta: { changes: 3, rows_written: 2 } }], [1, 1]), true);
  assert.equal(verifyMutationChanges([{ meta: { changes: 3, rows_written: 5 } }], [1, 1]), true);
  assert.throws(() => verifyMutationChanges([{ meta: { changes: 1 } }, { meta: { changes: 0 } }], [1, 1]), /D1_MUTATION_CHANGE_COUNT_INVALID/);
  assert.throws(() => verifyMutationChanges([{ meta: { changes: 3, rows_written: 1 } }], [1, 1]), /D1_MUTATION_CHANGE_COUNT_INVALID/);
  assert.throws(() => verifyMutationChanges([{ meta: { changes: 4, rows_written: 5 } }], [1, 1]), /D1_MUTATION_CHANGE_COUNT_INVALID/);
});

test('Wrangler progress text cannot corrupt strict JSON verification', () => {
  const payload = [{ results: [{ ok: 1 }], meta: { changes: 1 } }];
  assert.deepEqual(parseJsonDocument(JSON.stringify(payload)), payload);
  assert.deepEqual(parseJsonDocument(`\u001b[90m├ Checking remote database...\u001b[0m\n${JSON.stringify(payload)}\n`), payload);
  assert.deepEqual(parseJsonDocument(`notice {not-json}\n${JSON.stringify(payload)}\ntrailing status`), payload);
  assert.throws(() => parseJsonDocument('├ Checking remote database...'), /JSON_DOCUMENT_NOT_FOUND/);
});

test('workflow is explicit, exact-hash gated and never calls the Runway generation API', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const section = workflow.slice(workflow.indexOf('  runway-initial-reel-publish:'));
  assert.match(section, /publish-runway-initial-reel-approved/);
  assert.match(section, /needs: \[test, deploy\]/);
  assert.match(section, /88e65826b923bbf11cfcf99228367a629c76a2eddc51ab661a58be36395b71b9/);
  assert.match(section, /competing_due_count/);
  assert.match(section, /ffmpeg=7:6\.1\.1-3ubuntu5/);
  assert.match(section, /get_r2_object_with_missing_retry/);
  assert.match(section, /for attempt in \$\(seq 1 6\)/);
  assert.match(section, /R2 round-trip verification failed after bounded retries/);
  assert.doesNotMatch(section, /api\.dev\.runwayml\.com|\/api\/internal\/runway\/run/);
});

test('renderer disables CPU-dependent video paths for reproducible approved bytes', () => {
  const renderer = readFileSync(new URL('../ops/runway/render_initial_reel_20260813.sh', import.meta.url), 'utf8');
  assert.match(renderer, /-cpuflags 0/);
  assert.match(renderer, /-cpucount 1/);
  assert.match(renderer, /-filter_threads 1/);
  assert.match(renderer, /-filter_complex_threads 1/);
  assert.match(renderer, /-x264-params 'asm=0:threads=1:lookahead_threads=1:sliced_threads=0'/);
  assert.equal((renderer.match(/-threads 1/g) || []).length, 3);
});

test('split approval keeps queue release isolated and the initial cap until reconcile', () => {
  const approve = readFileSync(new URL('../ops/runway/approve_initial_reel_20260813_v4.sql', import.meta.url), 'utf8');
  const release = readFileSync(new URL('../ops/runway/release_initial_reel_20260813_v4.sql', import.meta.url), 'utf8');
  const reconcile = readFileSync(new URL('../ops/runway/reconcile_initial_reel_20260813_v4.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(approve, /initial_test_completed\s*=\s*1/i);
  assert.match(reconcile, /initial_test_completed=1/);
  assert.doesNotMatch(approve, /UPDATE social_post_queue/);
  assert.equal(release.trimEnd().lastIndexOf('UPDATE social_post_queue'), release.trimEnd().indexOf('UPDATE social_post_queue'));
  assert.match(release.trimEnd(), /UPDATE social_post_queue[\s\S]+;$/);
});

test('health verifier fails closed', () => {
  assert.equal(verifyHealth(health), true);
  assert.throws(() => verifyHealth({ ...health, ok: false }), /HEALTH_NOT_OK/);
});
