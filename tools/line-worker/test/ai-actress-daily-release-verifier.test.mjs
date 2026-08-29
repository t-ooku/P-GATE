import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/verify-ai-actress-daily-release.mjs', import.meta.url));
const expeditedAt = '2000-01-01T00:00:00.000Z';

function queueRow(platform) {
  const source = platform === 'X' ? 'x' : 'instagram';
  return {
    post_id: `hoshilu-ai-actress-daily-v1-${source}-2026-08-29`,
    platform,
    campaign_id: 'hoshilu-ai-actress-daily-v1',
    content_id: 'hoshilu-ai-actress-daily-2026-08-29',
    caption: '今日のバズ、もう見た？気になるランキングから次に欲しいものを見つけよう。※この動画はAI生成・AI加工映像です。 #HOSHILU #AI生成',
    link: `https://hoshilu.app/buzz?utm_source=${source}&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-29`,
    media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
    scheduled_at: expeditedAt,
    status: 'APPROVED',
    external_post_id: '',
    published_at: '',
    creative_asset_id: 'hoshilu_ai_actress_daily_sat_v1',
    content_format: 'REEL',
    creative_policy: 'DAILY_AI_ACTRESS_22',
    jst_publish_date: '2026-08-29',
    ai_generated: 1,
    crosspost_group_id: 'hoshilu-ai-actress-daily-2026-08-29',
    error_code: ''
  };
}

test('緊急投稿だけ明示された即時時刻を検証し、通常枠の検証条件は変えない', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-actress-expedite-'));
  const fixture = join(directory, 'queue.json');
  try {
    writeFileSync(fixture, JSON.stringify([{ results: [queueRow('X'), queueRow('INSTAGRAM')] }]));

    const expedited = spawnSync(process.execPath, [
      script, 'queue', fixture, 'queued', 'expedited-before-regular'
    ], {
      encoding: 'utf8'
    });
    assert.equal(expedited.status, 0, expedited.stderr);
    assert.match(expedited.stdout, /AI_ACTRESS_DAILY_QUEUE_QUEUED_OK/u);

    const normal = spawnSync(process.execPath, [script, 'queue', fixture, 'queued'], {
      encoding: 'utf8'
    });
    assert.notEqual(normal.status, 0);
    assert.match(normal.stderr, /AI_ACTRESS_DAILY_RELEASE_QUEUE_CONTRACT/u);

    const retrying = [queueRow('X'), queueRow('INSTAGRAM')].map((row) => ({
      ...row,
      scheduled_at: '2026-08-29T05:05:00.000Z',
      error_code: 'PUBLISHER_ERROR_REDACTED'
    }));
    writeFileSync(fixture, JSON.stringify([{ results: retrying }]));
    const retry = spawnSync(process.execPath, [
      script, 'queue', fixture, 'queued', 'expedited-before-regular'
    ], { encoding: 'utf8' });
    assert.equal(retry.status, 0, retry.stderr);

    retrying[0].error_code = '';
    writeFileSync(fixture, JSON.stringify([{ results: retrying }]));
    const ambiguous = spawnSync(process.execPath, [
      script, 'queue', fixture, 'queued', 'expedited-before-regular'
    ], { encoding: 'utf8' });
    assert.notEqual(ambiguous.status, 0);
    assert.match(ambiguous.stderr, /AI_ACTRESS_DAILY_RELEASE_QUEUE_CONTRACT/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('土曜日の自動生成済み本文でも即時公開の契約を満たす', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-actress-expedite-saturday-'));
  const fixture = join(directory, 'queue.json');
  try {
    const rows = [queueRow('X'), queueRow('INSTAGRAM')].map((row) => ({
      ...row,
      caption: row.platform === 'X'
        ? '土曜日も「今日のバズ」をチェック。HOSHILU BUZZのランキングから気になる商品を見にいこう。 ※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #AI生成'
        : '土曜日も「今日のバズ」をチェック。HOSHILU BUZZのランキングから気になる商品を見にいこう。 ※この動画はAI生成・AI加工映像です。 気になった商品をコメントで教えてね。 #HOSHILU #Qoo10 #SHEIN #購入品紹介 #AI生成'
    }));
    writeFileSync(fixture, JSON.stringify([{ results: rows }]));

    const result = spawnSync(process.execPath, [
      script, 'queue', fixture, 'queued', 'expedited-before-regular'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /AI_ACTRESS_DAILY_QUEUE_QUEUED_OK/u);

    rows[0].caption += ' 改変';
    writeFileSync(fixture, JSON.stringify([{ results: rows }]));
    const tampered = spawnSync(process.execPath, [
      script, 'queue', fixture, 'queued', 'expedited-before-regular'
    ], { encoding: 'utf8' });
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /AI_ACTRESS_DAILY_RELEASE_QUEUE_CONTRACT/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
