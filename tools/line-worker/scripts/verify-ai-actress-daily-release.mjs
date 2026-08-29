#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const MIGRATION_NAME = '0061_social_ai_actress_daily.sql';
const CAMPAIGN_ID = 'hoshilu-ai-actress-daily-v1';
const CREATIVE_ASSET_ID = 'hoshilu_ai_actress_daily_sat_v1';
const CROSSPOST_GROUP = 'hoshilu-ai-actress-daily-2026-08-29';
const MEDIA_URL = 'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4';
const POLICY = 'DAILY_AI_ACTRESS_22';
const PUBLISH_DATE = '2026-08-29';
const SCHEDULED_AT = '2026-08-29T11:15:00.000Z';
const EXPEDITED_AT = '2000-01-01T00:00:00.000Z';
const EXPEDITED_SCHEDULE_POLICY = 'expedited-before-regular';
const CAPTION = '今日のバズ、もう見た？気になるランキングから次に欲しいものを見つけよう。※この動画はAI生成・AI加工映像です。 #HOSHILU #AI生成';
const POSTS = Object.freeze({
  X: 'hoshilu-ai-actress-daily-v1-x-2026-08-29',
  INSTAGRAM: 'hoshilu-ai-actress-daily-v1-instagram-2026-08-29'
});
const LINKS = Object.freeze({
  X: 'https://hoshilu.app/buzz?utm_source=x&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-29',
  INSTAGRAM: 'https://hoshilu.app/buzz?utm_source=instagram&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-29'
});

function fail(code, detail = '') {
  const suffix = detail ? `: ${detail}` : '';
  console.error(`AI_ACTRESS_DAILY_RELEASE_${code}${suffix}`);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('INVALID_JSON', basename(path));
  }
}

function d1Rows(path) {
  const data = readJson(path);
  const envelopes = Array.isArray(data) ? data : [data];
  return envelopes.flatMap((entry) => entry?.results || entry?.result?.results || []);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validQueueSchedule(row, expectedScheduledAt, phase) {
  if (expectedScheduledAt !== EXPEDITED_SCHEDULE_POLICY) {
    return row.scheduled_at === expectedScheduledAt;
  }
  const scheduled = Date.parse(row.scheduled_at);
  const expedited = Date.parse(EXPEDITED_AT);
  const regular = Date.parse(SCHEDULED_AT);
  if (!Number.isFinite(scheduled) || scheduled < expedited || scheduled >= regular) return false;
  if (phase === 'queued' && row.status === 'APPROVED' && !nonEmpty(row.error_code)) {
    return row.scheduled_at === EXPEDITED_AT;
  }
  return true;
}

function executableSql(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*--.*$/gmu, '');
}

function queueSeedStatement(sql) {
  const executable = executableSql(sql);
  const match = /\bINSERT\s+OR\s+IGNORE\s+INTO\s+social_post_queue\b/iu.exec(executable);
  if (!match) fail('MIGRATION_QUEUE_INSERT_MISSING');
  const start = match.index;
  let quoted = false;
  for (let index = start; index < executable.length; index += 1) {
    if (executable[index] === "'") {
      if (quoted && executable[index + 1] === "'") {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (executable[index] === ';' && !quoted) {
      return executable.slice(start, index + 1).trim();
    }
  }
  fail('MIGRATION_QUEUE_INSERT_UNTERMINATED');
}

function verifyMigration(path, expectedSha256 = '') {
  if (basename(path) !== MIGRATION_NAME) fail('MIGRATION_NAME', basename(path));
  const bytes = readFileSync(path);
  const sql = bytes.toString('utf8');
  const executable = executableSql(sql);
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    fail('MIGRATION_SHA256', `${actualSha256} != ${expectedSha256}`);
  }

  const required = [
    'social_creative_assets', 'social_post_queue',
    'creative_asset_id', 'content_format', 'creative_policy', 'jst_publish_date', 'ai_generated',
    'crosspost_group_id',
    CAMPAIGN_ID, CREATIVE_ASSET_ID, CROSSPOST_GROUP, MEDIA_URL, POLICY, PUBLISH_DATE,
    POSTS.X, POSTS.INSTAGRAM, 'REEL', 'APPROVED'
  ];
  const missing = required.filter((value) => !executable.includes(value));
  if (missing.length) fail('MIGRATION_CONTRACT_MISSING', missing.join(','));

  if (/\b(?:DELETE|DROP|TRUNCATE)\b/iu.test(executable)
    || /\bUPDATE\s+social_post_queue\b/iu.test(executable)
    || /\bREPLACE\s+INTO\b/iu.test(executable)) {
    fail('MIGRATION_DESTRUCTIVE_SQL');
  }
  const queueInserts = executable.match(/\bINSERT\s+OR\s+IGNORE\s+INTO\s+social_post_queue\b/giu) || [];
  if (queueInserts.length !== 1) fail('MIGRATION_QUEUE_INSERT_COUNT', String(queueInserts.length));
  console.log(`AI_ACTRESS_DAILY_MIGRATION_OK sha256=${actualSha256}`);
}

function verifyMedia(path, probePath, expectedSha256) {
  const bytes = readFileSync(path);
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256) || actualSha256 !== expectedSha256) {
    fail('MEDIA_SHA256', `${actualSha256} != ${expectedSha256}`);
  }
  if (bytes.length < 100_000 || bytes.length > 100_000_000) {
    fail('MEDIA_SIZE', String(bytes.length));
  }
  const probe = readJson(probePath);
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe?.format?.duration);
  const invalid = video?.codec_name !== 'h264'
    || Number(video?.width) !== 720
    || Number(video?.height) !== 1280
    || video?.pix_fmt !== 'yuv420p'
    || video?.r_frame_rate !== '30/1'
    || audio?.codec_name !== 'aac'
    || Number(audio?.sample_rate) !== 48_000
    || Number(audio?.channels) !== 2
    || !Number.isFinite(duration)
    || duration < 8.9
    || duration > 9.1;
  if (invalid) fail('MEDIA_CONTRACT', JSON.stringify({ video, audio, duration }));
  console.log(`AI_ACTRESS_DAILY_MEDIA_OK sha256=${actualSha256} bytes=${bytes.length}`);
}

function verifyAsset(path, expectedMediaSha256) {
  const rows = d1Rows(path);
  if (rows.length !== 1) fail('ASSET_ROW_COUNT', String(rows.length));
  const row = rows[0];
  const invalid = row.asset_id !== CREATIVE_ASSET_ID
    || row.media_url !== MEDIA_URL
    || row.media_sha256 !== expectedMediaSha256
    || row.content_format !== 'REEL'
    || row.creative_policy !== POLICY
    || row.jst_publish_date !== PUBLISH_DATE
    || Number(row.ai_generated) !== 1
    || Number(row.rights_confirmed) !== 1
    || Number(row.audio_confirmed) !== 1
    || Number(row.ai_actress_present) !== 1
    || Number(row.persona_age) !== 22
    || row.persona_id !== 'hoshilu-approved-model-reference-v2'
    || row.rights_ledger_id !== CREATIVE_ASSET_ID
    || row.qa_status !== 'PASSED'
    || Number(row.ai_disclosure_confirmed) !== 1
    || !Number.isFinite(Date.parse(row.approved_at));
  if (invalid) fail('ASSET_CONTRACT', JSON.stringify(row));
  console.log('AI_ACTRESS_DAILY_ASSET_OK');
}

function verifyQueue(path, phase, expectedScheduledAt = SCHEDULED_AT) {
  const rows = d1Rows(path);
  const expectedPlatforms = new Set(Object.keys(POSTS));
  if (rows.length !== expectedPlatforms.size) fail('QUEUE_ROW_COUNT', String(rows.length));

  for (const row of rows) {
    const expectedPostId = POSTS[row.platform];
    if (!expectedPostId || row.post_id !== expectedPostId) {
      fail('QUEUE_IDENTITY', JSON.stringify({ post_id: row.post_id, platform: row.platform }));
    }
    expectedPlatforms.delete(row.platform);
    const invalidContract = row.campaign_id !== CAMPAIGN_ID
      || row.content_id !== CROSSPOST_GROUP
      || row.caption !== CAPTION
      || row.link !== LINKS[row.platform]
      || row.media_url !== MEDIA_URL
      || !validQueueSchedule(row, expectedScheduledAt, phase)
      || row.creative_asset_id !== CREATIVE_ASSET_ID
      || row.content_format !== 'REEL'
      || row.creative_policy !== POLICY
      || row.jst_publish_date !== PUBLISH_DATE
      || Number(row.ai_generated) !== 1
      || row.crosspost_group_id !== CROSSPOST_GROUP;
    if (invalidContract) fail('QUEUE_CONTRACT', JSON.stringify(row));

    if (phase === 'queued') {
      if (!['APPROVED', 'PUBLISHING', 'PUBLISHED'].includes(row.status)) {
        fail('QUEUE_NOT_RELEASED', `${row.platform}:${row.status}`);
      }
      if (row.status !== 'PUBLISHED' && (nonEmpty(row.external_post_id) || nonEmpty(row.published_at))) {
        fail('QUEUE_AMBIGUOUS_PUBLICATION', row.platform);
      }
      const expeditedRetry = expectedScheduledAt === EXPEDITED_SCHEDULE_POLICY
        && row.status === 'APPROVED' && nonEmpty(row.error_code);
      if (row.status !== 'PUBLISHED' && nonEmpty(row.error_code) && !expeditedRetry) {
        fail('QUEUE_ERROR', `${row.platform}:${row.error_code}`);
      }
    } else if (phase === 'published') {
      if (row.status !== 'PUBLISHED' || !nonEmpty(row.external_post_id)
        || !nonEmpty(row.published_at) || nonEmpty(row.error_code)) {
        fail('QUEUE_NOT_PUBLISHED', `${row.platform}:${row.status}`);
      }
      if (!Number.isFinite(Date.parse(row.published_at))) fail('QUEUE_PUBLISHED_AT', row.platform);
      if (!/^\d+$/u.test(row.external_post_id)) fail('QUEUE_EXTERNAL_ID', row.platform);
    } else {
      fail('QUEUE_PHASE', phase);
    }
  }
  if (expectedPlatforms.size) fail('QUEUE_PLATFORM_MISSING', [...expectedPlatforms].join(','));
  console.log(`AI_ACTRESS_DAILY_QUEUE_${phase.toUpperCase()}_OK`);
}

function verifyPublic(xPath, instagramPath, queuePath) {
  const publicRows = [readJson(xPath), readJson(instagramPath)];
  const queueByPlatform = new Map(d1Rows(queuePath).map((row) => [row.platform, row]));
  const expectedPlatforms = new Set(Object.keys(POSTS));
  const expectedUrls = {
    X: /^https:\/\/x\.com\/i\/web\/status\/\d+$/u,
    INSTAGRAM: /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/u
  };
  for (const row of publicRows) {
    const expectedPostId = POSTS[row.platform];
    const queue = queueByPlatform.get(row.platform);
    if (!expectedPlatforms.delete(row.platform)
      || !expectedPostId || row.post_id !== expectedPostId || row.status !== 'PUBLISHED'
      || !expectedUrls[row.platform].test(row.public_url || '')
      || !queue || row.external_post_id !== queue.external_post_id
      || row.published_at !== queue.published_at) {
      fail('PUBLIC_CONTRACT', JSON.stringify({
        post_id: row.post_id, platform: row.platform, status: row.status,
        external_post_id: row.external_post_id, published_at: row.published_at,
        public_url: row.public_url
      }));
    }
  }
  if (expectedPlatforms.size) fail('PUBLIC_PLATFORM_MISSING', [...expectedPlatforms].join(','));
  console.log('AI_ACTRESS_DAILY_PUBLIC_OK');
}

const [command, ...args] = process.argv.slice(2);
if (command === 'migration' && (args.length === 1 || args.length === 2)) {
  verifyMigration(args[0], args[1] || '');
} else if (command === 'seed-sql' && args.length === 1) {
  process.stdout.write(`${queueSeedStatement(readFileSync(args[0], 'utf8'))}\n`);
} else if (command === 'media' && args.length === 3) {
  verifyMedia(args[0], args[1], args[2]);
} else if (command === 'asset' && args.length === 2) {
  verifyAsset(args[0], args[1]);
} else if (command === 'queue' && (args.length === 2 || args.length === 3)) {
  verifyQueue(args[0], args[1], args[2] || SCHEDULED_AT);
} else if (command === 'public' && args.length === 3) {
  verifyPublic(args[0], args[1], args[2]);
} else {
  fail('USAGE', 'migration <sql> [sha256] | seed-sql <sql> | media <mp4> <ffprobe.json> <sha256> | asset <d1.json> <media-sha256> | queue <d1.json> <queued|published> [expected-scheduled-at] | public <x.json> <instagram.json> <queue.json>');
}
