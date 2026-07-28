import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
const terms = readFileSync(new URL('../public/terms.html', import.meta.url), 'utf8');

test('会員同期とMYWATCHの実装内容をプライバシー方針へ明記する', () => {
  assert.match(privacy, /仮名化された会員ID/);
  assert.match(privacy, /通知の配信、既読、非表示/);
  assert.match(privacy, /ほしっトク.*削除.*会員通知も削除/s);
  assert.match(privacy, /質問欄へ氏名、住所、電話番号/);
  assert.doesNotMatch(privacy, /正式提供時.*更新/);
});

test('利用上の注意は通知を体験表示と誤記しない', () => {
  assert.match(terms, /通知種別と通知頻度の変更/);
  assert.match(terms, /必ず検知または即時配信することを保証しません/);
  assert.match(terms, /在庫・価格情報には同期の遅延/);
  assert.doesNotMatch(terms, /ホシっといて.*体験表示/);
});
