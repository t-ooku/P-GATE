import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('HOSHILU NEWSは今日の機能強化を告知し旧10モール表記を残さない', async () => {
  const source = await readFile(new URL('../public/announcements.mjs', import.meta.url), 'utf8');
  assert.match(source, /2026-08-09/);
  assert.match(source, /AI検索・最大13モール比較・保存＆通知設定を強化/);
  assert.doesNotMatch(source, /最大10モール|up to ten|最多十个|최대 10개/);
});
