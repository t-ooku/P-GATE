import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const jobStart = workflow.indexOf('  catchup-ai-actress-daily-reel-20260828:');
const catchupJob = workflow.slice(jobStart);
const verifier = new URL('../scripts/verify-ai-actress-daily-catchup.mjs', import.meta.url);

function catchupSql() {
  const match = /cat > ai-actress-catchup-insert\.sql <<'SQL'\n([\s\S]*?)\n\s+SQL/u.exec(catchupJob);
  assert.ok(match, 'catch-up SQL heredoc is missing');
  const lines = match[1].split('\n');
  const indent = Math.min(...lines.filter(Boolean).map((line) => /^\s*/u.exec(line)[0].length));
  return lines.map((line) => line.slice(indent)).join('\n');
}

function databaseWithPolicy() {
  const database = new DatabaseSync(':memory:');
  for (const migration of [
    '../migrations/0006_social_post_queue.sql',
    '../migrations/0014_social_platform_job.sql',
    '../migrations/0052_social_post_queue_threads.sql',
    '../migrations/0061_social_ai_actress_daily.sql'
  ]) {
    database.exec(readFileSync(new URL(migration, import.meta.url), 'utf8'));
  }
  return database;
}

function d1File(directory, name, results) {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify([{ results }]));
  return path;
}

test('8月28日補完jobは本番素材・権利証跡・専用marker・公開URLを固定する', () => {
  assert.notEqual(jobStart, -1);
  assert.match(catchupJob, /needs: \[test, deploy\]/u);
  assert.match(catchupJob, /\[catchup-ai-actress-daily-20260828\]/u);
  assert.match(catchupJob, /group: hoshilu-social-release/u);
  assert.match(catchupJob, /d1 time-travel info PRODUCT_DB/u);
  assert.match(catchupJob, /cmp public\/social\/hoshilu-ai-actress-daily-fri-v1\.mp4/u);
  assert.match(catchupJob, /2367256ef25f806dc636b61ee2651c302165d62f082060bf5af01f1243e3fbf6/u);
  assert.match(catchupJob, /persona_age=22/u);
  assert.match(catchupJob, /audio_confirmed=1/u);
  assert.match(catchupJob, /rights_confirmed=1/u);
  assert.match(catchupJob, /qa_status='PASSED'/u);
  assert.match(catchupJob, /ai_disclosure_confirmed=1/u);
  assert.match(catchupJob, /api\/social\/posts\/hoshilu-ai-actress-daily-v1-x-2026-08-28/u);
  assert.match(catchupJob, /api\/social\/posts\/hoshilu-ai-actress-daily-v1-instagram-2026-08-28/u);
  assert.match(catchupJob, /platform_job_id: row\.platform_job_id \? 'PRESENT_REDACTED' : ''/u);
  assert.match(catchupJob, /last_error: row\.last_error \? 'PUBLISHER_ERROR_REDACTED' : ''/u);
  const artifactStep = catchupJob.slice(catchupJob.indexOf('- uses: actions/upload-artifact@v4'));
  assert.doesNotMatch(artifactStep, /ai-actress-catchup-private-before/u);
});

test('補完SQLは正規2行だけを原子的かつ冪等に追加し旧8月28日投稿を保持する', () => {
  const sql = catchupSql();
  assert.equal((sql.match(/\bINSERT\s+INTO\s+social_post_queue\b/giu) || []).length, 1);
  assert.equal((sql.match(/\bUPDATE\s+social_post_queue\b/giu) || []).length, 1);
  assert.doesNotMatch(sql, /\b(?:DELETE|DROP|ALTER|TRUNCATE|REPLACE)\b/iu);
  assert.match(sql, /ON CONFLICT\(post_id\) DO NOTHING/u);
  assert.match(sql, /q\.post_id NOT IN/u);

  const database = databaseWithPolicy();
  try {
    database.prepare(`INSERT INTO social_post_queue
      (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,
       status,affiliate,external_post_id,published_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'hoshilu-official-13mall-v2-x-2026-08-28', 'X', 'hoshilu-official-13mall-v2',
      'buzz-video-campus_and_oshikatsu', '旧投稿', 'https://hoshilu.app/',
      'https://hoshilu.app/social/hoshilu-feature-reel-13mall-v1.mp4',
      '2026-08-28T11:00:00.000Z', 'PUBLISHED', 0, '2093536068205261285',
      '2026-08-28T11:01:00.000Z', '2026-08-28T00:00:00.000Z',
      '2026-08-28T11:01:00.000Z'
    );
    database.exec(sql);
    database.exec(sql);

    const rows = database.prepare(`SELECT post_id,platform,caption,link,scheduled_at,status,
      creative_asset_id,creative_policy,jst_publish_date,crosspost_group_id
      FROM social_post_queue WHERE jst_publish_date='2026-08-28'
      ORDER BY platform`).all();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.post_id).sort(), [
      'hoshilu-ai-actress-daily-v1-instagram-2026-08-28',
      'hoshilu-ai-actress-daily-v1-x-2026-08-28'
    ]);
    assert.equal(rows.every((row) => row.scheduled_at === '2000-01-01T00:00:00.000Z'), true);
    assert.equal(rows.every((row) => row.status === 'APPROVED'), true);
    assert.equal(rows.every((row) => row.creative_asset_id === 'hoshilu_ai_actress_daily_fri_v1'), true);
    assert.equal(rows.every((row) => row.creative_policy === 'DAILY_AI_ACTRESS_22'), true);
    assert.equal(rows.every((row) => row.crosspost_group_id === 'hoshilu-ai-actress-daily-2026-08-28'), true);
    const old = database.prepare(`SELECT status,external_post_id FROM social_post_queue
      WHERE post_id='hoshilu-official-13mall-v2-x-2026-08-28'`).get();
    assert.deepEqual({ ...old }, { status: 'PUBLISHED', external_post_id: '2093536068205261285' });
  } finally {
    database.close();
  }
});

test('補完SQLは競合するdaily行または不一致素材があれば新規公開行を作らない', () => {
  for (const mode of ['conflict', 'asset']) {
    const database = databaseWithPolicy();
    try {
      if (mode === 'conflict') {
        database.prepare(`INSERT INTO social_post_queue
          (post_id,platform,campaign_id,content_id,caption,link,media_url,scheduled_at,
           status,affiliate,created_at,updated_at,creative_policy,jst_publish_date)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          'conflicting-daily-row', 'TIKTOK', 'hoshilu-ai-actress-daily-v1', 'conflict',
          'conflict', '', '', '2026-08-28T00:00:00.000Z', 'REVIEW_REQUIRED', 0,
          '2026-08-28T00:00:00.000Z', '2026-08-28T00:00:00.000Z',
          'DAILY_AI_ACTRESS_22', '2026-08-28'
        );
      } else {
        database.prepare(`UPDATE social_creative_assets SET media_sha256=?1
          WHERE asset_id='hoshilu_ai_actress_daily_fri_v1'`).run('0'.repeat(64));
      }
      database.exec(catchupSql());
      const count = database.prepare(`SELECT COUNT(*) AS count FROM social_post_queue
        WHERE post_id IN ('hoshilu-ai-actress-daily-v1-x-2026-08-28',
          'hoshilu-ai-actress-daily-v1-instagram-2026-08-28')`).get().count;
      assert.equal(Number(count), 0, mode);
    } finally {
      database.close();
    }
  }
});

test('補完preflightは正規素材と空キューを許可し競合・曖昧retryを拒否する', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-actress-catchup-'));
  const database = databaseWithPolicy();
  try {
    const asset = database.prepare(`SELECT asset_id,media_url,media_sha256,content_format,
      creative_policy,jst_publish_date,persona_id,persona_age,ai_actress_present,
      audio_confirmed,rights_confirmed,rights_ledger_id,qa_status,ai_generated,
      ai_disclosure_confirmed,approved_at FROM social_creative_assets
      WHERE asset_id='hoshilu_ai_actress_daily_fri_v1'`).get();
    const assetPath = d1File(directory, 'asset.json', [{ ...asset }]);
    const emptyPath = d1File(directory, 'empty.json', []);
    const valid = spawnSync(process.execPath, [verifier.pathname, 'preflight', assetPath, emptyPath], {
      encoding: 'utf8'
    });
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /PREFLIGHT_OK existing=0/u);

    const conflictPath = d1File(directory, 'conflict.json', [{
      post_id: 'unexpected', platform: 'X', status: 'APPROVED', last_error: '',
      platform_job_id: '', external_post_id: '', published_at: ''
    }]);
    const conflict = spawnSync(process.execPath,
      [verifier.pathname, 'preflight', assetPath, conflictPath], { encoding: 'utf8' });
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /EXISTING_ROW_CONFLICT/u);

    const malformedRetryPath = d1File(directory, 'malformed-retry.json', [{
      post_id: 'hoshilu-ai-actress-daily-v1-x-2026-08-28', platform: 'X',
      campaign_id: 'hoshilu-ai-actress-daily-v1',
      content_id: 'hoshilu-ai-actress-daily-2026-08-28',
      caption: '金曜日のHOSHILU BUZZをチェック。気になるランキングから、週末に欲しい商品を探そう。 ※この動画はAI生成・AI加工映像です。 #Qoo10 #SHEIN #AI生成',
      link: 'https://hoshilu.app/buzz?utm_source=x&utm_medium=social&utm_campaign=hoshilu-ai-actress-daily-v1&utm_content=hoshilu-ai-actress-daily-2026-08-28',
      media_url: 'https://hoshilu.app/social/hoshilu-ai-actress-daily-fri-v1.mp4',
      scheduled_at: '2026-08-29T06:00:00.000Z', status: 'APPROVED',
      external_post_id: '', platform_job_id: '', published_at: '',
      creative_asset_id: 'hoshilu_ai_actress_daily_fri_v1', content_format: 'REEL',
      creative_policy: 'DAILY_AI_ACTRESS_22', jst_publish_date: '2026-08-28',
      ai_generated: 1, crosspost_group_id: 'hoshilu-ai-actress-daily-2026-08-28',
      last_error: 'X_PUBLISH_4290'
    }]);
    const malformed = spawnSync(process.execPath,
      [verifier.pathname, 'preflight', assetPath, malformedRetryPath], { encoding: 'utf8' });
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /EXISTING_ROW_CONFLICT/u);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('補完queue/public検証は完全一致だけを許可し別Tweet URLやok=falseを拒否する', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-actress-catchup-public-'));
  const database = databaseWithPolicy();
  try {
    database.exec(catchupSql());
    database.prepare(`UPDATE social_post_queue SET status='PUBLISHED',external_post_id=?1,
      published_at='2026-08-29T06:00:00.000Z',last_error='',platform_job_id=''
      WHERE post_id='hoshilu-ai-actress-daily-v1-x-2026-08-28'`).run('2093600000000000001');
    database.prepare(`UPDATE social_post_queue SET status='PUBLISHED',external_post_id=?1,
      published_at='2026-08-29T06:01:00.000Z',last_error='',platform_job_id=''
      WHERE post_id='hoshilu-ai-actress-daily-v1-instagram-2026-08-28'`).run('17905000000000001');
    const queueRows = database.prepare(`SELECT post_id,platform,campaign_id,content_id,caption,
      link,media_url,scheduled_at,status,external_post_id,published_at,creative_asset_id,
      content_format,creative_policy,jst_publish_date,ai_generated,crosspost_group_id,
      '' AS error_code FROM social_post_queue
      WHERE post_id IN ('hoshilu-ai-actress-daily-v1-x-2026-08-28',
        'hoshilu-ai-actress-daily-v1-instagram-2026-08-28') ORDER BY platform`).all()
      .map((row) => ({ ...row }));
    const queuePath = d1File(directory, 'queue.json', queueRows);
    const queueOk = spawnSync(process.execPath,
      [verifier.pathname, 'queue', queuePath, 'published'], { encoding: 'utf8' });
    assert.equal(queueOk.status, 0, queueOk.stderr);

    const badQueueRows = structuredClone(queueRows);
    badQueueRows.find((row) => row.platform === 'X').caption = '別文面 #AI生成';
    const badQueuePath = d1File(directory, 'bad-queue.json', badQueueRows);
    const badQueue = spawnSync(process.execPath,
      [verifier.pathname, 'queue', badQueuePath, 'published'], { encoding: 'utf8' });
    assert.notEqual(badQueue.status, 0);
    assert.match(badQueue.stderr, /QUEUE_CONTRACT/u);

    const publicRows = {
      X: {
        ok: true, post_id: 'hoshilu-ai-actress-daily-v1-x-2026-08-28', platform: 'X',
        status: 'PUBLISHED', external_post_id: '2093600000000000001',
        published_at: '2026-08-29T06:00:00.000Z',
        public_url: 'https://x.com/i/web/status/2093600000000000001'
      },
      INSTAGRAM: {
        ok: true, post_id: 'hoshilu-ai-actress-daily-v1-instagram-2026-08-28',
        platform: 'INSTAGRAM', status: 'PUBLISHED', external_post_id: '17905000000000001',
        published_at: '2026-08-29T06:01:00.000Z',
        public_url: 'https://www.instagram.com/reel/Dcatchup28/'
      }
    };
    const xPath = join(directory, 'x.json');
    const instagramPath = join(directory, 'instagram.json');
    writeFileSync(xPath, JSON.stringify(publicRows.X));
    writeFileSync(instagramPath, JSON.stringify(publicRows.INSTAGRAM));
    const publicOk = spawnSync(process.execPath,
      [verifier.pathname, 'public', xPath, instagramPath, queuePath], { encoding: 'utf8' });
    assert.equal(publicOk.status, 0, publicOk.stderr);

    writeFileSync(xPath, JSON.stringify({
      ...publicRows.X, public_url: 'https://x.com/i/web/status/2093600000000000999'
    }));
    const wrongTweet = spawnSync(process.execPath,
      [verifier.pathname, 'public', xPath, instagramPath, queuePath], { encoding: 'utf8' });
    assert.notEqual(wrongTweet.status, 0);
    assert.match(wrongTweet.stderr, /PUBLIC_CONTRACT/u);

    writeFileSync(xPath, JSON.stringify({ ...publicRows.X, ok: false }));
    const notOk = spawnSync(process.execPath,
      [verifier.pathname, 'public', xPath, instagramPath, queuePath], { encoding: 'utf8' });
    assert.notEqual(notOk.status, 0);
    assert.match(notOk.stderr, /PUBLIC_CONTRACT/u);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
