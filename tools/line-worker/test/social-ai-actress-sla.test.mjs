import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSocialAiActressSla,
  expectedFormatForDate,
  inspectSocialAiActressSla,
  isEligibleSocialAiActressRow,
  runSocialAiActressSla,
  socialAiActressJstClock,
  socialAiActressSlaSql
} from '../scripts/check-social-ai-actress-sla.mjs';

// 2026-09-17 大隆さん決定（SNS 方針 v3）: リールは火・金（Runway 新規生成・当日 06:00 JST）、
// カルーセルは月・水・土（画像 2〜10 枚、Instagram と X 同日）。木・日は要求しない。9/21 より前は要求しない。
const CAROUSEL_DAY = '2026-09-21'; // 月
const REEL_DAY = '2026-09-22'; // 火

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function carouselRow(date, platform, status = 'APPROVED', overrides = {}) {
  const published = status === 'PUBLISHED';
  return {
    post_id: `hoshilu-carousel-v3-${platform.toLowerCase()}-${date}`,
    platform,
    campaign_id: 'hoshilu-carousel-v3',
    content_id: 'carousel-user-hoshittoku-basics',
    status,
    scheduled_at: `${date}T11:00:00.000Z`,
    queue_approved_at: '2026-09-18T00:00:00.000Z',
    external_post_id: published ? (platform === 'X' ? '2099999999999999999' : '18099999999999999') : null,
    published_at: published ? `${date}T11:05:00.000Z` : null,
    jst_publish_date: date,
    crosspost_group_id: `hoshilu-carousel-${date}`,
    queue_media_url: '',
    queue_media_urls: JSON.stringify([1, 2, 3, 4].map((n) => `https://hoshilu.app/social/carousel/user-hoshittoku-basics/${n}.jpg`)),
    ...overrides
  };
}
function carouselRows(date, status = 'APPROVED') {
  return ['X', 'INSTAGRAM'].map((platform) => carouselRow(date, platform, status));
}
function futureCarouselRows(today) {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index + 1))
    .filter((date) => expectedFormatForDate(date) === 'CAROUSEL')
    .flatMap((date) => carouselRows(date));
}

function runwayRow(date, platform, status = 'APPROVED') {
  const jobId = `runway-auto-want-at-price-${date.replaceAll('-', '')}`;
  const postId = `hoshilu-runway-auto-want-at-price-${date.replaceAll('-', '')}` + (platform === 'X' ? '-x' : '');
  const published = status === 'PUBLISHED';
  return {
    post_id: postId,
    platform,
    campaign_id: 'hoshilu-runway-video',
    content_id: jobId,
    status,
    scheduled_at: `${date}T11:15:00.000Z`,
    queue_approved_at: `${date}T00:00:00.000Z`,
    external_post_id: published ? (platform === 'X' ? '2099999999999999998' : '18099999999999998') : null,
    published_at: published ? `${date}T11:20:00.000Z` : null,
    jst_publish_date: '',
    queue_media_url: `https://hoshilu.app/api/social/media/runway/${jobId}.mp4`,
    runway_status: published ? 'PUBLISHED' : 'APPROVED_FOR_POST',
    runway_qa_status: 'PASSED',
    runway_rights_confirmed: 1,
    runway_ai_disclosure_confirmed: 1
  };
}
function runwayRows(date, status = 'APPROVED') {
  return ['X', 'INSTAGRAM'].map((platform) => runwayRow(date, platform, status));
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
        : (row.campaign_id === 'hoshilu-runway-video' ? 'https://www.instagram.com/reel/AutoReel22/' : 'https://www.instagram.com/p/Carousel21/')
    }
  }]));
}

test('方針 v3 の曜日: 月水土=カルーセル、火金=リール、木日=要求なし、9/21 より前は要求なし', () => {
  assert.equal(expectedFormatForDate('2026-09-20'), '');
  assert.equal(expectedFormatForDate('2026-09-21'), 'CAROUSEL');
  assert.equal(expectedFormatForDate('2026-09-22'), 'REEL');
  assert.equal(expectedFormatForDate('2026-09-23'), 'CAROUSEL');
  assert.equal(expectedFormatForDate('2026-09-24'), '');
  assert.equal(expectedFormatForDate('2026-09-25'), 'REEL');
  assert.equal(expectedFormatForDate('2026-09-26'), 'CAROUSEL');
  assert.equal(expectedFormatForDate('2026-09-27'), '');
  // 9/21 より前の日は、旧方針の毎日 v2 女優リールも要求しない（9/16 停止決定）
  const before = evaluateSocialAiActressSla({ rows: futureCarouselRows('2026-09-19'), now: '2026-09-19T12:00:00.000Z' });
  assert.equal(before.status, 'PASS', JSON.stringify(before.violations));
  assert.equal(before.approval_required, false);
  assert.equal(before.future.expected_today, 'NONE');
  // 将来のカルーセル在庫が無ければ在庫不足（先に投入しておく）
  assert.equal(evaluateSocialAiActressSla({ rows: [], now: '2026-09-19T12:00:00.000Z' }).code, 'SOCIAL_AI_ACTRESS_FUTURE_INVENTORY_MISSING');
});

test('カルーセル日: 18:00 までは今日を要求せず、承認済みペアで 18:00、公開＋公開監査で 20:30 を満たす', () => {
  const future = futureCarouselRows(CAROUSEL_DAY);
  const before = evaluateSocialAiActressSla({ rows: [...future], now: `${CAROUSEL_DAY}T08:59:59.999Z` });
  assert.equal(before.status, 'PASS');
  assert.equal(before.approval_required, false);
  assert.equal(before.future.expected_today, 'CAROUSEL');
  const approved = evaluateSocialAiActressSla({ rows: [...carouselRows(CAROUSEL_DAY), ...future], now: `${CAROUSEL_DAY}T09:00:00.000Z` });
  assert.equal(approved.status, 'PASS');
  assert.equal(approved.today.approval, 'PASS');
  const notPublished = evaluateSocialAiActressSla({ rows: [...carouselRows(CAROUSEL_DAY), ...future], now: `${CAROUSEL_DAY}T11:30:00.000Z` });
  assert.equal(notPublished.code, 'SOCIAL_AI_ACTRESS_TODAY_NOT_PUBLISHED');
  const published = carouselRows(CAROUSEL_DAY, 'PUBLISHED');
  const ok = evaluateSocialAiActressSla({ rows: [...published, ...future], publicPosts: publicPosts(published), now: `${CAROUSEL_DAY}T11:30:00.000Z` });
  assert.equal(ok.status, 'PASS', JSON.stringify(ok.violations));
  assert.equal(ok.today.publication, 'PASS');
});

test('リール日: Runway 自動生成のペア（QA 合格・権利・AI 開示）だけが今日を満たし、将来在庫はカルーセルだけ要求する', () => {
  const future = futureCarouselRows(REEL_DAY);
  const missing = evaluateSocialAiActressSla({ rows: future, now: `${REEL_DAY}T09:00:00.000Z` });
  assert.equal(missing.code, 'SOCIAL_AI_ACTRESS_TODAY_NOT_APPROVED');
  assert.deepEqual(missing.violations, ['TODAY_NOT_APPROVED:X', 'TODAY_NOT_APPROVED:INSTAGRAM']);
  const approved = evaluateSocialAiActressSla({ rows: [...runwayRows(REEL_DAY), ...future], now: `${REEL_DAY}T09:00:00.000Z` });
  assert.equal(approved.status, 'PASS', JSON.stringify(approved.violations));
  assert.equal(approved.future.required, future.length);
  const published = runwayRows(REEL_DAY, 'PUBLISHED');
  const ok = evaluateSocialAiActressSla({ rows: [...published, ...future], publicPosts: publicPosts(published), now: `${REEL_DAY}T11:30:00.000Z` });
  assert.equal(ok.status, 'PASS', JSON.stringify(ok.violations));
  // カルーセル行はリール日には資格がない（曜日が違う）
  assert.equal(isEligibleSocialAiActressRow(carouselRow(REEL_DAY, 'X'), { asOf: `${REEL_DAY}T09:00:00.000Z` }), false);
  // 旧方針の日次 v2 女優行は 9/21 以降は資格がない
  assert.equal(isEligibleSocialAiActressRow({ ...carouselRow(REEL_DAY, 'X'), campaign_id: 'hoshilu-ai-actress-daily-v1', queue_creative_policy: 'DAILY_AI_ACTRESS_22' }, { asOf: `${REEL_DAY}T09:00:00.000Z` }), false);
});

test('Runway 行は QA・権利・AI 開示・媒体 URL・曜日が揃わないと資格を失う', () => {
  const asOf = `${REEL_DAY}T09:00:00.000Z`;
  assert.equal(isEligibleSocialAiActressRow(runwayRow(REEL_DAY, 'X'), { asOf }), true);
  for (const bad of [
    { runway_qa_status: 'PENDING' }, { runway_rights_confirmed: 0 }, { runway_ai_disclosure_confirmed: 0 },
    { runway_status: 'GENERATED_REVIEW_REQUIRED' }, { queue_media_url: 'https://hoshilu.app/social/other.mp4' },
    { status: 'CANCELLED' }, { post_id: 'hoshilu-runway-auto-want-at-price-20260922' }
  ]) assert.equal(isEligibleSocialAiActressRow({ ...runwayRow(REEL_DAY, 'X'), ...bad }, { asOf }), false, JSON.stringify(bad));
  // 月曜（カルーセル日）の Runway 行は資格なし
  assert.equal(isEligibleSocialAiActressRow(runwayRow(CAROUSEL_DAY, 'X'), { asOf }), false);
});

test('カルーセル行は 2〜10 枚の自サイト画像・同じ相互投稿グループ・曜日が揃わないと資格を失う', () => {
  const asOf = `${CAROUSEL_DAY}T09:00:00.000Z`;
  assert.equal(isEligibleSocialAiActressRow(carouselRow(CAROUSEL_DAY, 'INSTAGRAM'), { asOf }), true);
  for (const bad of [
    { queue_media_urls: JSON.stringify(['https://hoshilu.app/social/carousel/x/1.jpg']) },
    { queue_media_urls: JSON.stringify(['https://example.com/1.jpg', 'https://example.com/2.jpg']) },
    { queue_media_urls: '' }, { crosspost_group_id: 'other' }, { status: 'REVIEW_REQUIRED' },
    { post_id: 'hoshilu-carousel-v3-instagram-2026-09-22' }, { scheduled_at: '2026-09-22T11:00:00.000Z' }
  ]) assert.equal(isEligibleSocialAiActressRow({ ...carouselRow(CAROUSEL_DAY, 'INSTAGRAM'), ...bad }, { asOf }), false, JSON.stringify(bad));
  // X と Instagram で別セットなら相互投稿の不一致
  const mismatch = [carouselRow(CAROUSEL_DAY, 'X'), carouselRow(CAROUSEL_DAY, 'INSTAGRAM', 'APPROVED', { content_id: 'carousel-seller-demand-visible' })];
  const result = evaluateSocialAiActressSla({ rows: [...mismatch, ...futureCarouselRows(CAROUSEL_DAY)], now: asOf });
  assert.ok(result.violations.includes(`TODAY_CROSSPOST_MISMATCH:${CAROUSEL_DAY}`));
});

test('将来在庫: カルーセル日の片方の媒体が無ければ不足、重複は黙って選ばず失敗', () => {
  const future = futureCarouselRows(CAROUSEL_DAY);
  const missingOne = future.filter((row) => !(row.platform === 'X' && row.jst_publish_date === '2026-09-23'));
  const missing = evaluateSocialAiActressSla({ rows: [...carouselRows(CAROUSEL_DAY), ...missingOne], now: `${CAROUSEL_DAY}T09:00:00.000Z` });
  assert.equal(missing.code, 'SOCIAL_AI_ACTRESS_FUTURE_INVENTORY_MISSING');
  assert.ok(missing.violations.includes('FUTURE_MISSING:2026-09-23:X'));
  const duplicate = evaluateSocialAiActressSla({ rows: [...carouselRows(CAROUSEL_DAY), ...carouselRows(CAROUSEL_DAY), ...future], now: `${CAROUSEL_DAY}T09:00:00.000Z` });
  assert.equal(duplicate.code, 'SOCIAL_AI_ACTRESS_DUPLICATE_ELIGIBLE');
});

test('公開監査の応答が食い違えば失敗（post_id・外部ID・公開URL）', () => {
  const published = carouselRows(CAROUSEL_DAY, 'PUBLISHED');
  const audits = publicPosts(published);
  audits.X.payload.external_post_id = '1';
  const result = evaluateSocialAiActressSla({ rows: [...published, ...futureCarouselRows(CAROUSEL_DAY)], publicPosts: audits, now: `${CAROUSEL_DAY}T11:30:00.000Z` });
  assert.equal(result.code, 'SOCIAL_AI_ACTRESS_PUBLIC_AUDIT_FAILED');
  assert.ok(result.violations.includes('PUBLIC_AUDIT_FAILED:X'));
});

test('JST date arithmetic crosses year boundaries without using runner timezone', () => {
  const clock = socialAiActressJstClock('2026-12-31T15:00:00.000Z');
  assert.equal(clock.date, '2027-01-01');
  assert.equal(clock.minutes, 0);
  const late = socialAiActressJstClock('2026-12-31T14:59:59.999Z');
  assert.equal(late.date, '2026-12-31');
});

test('D1 query joins queue to creative metadata, includes carousel rows and excludes sensitive post content', () => {
  const sql = socialAiActressSlaSql();
  assert.match(sql, /LEFT JOIN social_creative_assets a ON a\.asset_id=q\.creative_asset_id/u);
  assert.match(sql, /LEFT JOIN runway_generation_jobs r ON r\.job_id=q\.content_id/u);
  assert.match(sql, /q\.media_urls AS queue_media_urls/u);
  assert.match(sql, /q\.campaign_id='hoshilu-carousel-v3' AND q\.jst_publish_date BETWEEN \?1 AND \?2/u);
  assert.match(sql, /q\.crosspost_group_id/u);
  assert.doesNotMatch(sql, /caption|access_token|refresh_token|last_error|provider_response/iu);
});

test('inspector queries D1 only before publication gate', async () => {
  const calls = [];
  const rows = [...carouselRows(CAROUSEL_DAY), ...futureCarouselRows(CAROUSEL_DAY)];
  const fetcher = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return Response.json({ success: true, result: [{ success: true, results: rows }] });
  };
  const result = await inspectSocialAiActressSla({ accountId: 'account', apiToken: 'secret', fetcher, now: `${CAROUSEL_DAY}T11:29:59.999Z` });
  assert.equal(result.status, 'PASS', JSON.stringify(result.violations));
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.params, ['2026-09-21', '2026-09-28']);
  assert.match(calls[0].url, /cloudflare\.com\/client\/v4\/accounts\/account\/d1\/database/u);
});

test('inspector verifies both public audit endpoints after publication gate', async () => {
  const published = carouselRows(CAROUSEL_DAY, 'PUBLISHED');
  const rows = [...published, ...futureCarouselRows(CAROUSEL_DAY)];
  const audits = publicPosts(published);
  const calls = [];
  const fetcher = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('api.cloudflare.com')) return Response.json({ success: true, result: [{ success: true, results: rows }] });
    const platform = url.includes('-instagram-') ? 'INSTAGRAM' : 'X';
    return Response.json(audits[platform].payload);
  };
  const result = await inspectSocialAiActressSla({ accountId: 'account', apiToken: 'secret', fetcher, now: `${CAROUSEL_DAY}T11:30:00.000Z` });
  assert.equal(result.status, 'PASS', JSON.stringify(result.violations));
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((url) => url.includes('/api/social/posts/')).length, 2);
});

test('runner retries a transient incomplete observation and returns recovered state', async () => {
  const complete = futureCarouselRows(CAROUSEL_DAY);
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    const rows = calls === 1 ? complete.slice(1) : complete;
    return Response.json({ success: true, result: [{ success: true, results: rows }] });
  };
  const result = await runSocialAiActressSla({ accountId: 'account', apiToken: 'secret', fetcher, now: `${CAROUSEL_DAY}T08:00:00.000Z`, attempts: 2, retryMs: 100 });
  assert.equal(calls, 2);
  assert.equal(result.status, 'PASS');
});
