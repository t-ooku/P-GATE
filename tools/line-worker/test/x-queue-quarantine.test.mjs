import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  verifyQueueQuarantine,
  verifyQueueQuarantineMutation,
  verifyQueueQuarantinePreflight,
  verifyTimeTravelBookmark
} from '../ops/x/verify_queue_quarantine_20260813.mjs';

const reason = 'SOCIAL_QUEUE_QUARANTINED_DUPLICATE_CAMPAIGN_20260813';
const row = (overrides = {}) => ({
  post_id: 'hoshilu-evergreen-13mall-v1-x-2026-08-14',
  campaign_id: 'hoshilu-evergreen-13mall-v1',
  platform: 'X',
  scheduled_at: '2026-08-14T11:00:00.000Z',
  status: 'APPROVED',
  external_post_id: '',
  platform_job_id: '',
  published_at: '',
  last_error: '',
  ...overrides
});

test('preflight counts only clean APPROVED rows and preserves all other statuses', () => {
  const rows = [
    row(),
    row({ post_id: 'failed', status: 'FAILED', last_error: 'API_ERROR' }),
    row({ post_id: 'review', status: 'REVIEW_REQUIRED' }),
    row({
      post_id: 'published', status: 'PUBLISHED', external_post_id: '123',
      published_at: '2026-08-14T11:00:10.000Z'
    }),
    row({ post_id: 'cancelled', status: 'CANCELLED', last_error: reason })
  ];
  assert.deepEqual(verifyQueueQuarantinePreflight(rows), { rows: 5, candidates: 1 });
});

test('only APPROVED X and Instagram candidates are quarantined', () => {
  const before = [
    row(),
    row({
      post_id: 'hoshilu-official-13mall-v2-instagram-2026-08-15',
      campaign_id: 'hoshilu-official-13mall-v2',
      platform: 'INSTAGRAM',
      scheduled_at: '2026-08-15T11:15:00.000Z'
    }),
    row({ post_id: 'failed', status: 'FAILED', last_error: 'API_ERROR' }),
    row({
      post_id: 'published', status: 'PUBLISHED', external_post_id: '123',
      published_at: '2026-08-14T11:00:10.000Z'
    })
  ];
  const after = before.map((item) => item.status === 'APPROVED'
    ? { ...item, status: 'CANCELLED', last_error: reason }
    : { ...item });
  assert.deepEqual(verifyQueueQuarantine(before, after), {
    rows: 4,
    quarantined_this_run: 2
  });
});

test('already quarantined rows make the one-shot workflow safely resumable', () => {
  const cancelled = row({ status: 'CANCELLED', last_error: reason });
  assert.deepEqual(verifyQueueQuarantinePreflight([cancelled]), { rows: 1, candidates: 0 });
  assert.deepEqual(verifyQueueQuarantine([cancelled], [cancelled]), {
    rows: 1,
    quarantined_this_run: 0
  });
});

test('in-flight and APPROVED rows with external publication state abort', () => {
  assert.throws(() => verifyQueueQuarantinePreflight([row({ status: 'PUBLISHING' })]), /IN_FLIGHT/);
  assert.throws(() => verifyQueueQuarantinePreflight([row({ external_post_id: 'posted' })]), /EXTERNAL_STATE/);
  assert.throws(() => verifyQueueQuarantinePreflight([row({ platform_job_id: 'container' })]), /EXTERNAL_STATE/);
  assert.throws(() => verifyQueueQuarantinePreflight([
    row({ published_at: '2026-08-14T11:00:00.000Z' })
  ]), /EXTERNAL_STATE/);
});

test('wrong scope, missing rows, leftover candidates and non-candidate changes fail closed', () => {
  assert.throws(() => verifyQueueQuarantinePreflight([row({ campaign_id: 'other' })]), /SCOPE/);
  assert.throws(() => verifyQueueQuarantinePreflight([
    row({ scheduled_at: '2026-08-12T11:00:00.000Z' })
  ]), /TIME_SCOPE/);
  assert.throws(() => verifyQueueQuarantine([row()], []), /COUNT/);
  assert.throws(() => verifyQueueQuarantine([row()], [row()]), /NOT_QUARANTINED|APPROVED_REMAINS/);

  const failed = row({ post_id: 'failed', status: 'FAILED', last_error: 'API_ERROR' });
  assert.throws(() => verifyQueueQuarantine(
    [failed], [{ ...failed, status: 'CANCELLED', last_error: reason }]
  ), /NON_CANDIDATE/);
  assert.throws(() => verifyQueueQuarantine([row()], [{
    ...row(), status: 'CANCELLED', platform: 'INSTAGRAM', last_error: reason
  }]), /FIELD_CHANGED/);
});

test('mutation evidence must exactly match the preflight candidate count', () => {
  const mutation = (changes) => [{ success: true, meta: { changes } }];
  assert.deepEqual(
    verifyQueueQuarantineMutation({ ok: true, candidates: 2 }, mutation(2)),
    { changes: 2 }
  );
  assert.deepEqual(
    verifyQueueQuarantineMutation({ ok: true, candidates: 0 }, mutation(0)),
    { changes: 0 }
  );
  assert.throws(() => verifyQueueQuarantineMutation(
    { ok: true, candidates: 2 }, mutation(1)
  ), /CHANGE_COUNT/);
  assert.throws(() => verifyQueueQuarantineMutation(
    { ok: true, candidates: 2 }, [{ success: false, meta: { changes: 2 } }]
  ), /EVIDENCE/);
});

test('time-travel recovery evidence requires a non-empty nested bookmark', () => {
  assert.deepEqual(
    verifyTimeTravelBookmark({ result: { bookmark: '00000001-test' } }),
    { bookmark_present: true }
  );
  assert.throws(
    () => verifyTimeTravelBookmark({ result: { bookmark: '' } }),
    /BOOKMARK_MISSING/
  );
});

test('completed quarantine workflow stays removed when explicitly approved X autopilot is enabled', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /setup-x-oauth-quarantine-approved/);
  assert.doesNotMatch(workflow, /x-oauth-infra-and-queue-quarantine/);
  assert.match(wrangler, /"X_PUBLISHING_ENABLED": "true"/);
  assert.match(wrangler, /"X_EVERGREEN_AUTOPILOT_ENABLED": "true"/);
  assert.match(wrangler, /"X_EXPECTED_USERNAME": "hoshilu_app"/);
});
