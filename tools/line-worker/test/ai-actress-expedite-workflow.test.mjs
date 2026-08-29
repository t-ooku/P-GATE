import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

function resumeSql() {
  const match = /cat > ai-actress-expedite-resume\.sql <<'SQL'\n([\s\S]*?)\n\s+SQL/u.exec(workflow);
  assert.ok(match, 'resume SQL heredoc is missing');
  const lines = match[1].split('\n');
  const indent = Math.min(...lines.filter(Boolean).map(line => /^\s*/u.exec(line)[0].length));
  return lines.map(line => line.slice(indent)).join('\n');
}

test('8月29日緊急再開は正確な未公開2行と既知の一時障害だけを再即時化する', () => {
  const sql = resumeSql();
  assert.equal((sql.match(/\bUPDATE\s+social_post_queue\b/giu) || []).length, 1);
  assert.doesNotMatch(sql, /\b(?:DELETE|INSERT|REPLACE|DROP|ALTER|TRUNCATE)\b/iu);
  assert.match(sql, /creative_policy='DAILY_AI_ACTRESS_22'/u);
  assert.match(sql, /INSTAGRAM_CONTAINER_IN_PROGRESS/u);
  assert.match(sql, /X_MEDIA_PROCESSING_TIMEOUT/u);
  assert.doesNotMatch(sql.slice(0, sql.indexOf('WHERE')), /last_error\s*=/u);

  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE social_post_queue (
      post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, campaign_id TEXT NOT NULL,
      content_id TEXT NOT NULL, media_url TEXT NOT NULL, scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL, external_post_id TEXT NOT NULL DEFAULT '',
      platform_job_id TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
      creative_asset_id TEXT NOT NULL, content_format TEXT NOT NULL,
      creative_policy TEXT NOT NULL, jst_publish_date TEXT NOT NULL,
      ai_generated INTEGER NOT NULL, crosspost_group_id TEXT NOT NULL,
      approved_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    )`);
    const insert = database.prepare(`INSERT INTO social_post_queue
      (post_id,platform,campaign_id,content_id,media_url,scheduled_at,status,
       platform_job_id,creative_asset_id,content_format,creative_policy,jst_publish_date,
       ai_generated,crosspost_group_id,last_error)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const fixed = [
      'hoshilu-ai-actress-daily-v1',
      'hoshilu-ai-actress-daily-2026-08-29',
      'https://hoshilu.app/social/hoshilu-ai-actress-daily-sat-v1.mp4',
      '2026-08-29T11:15:00.000Z',
      'APPROVED',
      'hoshilu_ai_actress_daily_sat_v1',
      'REEL', 'DAILY_AI_ACTRESS_22', '2026-08-29', 1,
      'hoshilu-ai-actress-daily-2026-08-29'
    ];
    insert.run('hoshilu-ai-actress-daily-v1-x-2026-08-29', 'X',
      fixed[0], fixed[1], fixed[2], fixed[3], fixed[4], '',
      fixed[5], fixed[6], fixed[7], fixed[8], fixed[9], fixed[10], '');
    insert.run('hoshilu-ai-actress-daily-v1-instagram-2026-08-29', 'INSTAGRAM',
      fixed[0], fixed[1], fixed[2], fixed[3], fixed[4], 'saved-container',
      fixed[5], fixed[6], fixed[7], fixed[8], fixed[9], fixed[10],
      'INSTAGRAM_CONTAINER_IN_PROGRESS');
    insert.run('unrelated-post', 'X', 'unrelated', 'unrelated', fixed[2], fixed[3],
      fixed[4], '', fixed[5], fixed[6], fixed[7], fixed[8], fixed[9], fixed[10], '');

    const result = database.exec(sql);
    assert.equal(result, undefined);
    const rows = database.prepare(`SELECT post_id,scheduled_at,last_error,platform_job_id
      FROM social_post_queue ORDER BY post_id`).all();
    const expedited = rows.filter(row => row.post_id !== 'unrelated-post');
    assert.equal(expedited.every(row => row.scheduled_at === '2000-01-01T00:00:00.000Z'), true);
    const instagram = expedited.find(row => row.post_id.includes('instagram'));
    assert.equal(instagram.last_error, 'INSTAGRAM_CONTAINER_IN_PROGRESS');
    assert.equal(instagram.platform_job_id, 'saved-container');
    assert.equal(rows.find(row => row.post_id === 'unrelated-post').scheduled_at, fixed[3]);
  } finally {
    database.close();
  }
});
