// 2026-09-25 大隆さん指示「メガ割・プライム感謝祭などをホシル登録して見逃さない」「いつものホシルもバンバン販促」。画面側。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('セール画面: 「これからの大型セール」と「始まる前に知らせて」。未ログインはその場の最短登録、LINE で戻っても保存する', async () => {
  // このモジュールは読み込むとページを描くので、純粋な関数3つだけを切り出して動かす。
  const source = readFileSync(new URL('../public/sale-center.mjs', import.meta.url), 'utf8');
  const pick = (name) => { const start = source.indexOf(`export function ${name}(`); return source.slice(start + 'export '.length, source.indexOf('\n}\n', start) + 2); };
  const { upcomingMajorSales, majorAlertReady, majorAlertPayload } = new Function(
    `const language=()=>'JA';${pick('upcomingMajorSales')}${pick('majorAlertReady')}${pick('majorAlertPayload')}return {upcomingMajorSales,majorAlertReady,majorAlertPayload};`
  )();
  const now = Date.parse('2026-10-07T01:00:00.000Z');
  const list = [
    { info_type: 'SALE', starts_at: '2026-10-07T00:00:00.000Z', ends_at: '2026-10-08T00:00:00.000Z' },
    { info_type: 'MAJOR_SALE', title: 'b', starts_at: '2026-10-15T15:00:00.000Z', ends_at: '2026-10-19T14:59:00.000Z' },
    { info_type: 'MAJOR_SALE', title: 'a', starts_at: '2026-10-12T15:00:00.000Z', ends_at: '2026-10-15T14:59:00.000Z' },
    { info_type: 'MAJOR_SALE', title: 'old', starts_at: '2026-09-01T00:00:00.000Z', ends_at: '2026-09-09T00:00:00.000Z' }
  ];
  assert.deepEqual(upcomingMajorSales(list, now).map((sale) => sale.title), ['a', 'b'], '大型セールだけ・近い順・終わったものは出さない');
  assert.equal(majorAlertReady(null), false);
  assert.equal(majorAlertReady({ enabled: 1, advance_notice: 1, info_types: 'SALE' }), true);
  assert.equal(majorAlertReady({ enabled: 1, advance_notice: 0, info_types: 'MAJOR_SALE' }), false, '事前通知が切れていれば「登録済み」と言わない');
  assert.equal(majorAlertReady({ enabled: 0, advance_notice: 1, info_types: 'SALE' }), false);
  // 新しい会員: 大型セールだけ（毎日のタイムセールは送らない）、連携済みの届け先をすべて使う、全モール
  const fresh = majorAlertPayload({ enabled: 1, advance_notice: 1, info_types: 'SALE', marketplaces: 'ALL', delivery_channels: 'APP' }, ['APP', 'LINE'], true);
  assert.deepEqual(fresh.info_types, ['MAJOR_SALE']);
  assert.deepEqual(fresh.delivery_channels, ['APP', 'LINE']);
  assert.deepEqual(fresh.marketplaces, []);
  assert.equal(fresh.advance_notice, true);
  // 既存の会員: いまの設定に大型セールを足すだけ。減らさない
  const existing = majorAlertPayload({ enabled: 1, advance_notice: 0, info_types: 'COUPON', marketplaces: 'AMAZON_JP,QOO10_JP', delivery_channels: 'APP,EMAIL', frequency: 'DAILY' }, ['APP', 'EMAIL'], false);
  assert.deepEqual(existing.info_types, ['COUPON', 'MAJOR_SALE']);
  assert.deepEqual(existing.marketplaces, ['AMAZON_JP', 'QOO10_JP']);
  assert.equal(existing.frequency, 'DAILY');
  assert.equal(existing.advance_notice, true, '「始まる前に」を押したのだから事前通知は入れる');
  // 全部解除していた人が押したら、大型セールだけで再開
  assert.deepEqual(majorAlertPayload({ enabled: 0, info_types: '', marketplaces: 'ALL', delivery_channels: 'APP' }, ['APP'], false).info_types, ['MAJOR_SALE']);

  assert.match(source, /\['MAJOR_SALE','大型セール','プライム感謝祭・メガ割など、年に数回の大型セールだけ'\]/u);
  assert.match(source, /window\.HoshiluQuickJoin\?\.create\?\.\(\{lead:t\.lead,done:t\.done,source:'sale_alert',campaign:'sale-alert',next:'\/#saleCenterTitle'/u);
  assert.match(source, /if\(readMajorPending\(\)\)await applyPendingMajorAlert\(data\);/u, 'LINE で戻ってきたときに保存');
  assert.match(source, /preferenceCreated=preferenceCreated\|\|data\.preference_created===true;/u, '「初めて作った設定」はどの GET でも取りこぼさない');
  assert.match(source, /const saved=await applyPendingMajorAlert\(memberPreference\?\{preference:memberPreference/u, 'ログイン済みならその場で保存');
  assert.match(source, /document\.addEventListener\('hoshilu:member-session-changed',async\(\)=>\{[\s\S]{0,200}const data=await fetchPreference\(\);\s*if\(data&&readMajorPending\(\)\)await applyPendingMajorAlert\(data\);/u, 'メール登録が同じページで終わったときに設定を読み直して保存');

  assert.match(readFileSync(new URL('../public/sale-center.css', import.meta.url), 'utf8'), /\.sale-major-cta\{/u);
});

test('いつものホシル画面: 未ログインで「いつもの」を押しても止めない。預かって、登録後にそのまま保存する', () => {
  const ui = readFileSync(new URL('../public/usual-hoshiru.mjs', import.meta.url), 'utf8');
  assert.match(ui, /if \(result\.status === 401\) \{\s*rememberPendingUsual\(\{ \.\.\.candidate, cycle_days: chosen \}\);/u);
  assert.match(ui, /window\.HoshiluQuickJoin\?\.create\?\.\(\{\s*lead: COPY\.joinLead, done: COPY\.joinDone, source: 'usual', campaign: 'usual-hoshiru', next: '\/#usualHoshiru'/u);
  assert.match(ui, /const PENDING_TTL_MS = 24 \* 60 \* 60 \* 1000;/u, '預かりは24時間まで');
  assert.match(ui, /if \(result\.status === 401 \|\| result\.status >= 500\) return false;/u, '未ログイン・一時的な失敗なら預かりを消さない');
  assert.match(ui, /document\.addEventListener\('hoshilu:member-session-changed', \(\) => \{\s*if \(readPendingUsual\(\)\) \{ applyPendingUsual\(\)/u);
  assert.match(ui, /if \(!items\.length\) load\(\);/u, '預かりが無いときは、まだ読めていない場合だけ読み直す（二重読みしない）');
  assert.match(ui, /if \(readPendingUsual\(\)\) applyPendingUsual\(\)/u, 'LINE で戻ってきたときも保存');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal(app, readFileSync(new URL('../public/assets-v147/app.js', import.meta.url), 'utf8'));
  assert.match(app, /window\.HoshiluQuickJoin=\{create:\(options=\{\}\)=>createWatchQuickJoin\(0,options\.onDone,options\)\};/u);
  assert.match(app, /const joinNext=\['\/#wishTitle','\/#usualHoshiru','\/#saleCenterTitle'\]\.includes\(options\.next\)\?options\.next:'\/#wishTitle';/u, '戻り先は決まった3つだけ');
  assert.match(app, /if\(options\.done\)c\.done=options\.done;/u);
  assert.doesNotMatch(app, /他の端末にも残す/u, '♡は端末だけの保存なので、他の端末に残ると言わない');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /商品の「↻ いつもの」を押すと、ここに並びます。/u, 'ボタンの実際の文言と合わせる');
});
