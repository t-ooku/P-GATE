import { readFileSync } from 'node:fs';

const CAMPAIGNS = new Set(['hoshilu-evergreen-13mall-v1', 'hoshilu-official-13mall-v2']);
const PLATFORMS = new Set(['X', 'INSTAGRAM']);
const CUTOFF = '2026-08-13T13:30:00.000Z';
const REASON = 'SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813';
const IMMUTABLE_FIELDS = Object.freeze([
  'post_id', 'campaign_id', 'platform', 'scheduled_at',
  'external_post_id', 'platform_job_id', 'published_at'
]);

function fail(code) { throw new Error(code); }

export function readD1Rows(path) {
  const payload = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.success !== true) {
    fail('X_QUEUE_EVIDENCE_INVALID');
  }
  const result = payload[0]?.results;
  if (!Array.isArray(result)) fail('X_QUEUE_EVIDENCE_ROWS_INVALID');
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function findBookmark(value) {
  if (!value || typeof value !== 'object') return '';
  if (typeof value.bookmark === 'string' && value.bookmark.trim()) return value.bookmark.trim();
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const bookmark = findBookmark(child);
    if (bookmark) return bookmark;
  }
  return '';
}

export function verifyTimeTravelBookmark(payload) {
  if (!findBookmark(payload)) fail('X_QUEUE_RECOVERY_BOOKMARK_MISSING');
  return { bookmark_present: true };
}

export function verifyQueueQuarantineMutation(preflight, payload) {
  if (preflight?.ok !== true || !Number.isInteger(preflight?.candidates)
    || preflight.candidates < 0) fail('X_QUEUE_PREFLIGHT_SUMMARY_INVALID');
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.success !== true) {
    fail('X_QUEUE_MUTATION_EVIDENCE_INVALID');
  }
  const changes = payload[0]?.meta?.changes;
  if (!Number.isInteger(changes) || changes !== preflight.candidates) {
    fail('X_QUEUE_MUTATION_CHANGE_COUNT_INVALID');
  }
  return { changes };
}

function validateIdentity(row) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(row?.post_id || ''))) fail('X_QUEUE_POST_ID_INVALID');
  if (!CAMPAIGNS.has(row.campaign_id) || !PLATFORMS.has(row.platform)) fail('X_QUEUE_SCOPE_INVALID');
  if (String(row.scheduled_at || '') <= CUTOFF) fail('X_QUEUE_TIME_SCOPE_INVALID');
}

function indexed(rows, stage) {
  const map = new Map();
  for (const row of rows) {
    validateIdentity(row);
    if (map.has(row.post_id)) fail(`X_QUEUE_DUPLICATE_${stage}_ROW`);
    map.set(row.post_id, row);
  }
  return map;
}

function approvedCandidate(row) {
  if (row.status !== 'APPROVED') return false;
  if (String(row.external_post_id || '') || String(row.platform_job_id || '')
    || String(row.published_at || '')) fail('X_QUEUE_APPROVED_EXTERNAL_STATE_PRESENT');
  return true;
}

export function verifyQueueQuarantinePreflight(rows) {
  const before = indexed(rows, 'PRE');
  let candidates = 0;
  for (const row of before.values()) {
    if (row.status === 'PUBLISHING') fail('X_QUEUE_IN_FLIGHT_BLOCKED');
    if (approvedCandidate(row)) candidates += 1;
  }
  return { rows: before.size, candidates };
}

export function verifyQueueQuarantine(beforeRows, afterRows) {
  const before = indexed(beforeRows, 'PRE');
  const after = indexed(afterRows, 'POST');
  if (before.size !== after.size) fail('X_QUEUE_POST_COUNT_MISMATCH');
  let candidates = 0;
  for (const [postId, pre] of before) {
    const post = after.get(postId);
    if (!post) fail('X_QUEUE_POST_ROW_MISSING');
    if (pre.status === 'PUBLISHING' || post.status === 'PUBLISHING') fail('X_QUEUE_IN_FLIGHT_BLOCKED');
    for (const field of IMMUTABLE_FIELDS) {
      if (post[field] !== pre[field]) fail('X_QUEUE_IMMUTABLE_FIELD_CHANGED');
    }
    if (approvedCandidate(pre)) {
      candidates += 1;
      if (post.status !== 'CANCELLED' || post.last_error !== REASON) fail('X_QUEUE_POST_NOT_QUARANTINED');
    } else if (post.status !== pre.status || post.last_error !== pre.last_error) {
      fail('X_QUEUE_NON_CANDIDATE_CHANGED');
    }
  }
  if ([...after.values()].some(row => row.status === 'APPROVED')) fail('X_QUEUE_APPROVED_REMAINS');
  return { rows: before.size, quarantined_this_run: candidates };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const [mode, beforePath, afterPath] = process.argv.slice(2);
  if (mode === 'preflight') {
    process.stdout.write(JSON.stringify({ ok: true, ...verifyQueueQuarantinePreflight(readD1Rows(beforePath)) }));
  } else if (mode === 'bookmark') {
    process.stdout.write(JSON.stringify({ ok: true, ...verifyTimeTravelBookmark(readJson(beforePath)) }));
  } else if (mode === 'mutation') {
    process.stdout.write(JSON.stringify({ ok: true, ...verifyQueueQuarantineMutation(
      readJson(beforePath), readJson(afterPath)
    ) }));
  } else if (mode === 'postflight') {
    process.stdout.write(JSON.stringify({ ok: true, ...verifyQueueQuarantine(readD1Rows(beforePath), readD1Rows(afterPath)) }));
  } else {
    fail('X_QUEUE_VERIFY_USAGE');
  }
}

export const X_QUEUE_QUARANTINE = Object.freeze({ campaigns: [...CAMPAIGNS], cutoff: CUTOFF, reason: REASON });
