import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildSocialAutopilotPosts } from '../src/social-autopilot.mjs';

const script = fileURLToPath(new URL('../scripts/verify-ai-actress-daily-release.mjs', import.meta.url));
const expeditedAt = '2000-01-01T00:00:00.000Z';

function queueRow(platform) {
  const generated = buildSocialAutopilotPosts(new Date('2026-08-28T15:00:00.000Z'))
    .find((post) => post.platform === platform
      && post.content_id === 'hoshilu-ai-actress-daily-2026-08-29');
  assert.ok(generated, `autopilot row missing for ${platform}`);
  return {
    ...generated,
    scheduled_at: expeditedAt,
    external_post_id: '',
    published_at: '',
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

    const migrationRows = [queueRow('X'), queueRow('INSTAGRAM')].map((row) => ({
      ...row,
      caption: '今日のバズ、もう見た？気になるランキングから次に欲しいものを見つけよう。※この動画はAI生成・AI加工映像です。 #HOSHILU #AI生成'
    }));
    writeFileSync(fixture, JSON.stringify([{ results: migrationRows }]));
    const migration = spawnSync(process.execPath, [
      script, 'queue', fixture, 'queued', 'expedited-before-regular'
    ], { encoding: 'utf8' });
    assert.equal(migration.status, 0, migration.stderr);

    migrationRows[0].caption = '未承認の別文面 ※この動画はAI生成・AI加工映像です。 #AI生成';
    writeFileSync(fixture, JSON.stringify([{ results: migrationRows }]));
    const unapprovedCaption = spawnSync(process.execPath, [
      script, 'queue', fixture, 'queued', 'expedited-before-regular'
    ], { encoding: 'utf8' });
    assert.notEqual(unapprovedCaption.status, 0);
    assert.match(unapprovedCaption.stderr, /AI_ACTRESS_DAILY_RELEASE_QUEUE_CONTRACT/u);

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
