#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://hoshilu.app/';
const DEFAULT_DATABASE_ID = '17629324-b771-4348-982c-c25da48c29b2';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const APPROVAL_GATE_MINUTES = 18 * 60;
const PUBLICATION_GATE_MINUTES = 20 * 60 + 30;
const FUTURE_DAYS = 7;
const PLATFORMS = Object.freeze(['X', 'INSTAGRAM']);
const READY_STATUSES = new Set(['APPROVED', 'PUBLISHING', 'PUBLISHED']);
const POLICY = 'DAILY_AI_ACTRESS_22';
const PERSONA_ID = 'hoshilu-approved-model-reference-v2';
const CAMPAIGN_ID = 'hoshilu-ai-actress-daily-v1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed))) : fallback;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function timestampAtOrBefore(value, asOf) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed <= asOf;
}

function validHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function normalizeNow(now = new Date()) {
  const parsed = now instanceof Date ? now.getTime()
    : typeof now === 'number' ? now
      : Date.parse(String(now));
  assert(Number.isFinite(parsed), 'SOCIAL_AI_ACTRESS_NOW_INVALID');
  return parsed;
}

function addUtcDays(date, days) {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  assert(Number.isFinite(parsed), 'SOCIAL_AI_ACTRESS_JST_DATE_INVALID');
  return new Date(parsed + days * 86400000).toISOString().slice(0, 10);
}

function validJstDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value || ''))) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function expectedAssetId(date) {
  if (!validJstDate(date)) return '';
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
    new Date(`${date}T00:00:00.000Z`).getUTCDay()
  ];
  return `hoshilu_ai_actress_daily_${weekday}_v1`;
}

export function socialAiActressJstClock(now = new Date()) {
  const timestamp = normalizeNow(now);
  const shifted = new Date(timestamp + JST_OFFSET_MS);
  return {
    timestamp,
    checked_at: new Date(timestamp).toISOString(),
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  };
}

function timestampJstDate(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed)
    ? new Date(parsed + JST_OFFSET_MS).toISOString().slice(0, 10)
    : '';
}

export function socialAiActressSlaSql() {
  return `SELECT
    q.post_id,
    q.platform,
    q.campaign_id,
    q.content_id,
    q.status,
    q.scheduled_at,
    q.approved_at AS queue_approved_at,
    q.external_post_id,
    q.published_at,
    q.creative_asset_id,
    q.content_format AS queue_content_format,
    q.creative_policy AS queue_creative_policy,
    q.jst_publish_date,
    q.ai_generated AS queue_ai_generated,
    q.crosspost_group_id,
    q.media_url AS queue_media_url,
    a.asset_id,
    a.media_url AS asset_media_url,
    a.media_sha256,
    a.content_format AS asset_content_format,
    a.creative_policy AS asset_creative_policy,
    a.jst_publish_date AS asset_jst_publish_date,
    a.persona_id,
    a.persona_age,
    a.ai_actress_present,
    a.audio_confirmed,
    a.rights_confirmed,
    a.rights_ledger_id,
    a.qa_status,
    a.ai_generated AS asset_ai_generated,
    a.ai_disclosure_confirmed,
    a.approved_at AS asset_approved_at
  FROM social_post_queue q
  LEFT JOIN social_creative_assets a ON a.asset_id=q.creative_asset_id
  WHERE q.platform IN ('X','INSTAGRAM')
    AND q.creative_policy='DAILY_AI_ACTRESS_22'
    AND q.jst_publish_date BETWEEN ?1 AND ?2
  ORDER BY q.jst_publish_date,q.platform,q.post_id`;
}

export function isEligibleSocialAiActressRow(row = {}, { asOf = Date.now() } = {}) {
  const asOfTimestamp = normalizeNow(asOf);
  const platform = String(row.platform || '').toUpperCase();
  const status = String(row.status || '').toUpperCase();
  const scheduledDate = timestampJstDate(row.scheduled_at);
  const expectedGroup = `hoshilu-ai-actress-daily-${row.jst_publish_date}`;
  const expectedPostId = `${CAMPAIGN_ID}-${platform.toLowerCase()}-${row.jst_publish_date}`;
  return PLATFORMS.includes(platform)
    && row.post_id === expectedPostId
    && row.campaign_id === CAMPAIGN_ID
    && row.content_id === expectedGroup
    && READY_STATUSES.has(status)
    && timestampAtOrBefore(row.queue_approved_at, asOfTimestamp)
    && row.queue_content_format === 'REEL'
    && row.queue_creative_policy === POLICY
    && Number(row.queue_ai_generated) === 1
    && row.crosspost_group_id === expectedGroup
    && nonEmpty(row.creative_asset_id)
    && row.creative_asset_id === row.asset_id
    && row.creative_asset_id === expectedAssetId(row.jst_publish_date)
    && validJstDate(row.jst_publish_date)
    && row.jst_publish_date === scheduledDate
    && validJstDate(row.asset_jst_publish_date)
    && row.asset_jst_publish_date <= row.jst_publish_date
    && expectedAssetId(row.asset_jst_publish_date) === row.asset_id
    && validHttpsUrl(row.queue_media_url)
    && row.queue_media_url === row.asset_media_url
    && /^[a-f0-9]{64}$/u.test(String(row.media_sha256 || ''))
    && row.asset_content_format === 'REEL'
    && row.asset_creative_policy === POLICY
    && row.persona_id === PERSONA_ID
    && Number(row.persona_age) === 22
    && Number(row.ai_actress_present) === 1
    && Number(row.audio_confirmed) === 1
    && Number(row.rights_confirmed) === 1
    && nonEmpty(row.rights_ledger_id)
    && row.qa_status === 'PASSED'
    && Number(row.asset_ai_generated) === 1
    && Number(row.ai_disclosure_confirmed) === 1
    && timestampAtOrBefore(row.asset_approved_at, asOfTimestamp);
}

function rowsFor(rows, date, platform, asOf) {
  return rows.filter((row) => row.jst_publish_date === date
    && String(row.platform || '').toUpperCase() === platform
    && isEligibleSocialAiActressRow(row, { asOf }));
}

function safePlatformState(rows, date, platform, asOf) {
  const eligible = rowsFor(rows, date, platform, asOf);
  return {
    eligible_count: eligible.length,
    status: eligible.length === 1 ? String(eligible[0].status || '').toUpperCase() : null,
    post_id: eligible.length === 1 ? String(eligible[0].post_id || '') : null,
    public_verified: false
  };
}

function pairIsConsistent(xRows, instagramRows) {
  if (xRows.length !== 1 || instagramRows.length !== 1) return false;
  return xRows[0].creative_asset_id === instagramRows[0].creative_asset_id
    && xRows[0].crosspost_group_id === instagramRows[0].crosspost_group_id;
}

function publicAuditEntry(publicPosts, platform) {
  if (!publicPosts || typeof publicPosts !== 'object') return null;
  return publicPosts[platform] || publicPosts[platform.toLowerCase()] || null;
}

function validPublicAudit(entry, row, platform) {
  const payload = entry?.payload || entry;
  if (Number(entry?.http_status ?? 200) !== 200 || payload?.ok !== true) return false;
  if (payload.post_id !== row.post_id || payload.platform !== platform || payload.status !== 'PUBLISHED') return false;
  if (!nonEmpty(row.external_post_id) || payload.external_post_id !== row.external_post_id) return false;
  if (!validTimestamp(row.published_at) || payload.published_at !== row.published_at) return false;
  return platform === 'X'
    ? /^https:\/\/x\.com\/i\/web\/status\/\d+$/u.test(String(payload.public_url || ''))
      && /^\d+$/u.test(String(row.external_post_id))
    : /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/u
      .test(String(payload.public_url || ''));
}

export function evaluateSocialAiActressSla({ rows = [], publicPosts = {}, now = new Date() } = {}) {
  assert(Array.isArray(rows), 'SOCIAL_AI_ACTRESS_ROWS_INVALID');
  const clock = socialAiActressJstClock(now);
  const approvalRequired = clock.minutes >= APPROVAL_GATE_MINUTES;
  const publicationRequired = clock.minutes >= PUBLICATION_GATE_MINUTES;
  const todayStates = Object.fromEntries(PLATFORMS.map((platform) => [
    platform, safePlatformState(rows, clock.date, platform, clock.timestamp)
  ]));
  const duplicateKeys = [];
  const futureMissing = [];
  const futurePairMismatch = [];
  let futureReady = 0;

  for (let offset = 1; offset <= FUTURE_DAYS; offset += 1) {
    const date = addUtcDays(clock.date, offset);
    const xRows = rowsFor(rows, date, 'X', clock.timestamp);
    const instagramRows = rowsFor(rows, date, 'INSTAGRAM', clock.timestamp);
    for (const [platform, eligible] of [['X', xRows], ['INSTAGRAM', instagramRows]]) {
      futureReady += eligible.length === 1 ? 1 : 0;
      if (eligible.length === 0) futureMissing.push(`${date}:${platform}`);
      if (eligible.length > 1) duplicateKeys.push(`${date}:${platform}`);
    }
    if (xRows.length === 1 && instagramRows.length === 1
      && !pairIsConsistent(xRows, instagramRows)) futurePairMismatch.push(date);
  }

  const todayRows = Object.fromEntries(PLATFORMS.map((platform) => [
    platform, rowsFor(rows, clock.date, platform, clock.timestamp)
  ]));
  if (approvalRequired) {
    for (const platform of PLATFORMS) {
      if (todayRows[platform].length > 1) duplicateKeys.push(`${clock.date}:${platform}`);
    }
  }
  const todayPairMismatch = approvalRequired
    && todayRows.X.length === 1
    && todayRows.INSTAGRAM.length === 1
    && !pairIsConsistent(todayRows.X, todayRows.INSTAGRAM);

  const todayApprovalPassed = !approvalRequired || (
    PLATFORMS.every((platform) => todayRows[platform].length === 1) && !todayPairMismatch
  );
  let todayPublicationPassed = !publicationRequired;
  let publicAuditPassed = !publicationRequired;
  if (publicationRequired && todayApprovalPassed) {
    todayPublicationPassed = PLATFORMS.every((platform) => {
      const row = todayRows[platform][0];
      return row?.status === 'PUBLISHED'
        && nonEmpty(row.external_post_id)
        && timestampAtOrBefore(row.published_at, clock.timestamp);
    });
    if (todayPublicationPassed) {
      publicAuditPassed = PLATFORMS.every((platform) => {
        const valid = validPublicAudit(publicAuditEntry(publicPosts, platform), todayRows[platform][0], platform);
        todayStates[platform].public_verified = valid;
        return valid;
      });
    } else {
      publicAuditPassed = false;
    }
  } else if (publicationRequired) {
    todayPublicationPassed = false;
    publicAuditPassed = false;
  }

  const futurePassed = futureMissing.length === 0
    && futurePairMismatch.length === 0
    && duplicateKeys.every((key) => key.startsWith(`${clock.date}:`));
  let code = 'SOCIAL_AI_ACTRESS_SLA_OK';
  if (duplicateKeys.length) code = 'SOCIAL_AI_ACTRESS_DUPLICATE_ELIGIBLE';
  else if (publicationRequired && !todayPublicationPassed) code = 'SOCIAL_AI_ACTRESS_TODAY_NOT_PUBLISHED';
  else if (publicationRequired && !publicAuditPassed) code = 'SOCIAL_AI_ACTRESS_PUBLIC_AUDIT_FAILED';
  else if (approvalRequired && !todayApprovalPassed) code = 'SOCIAL_AI_ACTRESS_TODAY_NOT_APPROVED';
  else if (!futurePassed) code = 'SOCIAL_AI_ACTRESS_FUTURE_INVENTORY_MISSING';

  const violations = [
    ...duplicateKeys.map((key) => `DUPLICATE_ELIGIBLE:${key}`),
    ...futureMissing.map((key) => `FUTURE_MISSING:${key}`),
    ...futurePairMismatch.map((date) => `FUTURE_CROSSPOST_MISMATCH:${date}`)
  ];
  if (todayPairMismatch) violations.push(`TODAY_CROSSPOST_MISMATCH:${clock.date}`);
  if (approvalRequired && !todayApprovalPassed) {
    for (const platform of PLATFORMS) {
      if (todayRows[platform].length !== 1) violations.push(`TODAY_NOT_APPROVED:${platform}`);
    }
  }
  if (publicationRequired && todayApprovalPassed && !todayPublicationPassed) {
    for (const platform of PLATFORMS) {
      if (todayRows[platform][0]?.status !== 'PUBLISHED'
        || !nonEmpty(todayRows[platform][0]?.external_post_id)
        || !timestampAtOrBefore(todayRows[platform][0]?.published_at, clock.timestamp)) {
        violations.push(`TODAY_NOT_PUBLISHED:${platform}`);
      }
    }
  }
  if (publicationRequired && todayPublicationPassed && !publicAuditPassed) {
    for (const platform of PLATFORMS) {
      if (!todayStates[platform].public_verified) violations.push(`PUBLIC_AUDIT_FAILED:${platform}`);
    }
  }

  return {
    status: code === 'SOCIAL_AI_ACTRESS_SLA_OK' ? 'PASS' : 'FAIL',
    code,
    checked_at: clock.checked_at,
    jst_date: clock.date,
    approval_required: approvalRequired,
    publication_required: publicationRequired,
    today: {
      approval: approvalRequired ? (todayApprovalPassed ? 'PASS' : 'FAIL') : 'NOT_DUE',
      publication: publicationRequired ? (todayPublicationPassed && publicAuditPassed ? 'PASS' : 'FAIL') : 'NOT_DUE',
      platforms: todayStates
    },
    future: {
      from: addUtcDays(clock.date, 1),
      to: addUtcDays(clock.date, FUTURE_DAYS),
      required: FUTURE_DAYS * PLATFORMS.length,
      ready: futureReady,
      status: futurePassed ? 'PASS' : 'FAIL'
    },
    violations
  };
}

async function queryD1Rows(fetcher, endpoint, apiToken, sql, params, requestTimeoutMs) {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      'user-agent': 'HOSHILU-Production-Monitor/1.0'
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  assert(response?.ok, `SOCIAL_AI_ACTRESS_D1_HTTP_${Number(response?.status) || 0}`);
  const payload = await response.json();
  const query = Array.isArray(payload?.result) ? payload.result[0] : null;
  assert(payload?.success === true && query?.success !== false, 'SOCIAL_AI_ACTRESS_D1_QUERY_FAILED');
  return Array.isArray(query?.results) ? query.results : [];
}

async function fetchPublicAudit(fetcher, baseUrl, postId, requestTimeoutMs) {
  const response = await fetcher(new URL(`/api/social/posts/${encodeURIComponent(postId)}`, baseUrl), {
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      'user-agent': 'HOSHILU-Production-Monitor/1.0'
    },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* Evaluator reports the invalid public audit safely. */ }
  return { http_status: Number(response?.status) || 0, payload };
}

export async function inspectSocialAiActressSla({
  accountId,
  apiToken,
  databaseId = DEFAULT_DATABASE_ID,
  baseUrl = DEFAULT_BASE_URL,
  fetcher = fetch,
  now = new Date(),
  requestTimeoutMs = 10000
} = {}) {
  assert(nonEmpty(accountId), 'CLOUDFLARE_ACCOUNT_ID_MISSING');
  assert(nonEmpty(apiToken), 'CLOUDFLARE_API_TOKEN_MISSING');
  const timeout = boundedInteger(requestTimeoutMs, 10000, 100, 30000);
  const clock = socialAiActressJstClock(now);
  const end = addUtcDays(clock.date, FUTURE_DAYS);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const rows = await queryD1Rows(
    fetcher, endpoint, apiToken, socialAiActressSlaSql(), [clock.date, end], timeout
  );
  const publicPosts = {};
  if (clock.minutes >= PUBLICATION_GATE_MINUTES) {
    const audits = await Promise.all(PLATFORMS.map(async (platform) => {
      const eligible = rowsFor(rows, clock.date, platform, clock.timestamp);
      if (eligible.length === 1) {
        return [platform, await fetchPublicAudit(fetcher, baseUrl, eligible[0].post_id, timeout)];
      }
      return [platform, null];
    }));
    for (const [platform, audit] of audits) {
      if (audit) publicPosts[platform] = audit;
    }
  }
  return evaluateSocialAiActressSla({ rows, publicPosts, now: clock.timestamp });
}

export async function runSocialAiActressSla(options = {}) {
  const attempts = boundedInteger(options.attempts, 3, 1, 5);
  const retryMs = boundedInteger(options.retryMs, 5000, 100, 30000);
  let lastResult;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      lastResult = await inspectSocialAiActressSla(options);
      if (lastResult.status === 'PASS') return lastResult;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  if (lastResult) return lastResult;
  throw lastError;
}

function cliOptions(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    databaseId: process.env.HOSHILU_D1_DATABASE_ID || DEFAULT_DATABASE_ID,
    baseUrl: value('--base-url', process.env.HOSHILU_BASE_URL || DEFAULT_BASE_URL),
    now: value('--now', process.env.HOSHILU_SOCIAL_SLA_NOW || undefined),
    attempts: Number(value('--attempts', process.env.HOSHILU_MONITOR_ATTEMPTS || 3)),
    retryMs: Number(value('--retry-ms', process.env.HOSHILU_MONITOR_RETRY_MS || 5000)),
    requestTimeoutMs: Number(value('--request-timeout-ms', 10000))
  };
}

function summaryFor(result) {
  const platformLines = PLATFORMS.map((platform) => {
    const state = result.today.platforms[platform];
    return `- ${platform}: eligible=${state.eligible_count}, status=${state.status || 'none'}, public=${state.public_verified ? 'verified' : 'not-required-or-unverified'}`;
  });
  const violations = result.violations.length
    ? result.violations.map((value) => `- ${value}`)
    : ['- none'];
  return [
    `## HOSHILU daily AI actress social SLA: ${result.status}`,
    '',
    `Status code: ${result.code}`,
    `Checked: ${result.checked_at} (JST date ${result.jst_date})`,
    `18:00 approval gate: ${result.approval_required ? result.today.approval : 'NOT_DUE'}`,
    `20:30 publication gate: ${result.publication_required ? result.today.publication : 'NOT_DUE'}`,
    ...platformLines,
    `Future inventory: ${result.future.ready}/${result.future.required} ready (${result.future.from} through ${result.future.to})`,
    '',
    'Violations:',
    ...violations,
    ''
  ].join('\n');
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  try {
    const result = await runSocialAiActressSla(options);
    const summary = summaryFor(result);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
    }
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    const summary = `## HOSHILU daily AI actress social SLA: FAIL\n\n- ${message}\n`;
    console.error(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
