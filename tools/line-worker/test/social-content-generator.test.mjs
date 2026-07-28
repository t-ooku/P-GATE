import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYouthSearchPost, youthSearchThemes } from '../src/social-content-generator.mjs';

test('young-audience generator provides twelve distinct ambiguous searches', () => {
  assert.equal(youthSearchThemes.length, 12);
  assert.equal(new Set(youthSearchThemes.map((theme) => theme[0])).size, 12);
});

test('generated posts lead to HOSHILU with a refined query and campaign attribution', () => {
  for (let index = 0; index < youthSearchThemes.length; index += 1) {
    const post = buildYouthSearchPost(index, ['X', 'INSTAGRAM', 'TIKTOK'][index % 3]);
    const url = new URL(post.link);
    assert.equal(url.origin, 'https://hoshilu.app');
    assert.ok(url.searchParams.get('q').length >= 5);
    assert.equal(url.searchParams.get('utm_campaign'), 'young_ambiguous_search');
    assert.equal(post.status, 'REVIEW_REQUIRED');
  }
});
