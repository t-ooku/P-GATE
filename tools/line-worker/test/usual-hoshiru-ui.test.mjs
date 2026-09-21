// 2026-09-21 指示書 §2〜§11「いつものホシル」の画面。
// ・ホシル中に「いつものホシル」があり、件数（12 / 30）と「今週の補充」を出す
// ・商品カードに「いつものにする」→ 補充周期を選ばせる（7/14/30/60/自分で）
// ・状態・残り日数・いつもの価格はサーバーが返した事実をそのまま描く（画面で作らない）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasVersionedAsset } from './helpers/asset-version.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('ホシル中に「いつものホシル」の枠があり、値下がり待ちの次に来る', () => {
  const html = read('public/index.html');
  assert.match(html, /<div id="usualHoshiru" class="usual-hoshiru"/u);
  assert.match(html, /<h3 id="usualTitle">いつものホシル<\/h3>/u);
  assert.match(html, /<span id="usualCount" class="usual-count">/u, '件数（12 / 30）を出す場所');
  assert.match(html, /<div id="usualList" class="usual-list"/u);
  assert.match(html, /<div id="usualThisWeek">/u, '§11 今週の補充');
  assert.match(html, /なくなる前に、ホシっとく。/u, '§2 のコピー');
  assert.ok(html.indexOf('id="entrustedWatches"') < html.indexOf('id="usualHoshiru"'), '値下がり待ちの後');
  assert.ok(html.indexOf('id="usualHoshiru"') < html.indexOf('id="mywish"'));
});

test('index.html は usual-hoshiru の css/mjs を版つきで読む', () => {
  const html = read('public/index.html');
  for (const asset of ['usual-hoshiru.css', 'usual-hoshiru.mjs']) assert.ok(hasVersionedAsset(html, asset), asset);
  // app.js より後に読む（product-card-actions を受けるため）
  assert.ok(html.indexOf('/assets-v147/app.js') < html.indexOf('/usual-hoshiru.mjs'));
});

test('app.js は商品カードのアクション枠をイベントで渡すだけ（ボタン本体は持たない）', () => {
  const app = read('public/app.js');
  assert.match(app, /hoshilu:product-card-actions/u);
  assert.match(app, /detail:\{candidate,container:usualSlot\}/u);
  // ボタン本体・文言・ダイアログは usual-hoshiru.mjs 側。app.js は枠を渡すだけ。
  assert.ok(!app.includes('usual-make-button'), 'ボタンを app.js で作らない');
  assert.ok(!app.includes('/api/member/usual'), 'いつものホシルの API を app.js から叩かない');
  assert.equal(read('public/app.js'), read('public/assets-v147/app.js'));
});

test('§4 補充周期は 7/14/30/60 と自分で設定。難しい在庫入力を求めない', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /const PRESETS = \[7, 14, 30, 60\];/u);
  assert.match(ui, /cycleTitle: 'どれくらいでなくなる？'/u);
  assert.match(ui, /custom: '自分で設定'/u);
  assert.match(ui, /customField\.min = '3'; customField\.max = '365'/u);
  // 残量入力の UI を持たない（周期の選択だけ）
  assert.equal((ui.match(/type = 'number'/gu) || []).length, 1, '数値入力は補充周期の1つだけ');
});

test('§5 「買った！」を出し、押したら一覧を取り直す', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /bought: '買った！'/u);
  assert.match(ui, /api\(`\/\$\{item\.usual_id\}\/purchased`/u);
});

test('§7 状態はサーバーの4段階をそのまま出す（画面で判定しない）', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /item\.state_label/u);
  assert.match(ui, /item\.days_left/u);
  assert.ok(!/まだ大丈夫|そろそろ|もうすぐ|今ホシっとこ/u.test(ui), '4段階の文言を画面側に複製しない');
});

test('上限・未ログインはサーバーが返した日本語をそのまま出す', () => {
  const ui = read('public/usual-hoshiru.mjs');
  assert.match(ui, /result\.body\?\.message/u);
  assert.match(ui, /result\.status === 401/u);
});

test('CSS は4状態と今週の補充を持つ', () => {
  const css = read('public/usual-hoshiru.css');
  for (const name of ['.usual-state-plenty', '.usual-state-soon', '.usual-state-nearly', '.usual-state-buy_now',
    '.usual-week', '.usual-make-button', '.usual-cycle-dialog']) {
    assert.ok(css.includes(name), name);
  }
});

// 2026-09-21 指示書 P2「写真からいつもの登録」。
// 写真検索のためのコードは足していない。商品カードの描画が1本（productCard）で、
// 写真もスクショも同じ検索フォームから出るので、同じ「いつものにする」が付く。
// その前提が崩れたらここで気づけるようにしておく。
test('P2 写真から出た商品カードにも「いつものにする」が付く（描画が1本であること）', () => {
  const app = read('public/app.js');
  // アクション枠を渡すイベントは productCard の中で1回だけ
  assert.equal(app.split('hoshilu:product-card-actions').length - 1, 1, '描画の入口は1か所');
  // 2026-09-22「ホシル提示は、5個ボタン設置」で、ボタンを入れる所を
  // fillProductCardActions に切り出した。商品カードも統合カードもここを通る。
  const start = app.indexOf('function fillProductCardActions(');
  const dispatch = app.indexOf('hoshilu:product-card-actions');
  const next = app.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && dispatch > start, 'イベントは共通のボタン組み立てから出す');
  assert.ok(next === -1 || dispatch < next, '別の関数に移っていない');
  // productCard もそこを通る（描画の入口が2本に割れていない）
  assert.match(app, /function productCard\([^)]*\)\{[\s\S]*?fillProductCardActions\(card,slots,candidate,t,searchQuery\);/u);
  assert.match(app, /window\.HoshiluCardActions=\{[\s\S]*?fillProductCardActions\(/u);

  // 写真・スクショの入力は検索フォームの中にある＝結果は同じ描画を通る
  const html = read('public/index.html');
  const formStart = html.indexOf('<form id="knowledgeForm">');
  const form = html.slice(formStart, html.indexOf('</form>', formStart));
  assert.ok(form.includes('id="searchCamera"'), 'カメラ入力は検索フォームの中');
  assert.ok(form.includes('id="searchScreenshot"'), '画像選択も検索フォームの中');
});
