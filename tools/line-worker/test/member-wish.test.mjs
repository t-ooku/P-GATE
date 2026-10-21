import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMemberWishRoutes } from '../src/member-wish-v2.mjs';

test('MYWISH APIはD1未設定時に安全に停止する', async () => {
  const response = await handleMemberWishRoutes(new Request('https://hoshilu.app/api/member/wishes'), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'MEMBER_STORE_NOT_CONFIGURED');
});

test('MYWISH以外のURLは処理しない', async () => {
  const response = await handleMemberWishRoutes(new Request('https://hoshilu.app/api/knowledge'), {});
  assert.equal(response, null);
});

test('MYWISH更新・削除は通知条件を扱い、削除後は匿名イベントだけを残す', async () => {
  const source = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/member-wish-v2.mjs', import.meta.url), 'utf8'));
  assert.match(source, /request\.method === 'PATCH'/);
  assert.match(source, /DELETED_BY_MEMBER/);
  assert.match(source, /member_wish_events/);
  assert.match(source, /watch_frequency/);
  assert.match(source, /DELETE FROM mywatch_notifications WHERE member_id=\?1 AND wish_id=\?2/);
  assert.doesNotMatch(source, /INSERT INTO member_wish_events\([^)]*query_text/);
  assert.doesNotMatch(source, /INSERT INTO member_wish_events\([^)]*member_id/);
});

test('MYWATCH通知頻度をAPIと会員画面の両方で変更できる', async () => {
  const [source, app] = await Promise.all([
    import('node:fs').then(fs => fs.readFileSync(new URL('../src/member-wish-v2.mjs', import.meta.url), 'utf8')),
    import('node:fs').then(fs => fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'))
  ]);
  assert.match(source, /WATCH_FREQUENCIES/);
  assert.match(source, /watch_frequency=excluded\.watch_frequency/);
  assert.match(app, /watchFrequencyFor/);
  assert.match(app, /\['MUTED','通知を停止'\]/);
  assert.match(app, /payloadFor\(value,options,frequency\.value\)/);
});
