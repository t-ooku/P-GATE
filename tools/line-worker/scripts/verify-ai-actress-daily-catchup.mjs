#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const CAMPAIGN_ID = 'hoshilu-ai-actress-daily-v1';
const CREATIVE_ASSET_ID = 'hoshilu_ai_actress_daily_fri_v1';
const CROSSPOST_GROUP = 'hoshilu-ai-actress-daily-2026-08-28';
const MEDIA_URL = 'https://hoshilu.app/social/hoshilu-ai-actress-daily-fri-v1.mp4';
const MEDIA_SHA256 = '2367256ef25f806dc636b61ee2651c302165d62f082060bf5af01f1243e3fbf6';
const POLICY = 'DAILY_AI_ACTRESS_22';
const PUBLISH_DATE = '2026-08-28';
const ASSET_INVENTORY_DATE = '2026-09-04';
const EXPEDITED_AT = '2000-01-01T00:00:00.000Z';
const POSTS = Object.freeze({
  X: 'hoshilu-ai-actress-daily-v1-x-2026-08-28',
  INSTAGRAM: 'hoshilu-ai-actress-daily-v1-instagram-2026-08-28'
});
const CAPTIONS = Object.freeze({
  X: '金曜日のHOSHILU BUZZをチェック。気になるランキングから、週末に欲しい商品を探そう。 ※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #AI生成',
  INSTAGRAM: '金曜日のHOSHILU BUZZをチェック。気になるランキングから、週末に欲しい商品を探そう。 ※この動画はAI生成・AI加工映像です。 気になった商品をコメントで教えてね。 #HOSHILU #Qoo10 #SHEIN #購入品紹介 #AI生成'
});
const LINKS = Object.freeze({
  X: 'https://hoshilu.app/buzz?utm_source=x&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-28',
  INSTAGRAM: 'https://hoshilu.app/buzz?utm_source=instagram&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-28'
});

function fail(code, detail = '') {
  const suffix = detail ? `: ${detail}` : '';
  console.error(`AI_ACTRESS_DAILY_CATCHUP_${code}${suffix}`);
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

function validAsset(row) {
  return row?.asset_id === CREATIVE_ASSET_ID
    && row.media_url === MEDIA_URL
    && row.media_sha256 === MEDIA_SHA256
    && row.content_format === 'REEL'
    && row.creative_policy === POLICY
    && row.jst_publish_date === ASSET_INVENTORY_DATE
    && row.persona_id === 'hoshilu-approved-model-reference-v2'
    && Number(row.persona_age) === 22
    && Number(row.ai_actress_present) === 1
    && Number(row.audio_confirmed) === 1
    && Number(row.rights_confirmed) === 1
    && row.rights_ledger_id === CREATIVE_ASSET_ID
    && row.qa_status === 'PASSED'
    && Number(row.ai_generated) === 1
    && Number(row.ai_disclosure_confirmed) === 1
    && Number.isFinite(Date.parse(String(row.approved_at || '')));
}

function validContract(row) {
  return POSTS[row.platform] === row.post_id
    && row.campaign_id === CAMPAIGN_ID
    && row.content_id === CROSSPOST_GROUP
    && row.caption === CAPTIONS[row.platform]
    && row.link === LINKS[row.platform]
    && row.media_url === MEDIA_URL
    && row.creative_asset_id === CREATIVE_ASSET_ID
    && row.content_format === 'REEL'
    && row.creative_policy === POLICY
    && row.jst_publish_date === PUBLISH_DATE
    && Number(row.ai_generated) === 1
    && row.crosspost_group_id === CROSSPOST_GROUP
    && Number.isFinite(Date.parse(String(row.scheduled_at || '')));
}

function isSafeTransient(row) {
  const error = String(row.last_error || '');
  const job = nonEmpty(row.platform_job_id);
  if (!error) return !job;
  if (row.platform === 'INSTAGRAM') {
    if (['INSTAGRAM_CONTAINER_IN_PROGRESS', 'INSTAGRAM_CONTAINER_TIMEOUT'].includes(error)) return job;
    if (error === 'INSTAGRAM_CONTAINER_EXPIRED') return !job;
    if (/^Too many subrequests by single Worker invocation\./u.test(error)) return true;
    if (/^INSTAGRAM_PUBLISH_429(?:_|$)/u.test(error)) return job;
    if (/^INSTAGRAM_CREATE_(?:408|425|429|5\d\d)(?:_|$)/u.test(error)) return !job;
    if (/^INSTAGRAM_STATUS_(?:408|425|429|5\d\d)(?:_|$)/u.test(error)) return job;
    return false;
  }
  if (row.platform !== 'X' || job) return false;
  if (['X_MEDIA_ASSET_FETCH_FAILED', 'X_MEDIA_PROCESSING_TIMEOUT'].includes(error)) return true;
  if (/^X_PUBLISH_429(?:_|$)/u.test(error)) return true;
  return /^(?:X_MEDIA_FETCH|X_MEDIA_INIT|X_MEDIA_APPEND|X_MEDIA_FINALIZE|X_MEDIA_STATUS)_(?:408|425|429|5\d\d)(?:_|$)/u.test(error);
}

function validExistingState(row) {
  if (row.status === 'PUBLISHED') {
    return /^\d+$/u.test(String(row.external_post_id || ''))
      && Number.isFinite(Date.parse(String(row.published_at || '')))
      && !nonEmpty(row.last_error)
      && !nonEmpty(row.platform_job_id);
  }
  if (!['APPROVED', 'PUBLISHING'].includes(row.status)
    || nonEmpty(row.external_post_id) || nonEmpty(row.published_at)) return false;
  if (row.status === 'PUBLISHING' && row.platform === 'INSTAGRAM' && !row.last_error) return true;
  return isSafeTransient(row);
}

function verifyPreflight(assetPath, beforePath) {
  const assets = d1Rows(assetPath);
  if (assets.length !== 1 || !validAsset(assets[0])) fail('ASSET_CONTRACT');

  const rows = d1Rows(beforePath);
  if (rows.length > 2) fail('EXISTING_ROW_COUNT', String(rows.length));
  const platforms = new Set();
  for (const row of rows) {
    if (!validContract(row) || platforms.has(row.platform) || !validExistingState(row)) {
      fail('EXISTING_ROW_CONFLICT', `${String(row.platform || 'UNKNOWN')}:${String(row.status || 'UNKNOWN')}`);
    }
    platforms.add(row.platform);
  }
  console.log(`AI_ACTRESS_DAILY_CATCHUP_PREFLIGHT_OK existing=${rows.length}`);
}

function verifyQueue(path, phase) {
  const rows = d1Rows(path);
  if (rows.length !== 2) fail('QUEUE_ROW_COUNT', String(rows.length));
  const platforms = new Set(Object.keys(POSTS));
  for (const row of rows) {
    if (!platforms.delete(row.platform) || !validContract(row)) {
      fail('QUEUE_CONTRACT', String(row.platform || 'UNKNOWN'));
    }
    if (phase === 'queued') {
      if (!['APPROVED', 'PUBLISHING', 'PUBLISHED'].includes(row.status)) {
        fail('QUEUE_NOT_RELEASED', `${row.platform}:${row.status}`);
      }
      if (row.status === 'APPROVED' && !row.error_code && row.scheduled_at !== EXPEDITED_AT) {
        fail('QUEUE_NOT_EXPEDITED', row.platform);
      }
      if (row.status !== 'PUBLISHED'
        && (nonEmpty(row.external_post_id) || nonEmpty(row.published_at))) {
        fail('QUEUE_AMBIGUOUS_PUBLICATION', row.platform);
      }
      if (nonEmpty(row.error_code) && row.error_code !== 'TRANSIENT_RETRY_REDACTED') {
        fail('QUEUE_ERROR', row.platform);
      }
    } else if (phase === 'published') {
      if (row.status !== 'PUBLISHED'
        || !/^\d+$/u.test(String(row.external_post_id || ''))
        || !Number.isFinite(Date.parse(String(row.published_at || '')))
        || nonEmpty(row.error_code)) {
        fail('QUEUE_NOT_PUBLISHED', `${row.platform}:${row.status}`);
      }
    } else {
      fail('QUEUE_PHASE', phase);
    }
  }
  if (platforms.size) fail('QUEUE_PLATFORM_MISSING', [...platforms].join(','));
  console.log(`AI_ACTRESS_DAILY_CATCHUP_QUEUE_${phase.toUpperCase()}_OK`);
}

function verifyPublic(xPath, instagramPath, queuePath) {
  const publicRows = [readJson(xPath), readJson(instagramPath)];
  const queue = new Map(d1Rows(queuePath).map((row) => [row.platform, row]));
  const platforms = new Set(Object.keys(POSTS));
  const urls = {
    X: /^https:\/\/x\.com\/i\/web\/status\/\d+$/u,
    INSTAGRAM: /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/u
  };
  for (const row of publicRows) {
    const queued = queue.get(row.platform);
    const publicUrl = String(row.public_url || '');
    const xUrlId = row.platform === 'X'
      ? /^https:\/\/x\.com\/i\/web\/status\/(\d+)$/u.exec(publicUrl)?.[1] || ''
      : '';
    if (!platforms.delete(row.platform)
      || row.ok !== true
      || row.post_id !== POSTS[row.platform]
      || row.status !== 'PUBLISHED'
      || !urls[row.platform]?.test(publicUrl)
      || !queued
      || row.external_post_id !== queued.external_post_id
      || row.published_at !== queued.published_at
      || (row.platform === 'X' && xUrlId !== String(row.external_post_id || ''))) {
      fail('PUBLIC_CONTRACT', String(row.platform || 'UNKNOWN'));
    }
  }
  if (platforms.size) fail('PUBLIC_PLATFORM_MISSING', [...platforms].join(','));
  console.log('AI_ACTRESS_DAILY_CATCHUP_PUBLIC_OK');
}

const [command, ...args] = process.argv.slice(2);
if (command === 'preflight' && args.length === 2) {
  verifyPreflight(args[0], args[1]);
} else if (command === 'queue' && args.length === 2) {
  verifyQueue(args[0], args[1]);
} else if (command === 'public' && args.length === 3) {
  verifyPublic(args[0], args[1], args[2]);
} else {
  fail('USAGE', 'preflight <asset.json> <before.json> | queue <d1.json> <queued|published> | public <x.json> <instagram.json> <queue.json>');
}
