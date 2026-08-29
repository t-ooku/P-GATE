import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSocialAiActressSla,
  inspectSocialAiActressSla,
  isEligibleSocialAiActressRow,
  runSocialAiActressSla,
  socialAiActressJstClock,
  socialAiActressSlaSql
} from '../scripts/check-social-ai-actress-sla.mjs';

const TODAY = '2026-08-29';
const PERSONA_ID = 'hoshilu-approved-model-reference-v2';
const SHA256 = 'a'.repeat(64);
const FIRST_USE_BY_WEEKDAY = Object.freeze([
  '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
  '2026-09-03', '2026-09-04', '2026-08-29'
]);

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function validRow(date, platform, status = 'APPROVED') {
  const slug = platform.toLowerCase();
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ];
  const assetId = `hoshilu_ai_actress_daily_${weekday}_v1`;
  const mediaUrl = `https://hoshilu.app/social/hoshilu-ai-actress-daily-${weekday}-v1.mp4`;
  const published = status === 'PUBLISHED';
  const crosspostGroupId = `hoshilu-ai-actress-daily-${date}`;
  return {
    post_id: `hoshilu-ai-actress-daily-v1-${slug}-${date}`,
    platform,
    campaign_id: 'hoshilu-ai-actress-daily-v1',
    content_id: crosspostGroupId,
    status,
    scheduled_at: `${date}T11:00:00.000Z`,
    queue_approved_at: '2026-08-29T00:00:00.000Z',
    external_post_id: published ? (platform === 'X' ? '2099999999999999999' : '18099999999999999') : null,
    published_at: published ? `${date}T11:15:00.000Z` : null,
    creative_asset_id: assetId,
    queue_content_format: 'REEL',
    queue_creative_policy: 'DAILY_AI_ACTRESS_22',
    jst_publish_date: date,
    queue_ai_generated: 1,
    crosspost_group_id: crosspostGroupId,
    queue_media_url: mediaUrl,
    asset_id: assetId,
    asset_media_url: mediaUrl,
    media_sha256: SHA256,
    asset_content_format: 'REEL',
    asset_creative_policy: 'DAILY_AI_ACTRESS_22',
    asset_jst_publish_date: FIRST_USE_BY_WEEKDAY[
      new Date(`${date}T00:00:00Z`).getUTCDay()
    ],
    persona_id: PERSONA_ID,
    persona_age: 22,
    ai_actress_present: 1,
    audio_confirmed: 1,
    rights_confirmed: 1,
    rights_ledger_id: `rights-${weekday}`,
    qa_status: 'PASSED',
    asset_ai_generated: 1,
    ai_disclosure_confirmed: 1,
    asset_approved_at: '2026-08-29T00:00:00.000Z'
  };
}

function futureRows(today = TODAY) {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index + 1))
    .flatMap((date) => ['X', 'INSTAGRAM'].map((platform) => validRow(date, platform)));
}

function todayRows(status = 'APPROVED', today = TODAY) {
  return ['X', 'INSTAGRAM'].map((platform) => validRow(today, platform, status));
}

function publicPosts(rows) {
  return Object.fromEntries(rows.map((row) => [row.platform, {
    http_status: 200,
    payload: {
      ok: true,
      post_id: row.post_id,
      platform: row.platform,
      status: 'PUBLISHED',
      external_post_id: row.external_post_id,
      published_at: row.published_at,
      public_url: row.platform === 'X'
        ? `https://x.com/i/web/status/${row.external_post_id}`
        : 'https://www.instagram.com/reel/DailyActress29/'
    }
  }]));
}

test('JST gates are inclusive and do not require today before 18:00', () => {
  const rows = futureRows();
  const before = evaluateSocialAiActressSla({ rows, now: '2026-08-29T08:59:59.999Z' });
  assert.equal(before.status, 'PASS');
  assert.equal(before.approval_required, false);
  assert.equal(before.publication_required, false);
  assert.equal(before.future.ready, 14);

  const atApproval = evaluateSocialAiActressSla({ rows, now: '2026-08-29T09:00:00.000Z' });
  assert.equal(atApproval.status, 'FAIL');
  assert.equal(atApproval.code, 'SOCIAL_AI_ACTRESS_TODAY_NOT_APPROVED');
  assert.equal(atApproval.approval_required, true);
});

test('approved eligible X and Instagram rows satisfy the 18:00 gate', () => {
  const result = evaluateSocialAiActressSla({
    rows: [...todayRows(), ...futureRows()],
    now: '2026-08-29T09:00:00.000Z'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.today.approval, 'PASS');
  assert.equal(result.today.publication, 'NOT_DUE');
});

test('publication is not required at 20:29:59 and is required at 20:30', () => {
  const rows = [...todayRows(), ...futureRows()];
  assert.equal(evaluateSocialAiActressSla({
    rows, now: '2026-08-29T11:29:59.999Z'
  }).status, 'PASS');
  const atPublication = evaluateSocialAiActressSla({
    rows, now: '2026-08-29T11:30:00.000Z'
  });
  assert.equal(atPublication.status, 'FAIL');
  assert.equal(atPublication.code, 'SOCIAL_AI_ACTRESS_TODAY_NOT_PUBLISHED');
  assert.equal(atPublication.publication_required, true);
});

test('D1 publication and both public audit permalinks satisfy the 20:30 gate', () => {
  const published = todayRows('PUBLISHED');
  const result = evaluateSocialAiActressSla({
    rows: [...published, ...futureRows()],
    publicPosts: publicPosts(published),
    now: '2026-08-29T11:30:00.000Z'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.today.publication, 'PASS');
  assert.equal(result.today.platforms.X.public_verified, true);
  assert.equal(result.today.platforms.INSTAGRAM.public_verified, true);
});

test('invalid or mismatched public audit response fails closed', () => {
  const published = todayRows('PUBLISHED');
  const audits = publicPosts(published);
  audits.INSTAGRAM.payload.public_url = 'https://example.com/not-instagram';
  const result = evaluateSocialAiActressSla({
    rows: [...published, ...futureRows()], publicPosts: audits,
    now: '2026-08-29T11:30:00.000Z'
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.code, 'SOCIAL_AI_ACTRESS_PUBLIC_AUDIT_FAILED');
  assert.match(result.violations.join(','), /PUBLIC_AUDIT_FAILED:INSTAGRAM/u);
});

test('every creative and queue eligibility dimension fails closed', () => {
  const mutations = {
    queue_status: (row) => { row.status = 'REVIEW_REQUIRED'; },
    post_id: (row) => { row.post_id = 'wrong'; },
    campaign: (row) => { row.campaign_id = 'wrong'; },
    content_id: (row) => { row.content_id = 'wrong'; },
    queue_approval: (row) => { row.queue_approved_at = null; },
    queue_format: (row) => { row.queue_content_format = 'IMAGE'; },
    queue_policy: (row) => { row.queue_creative_policy = 'OTHER'; },
    queue_ai: (row) => { row.queue_ai_generated = 0; },
    crosspost_group: (row) => { row.crosspost_group_id = ''; },
    asset_reference: (row) => { row.creative_asset_id = 'wrong'; },
    scheduled_jst_date: (row) => { row.scheduled_at = `${addDays(row.jst_publish_date, 1)}T11:00:00Z`; },
    asset_jst_date: (row) => { row.asset_jst_publish_date = TODAY; },
    asset_jst_after_queue: (row) => { row.asset_jst_publish_date = addDays(row.asset_jst_publish_date, 364); },
    media_url: (row) => { row.queue_media_url = 'https://hoshilu.app/social/wrong.mp4'; },
    media_hash: (row) => { row.media_sha256 = 'bad'; },
    asset_format: (row) => { row.asset_content_format = 'IMAGE'; },
    asset_policy: (row) => { row.asset_creative_policy = 'OTHER'; },
    persona: (row) => { row.persona_id = 'unapproved-persona'; },
    age: (row) => { row.persona_age = 21; },
    actress_presence: (row) => { row.ai_actress_present = 0; },
    audio: (row) => { row.audio_confirmed = 0; },
    rights: (row) => { row.rights_confirmed = 0; },
    rights_ledger: (row) => { row.rights_ledger_id = ''; },
    qa: (row) => { row.qa_status = 'PENDING'; },
    asset_ai: (row) => { row.asset_ai_generated = 0; },
    disclosure: (row) => { row.ai_disclosure_confirmed = 0; },
    asset_approval: (row) => { row.asset_approved_at = 'invalid'; }
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const rows = futureRows();
    mutate(rows[0]);
    assert.equal(isEligibleSocialAiActressRow(rows[0]), false, name);
    const result = evaluateSocialAiActressSla({ rows, now: '2026-08-29T08:00:00Z' });
    assert.equal(result.status, 'FAIL', name);
    assert.equal(result.code, 'SOCIAL_AI_ACTRESS_FUTURE_INVENTORY_MISSING', name);
  }
});

test('one missing future platform and an invalid crosspost identity fail inventory', () => {
  const missing = futureRows().slice(1);
  const missingResult = evaluateSocialAiActressSla({ rows: missing, now: '2026-08-29T08:00:00Z' });
  assert.equal(missingResult.status, 'FAIL');
  assert.equal(missingResult.future.ready, 13);

  const mismatch = futureRows();
  mismatch[1].crosspost_group_id = 'different-but-nonempty';
  const mismatchResult = evaluateSocialAiActressSla({ rows: mismatch, now: '2026-08-29T08:00:00Z' });
  assert.equal(mismatchResult.code, 'SOCIAL_AI_ACTRESS_FUTURE_INVENTORY_MISSING');
  assert.equal(mismatchResult.future.ready, 13);
});

test('duplicate eligible inventory fails instead of silently choosing a post', () => {
  const rows = futureRows();
  rows.push({ ...rows[0] });
  const result = evaluateSocialAiActressSla({ rows, now: '2026-08-29T08:00:00Z' });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.code, 'SOCIAL_AI_ACTRESS_DUPLICATE_ELIGIBLE');
});

test('JST date arithmetic crosses year boundaries without using runner timezone', () => {
  const clock = socialAiActressJstClock('2026-12-31T15:00:00.000Z');
  assert.equal(clock.date, '2027-01-01');
  assert.equal(clock.minutes, 0);
  const result = evaluateSocialAiActressSla({
    rows: futureRows('2027-01-01'), now: '2026-12-31T15:00:00.000Z'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.future.from, '2027-01-02');
  assert.equal(result.future.to, '2027-01-08');
});

test('D1 query joins queue to creative metadata and excludes sensitive post content', () => {
  const sql = socialAiActressSlaSql();
  assert.match(sql, /LEFT JOIN social_creative_assets a ON a\.asset_id=q\.creative_asset_id/u);
  assert.match(sql, /q\.creative_policy='DAILY_AI_ACTRESS_22'/u);
  assert.match(sql, /q\.jst_publish_date BETWEEN \?1 AND \?2/u);
  assert.match(sql, /a\.persona_age/u);
  assert.match(sql, /a\.ai_actress_present/u);
  assert.match(sql, /a\.audio_confirmed/u);
  assert.match(sql, /q\.crosspost_group_id/u);
  assert.match(sql, /q\.campaign_id/u);
  assert.match(sql, /q\.content_id/u);
  assert.doesNotMatch(sql, /caption|access_token|refresh_token|last_error|provider_response/iu);
});

test('inspector queries D1 only before publication gate', async () => {
  const calls = [];
  const rows = [...todayRows(), ...futureRows()];
  const fetcher = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return Response.json({ success: true, result: [{ success: true, results: rows }] });
  };
  const result = await inspectSocialAiActressSla({
    accountId: 'account', apiToken: 'secret', fetcher,
    now: '2026-08-29T11:29:59.999Z'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.params, ['2026-08-29', '2026-09-05']);
  assert.match(calls[0].url, /cloudflare\.com\/client\/v4\/accounts\/account\/d1\/database/u);
});

test('inspector verifies both public audit endpoints after publication gate', async () => {
  const published = todayRows('PUBLISHED');
  const rows = [...published, ...futureRows()];
  const audits = publicPosts(published);
  const calls = [];
  const fetcher = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('api.cloudflare.com')) {
      return Response.json({ success: true, result: [{ success: true, results: rows }] });
    }
    const platform = url.includes('-instagram-') ? 'INSTAGRAM' : 'X';
    return Response.json(audits[platform].payload);
  };
  const result = await inspectSocialAiActressSla({
    accountId: 'account', apiToken: 'secret', fetcher,
    now: '2026-08-29T11:30:00.000Z'
  });
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((url) => url.includes('/api/social/posts/')).length, 2);
});

test('runner retries a transient incomplete observation and returns recovered state', async () => {
  const complete = futureRows();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    const rows = calls === 1 ? complete.slice(1) : complete;
    return Response.json({ success: true, result: [{ success: true, results: rows }] });
  };
  const result = await runSocialAiActressSla({
    accountId: 'account', apiToken: 'secret', fetcher,
    now: '2026-08-29T08:00:00.000Z', attempts: 2, retryMs: 100
  });
  assert.equal(calls, 2);
  assert.equal(result.status, 'PASS');
});
