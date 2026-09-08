import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PC共有にX・Instagram・TikTokの明示ボタンを追加する', async () => {
  const source = await readFile(new URL('../public/social-share-targets.js', import.meta.url), 'utf8');
  assert.match(source, /twitter\.com\/intent\/tweet/);
  assert.match(source, /https:\/\/www\.instagram\.com\//);
  assert.match(source, /https:\/\/www\.tiktok\.com\//);
  assert.match(source, /Instagram用にコピー/);
  assert.match(source, /TikTok用にコピー/);
  assert.match(source, /include && query/);
  assert.match(source, /\/x-card-v3\?/);
  assert.match(source, /utm_content=x_card_v3/);
});
