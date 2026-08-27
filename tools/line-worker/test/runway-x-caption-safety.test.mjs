import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSocialPost, xWeightedLength } from '../src/social-publisher.mjs';

const jobs = [
  'reel_job_20260819_name_forgotten_v1.sql',
  'reel_job_20260819_overseas_find_v2.sql'
];

test('削除後に再利用する2本のX文面は誤メンションと旧タグを含まない', async () => {
  for (const job of jobs) {
    const sql = await readFile(new URL(`../ops/runway/${job}`, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /@hoshilu\.app/iu, `${job}: Instagram用メンションが残っている`);
    assert.doesNotMatch(sql, /#ホシル|#あいまい検索|#13モール横断|#ほしっとく/u, `${job}: 旧タグが残っている`);
    assert.match(sql, /#Qoo10/u, `${job}: Qoo10検索タグがない`);
    assert.match(sql, /#SHEIN/u, `${job}: SHEIN検索タグがない`);

    const caption = sql.match(/\n  '([^'\n]+)',\n  'https:\/\/hoshilu\.app\/\?utm_source=instagram/u)?.[1];
    assert.ok(caption, `${job}: captionを抽出できない`);
    const post = normalizeSocialPost({
      platform: 'X', caption,
      link: 'https://hoshilu.app/?utm_source=instagram&utm_medium=organic_social',
      status: 'APPROVED'
    });
    assert.ok(xWeightedLength(post.caption) + 1 + 23 <= 280, `${job}: Xの280上限を超える`);
    assert.equal(new URL(post.link).searchParams.get('utm_source'), 'x');
  }
});
