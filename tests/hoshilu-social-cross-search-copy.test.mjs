import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packUrl = new URL('../marketing/social/HOSHILU_SOCIAL_CROSS_SEARCH_PACK_2026-08.md', import.meta.url);
const queueUrl = new URL('../marketing/social/HOSHILU_SOCIAL_CROSS_SEARCH_QUEUE_2026-08.csv', import.meta.url);
const migrationUrl = new URL('../tools/line-worker/migrations/0024_seed_social_cross_search_review.sql', import.meta.url);

test('social cross-search copy stays review-only and uses accurate external-navigation claims', async () => {
  const [pack, queue, migration] = await Promise.all([
    readFile(packUrl, 'utf8'),
    readFile(queueUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ]);
  const combined = `${pack}\n${queue}\n${migration}`;

  assert.match(combined, /9\/10モール/);
  assert.match(combined, /Instagram・X・TikTok・YouTube/);
  assert.match(combined, /リンク先で動画・画像・投稿/);
  assert.doesNotMatch(combined, /全SNS投稿を網羅(?!するとは表現しない)/);
  assert.doesNotMatch(`${queue}\n${migration}`, /食事|デリバリー|Uber Eats|出前館|Rocket Now/);
  assert.doesNotMatch(queue, /,APPROVED,/);
  assert.equal((migration.match(/'REVIEW_REQUIRED'/g) || []).length, 3);
  assert.equal((migration.match(/'APPROVED'/g) || []).length, 0);
  assert.equal((migration.match(/,0,''/g) || []).length, 3);
});
