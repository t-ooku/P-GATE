// 2026-09-22 指示書「検索結果UI統合改修」の画面側。
// ・「見つかった商品」1セクションにまとめ、元の2つは畳む（§1）
// ・スマホは横スライド、PCは複数列グリッド＋縦スクロール（§5・追加指示§1/§4）
// ・HOSHILU商品だけ価格。Web商品は「価格は商品ページで確認」（§7）
// ・12件ずつ出す。60枚の画像を最初から読み込ませない（§11・§13）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const ui = () => read('unified-results-ui.mjs');
const css = () => read('unified-results-ui.css');

test('サーバーが決めた順番をそのまま描く（画面で並べ替えない）', () => {
  const source = ui();
  assert.ok(!/\.sort\(/u.test(source), 'ここで並べ替えると、Web結果が遅れて届くたびに位置が動く（§28）');
  assert.match(source, /items\.slice\(0, PAGE\)/u);
});

// 2026-09-22 大隆さん指示「MATCHESのタイトル残した状態で、ホシルの提案とweb検索を
// 合体して、1列にして」「合体した列がMATCHESとする」。
test('MATCHESの見出しはページのものを使い、合体した列をその真下に入れる', () => {
  const source = ui();
  assert.ok(!source.includes("'見つかった商品'"), '自前の見出しは持たない');
  assert.ok(!/el\('h2'/u.test(source), '見出しを二重に作らない');
  // 棚が並ぶ場所そのもの（#resultCards の先頭）に入れる。#resultsSection 直下だと
  // CSS の並び順で見出しより上に出てしまっていた。
  assert.match(source, /cards\.prepend\(host\)/u);
  // 元の2つの棚（価格確認済み・AI選定レコメンド）と web検索の枠は畳む
  assert.match(source, /result-row-confirmed/u);
  assert.match(source, /result-row-unconfirmed/u);
  assert.match(source, /#googleMallResults/u);
  // レコメンド（関連商品）は別の話なので畳まない
  assert.ok(!source.includes('result-row-recommended'), 'レコメンドまで消さない');
});

// 2026-09-22 大隆さん指示「ホシル提示は、5個ボタン設置」。
test('HOSHILU商品には商品カードと同じ5個のボタン。Web商品は♡だけ', () => {
  const source = ui();
  // 元の候補に戻る鍵はサーバーが付けた番号だけ。名前で推測しない。
  assert.match(source, /candidate_index/u);
  assert.match(source, /window\.HoshiluCardActions\?\.attach/u);
  assert.match(source, /article\.classList\.add\('unified-card-full'\)/u);
  // 候補が無い Web 商品は ♡ だけ
  assert.match(source, /\} else \{\s*const keep = keepButton\(item\);/u);
  // 口コミは商品名を h3 から読むので h3 で出す
  assert.match(source, /el\('h3', 'unified-card-name'/u);
  const app = read('app.js');
  assert.match(app, /window\.HoshiluCardActions=\{/u);
});

test('12件ずつ。最初から60枚の画像を読ませない', () => {
  const source = ui();
  assert.match(source, /const PAGE = 12;/u);
  assert.match(source, /img\.loading = 'lazy';/u);
  assert.match(source, /img\.decoding = 'async';/u);
  // 画像が落ちても列全体を壊さない（§13）
  assert.match(source, /img\.addEventListener\('error'/u);
});

// 2026-09-22 大隆さん報告「価格もでてない」。隠すのでもなく、確認済みの価格と
// 同じ顔で並べるのでもなく、別の見た目にして「参考価格・検索時点」と断る。
test('確認済みの価格とweb検索の参考価格は、見た目と断り書きで分ける', () => {
  const source = ui();
  assert.match(source, /if \(Number\(item\.price_jpy\) > 0\)/u);
  assert.match(source, /Number\(item\.listed_price_jpy\) > 0/u);
  assert.match(source, /unified-card-price-listed/u);
  assert.match(source, /priceListedNote: '参考価格・検索時点'/u);
  assert.match(source, /priceUnknown: '価格は商品ページで確認'/u);
  assert.match(css(), /\.unified-card-price-note\{/u);
});

// 2026-09-22 大隆さん報告「画質も荒い」。
test('カードの画像は大きいサイズを要求する', () => {
  assert.match(ui(), /window\.HoshiluImage\?\.upgrade\?\.\(item\.image_url, 600\)/u);
});

test('件数の書き方で「全部で60件しかない」と誤解させない（§9）', () => {
  const source = ui();
  assert.match(source, /capped: \(n\) => `\$\{n\}件表示中`/u);
  assert.match(source, /unified\.truncated \? COPY\.capped/u);
  assert.match(source, /narrow: '条件を絞ると、さらに近い商品を探せます。'/u);
});

test('ソースは小さいバッジだけ（大きく分離しない §8）', () => {
  const source = ui();
  assert.match(source, /badge: \{ HOSHILU: 'HOSHILU', HOSHILU_SHOP: 'HOSHILU SHOP', WEB: 'Web' \}/u);
  assert.match(css(), /\.unified-badge\{[^}]*font-size:9\.5px/u);
});

test('ホシっとくは app.js の保存先をそのまま使う（別の保存を作らない）', () => {
  const source = ui();
  assert.match(source, /window\.HoshiluKeep/u);
  assert.ok(!source.includes('localStorage'), '保存先を二重に持たない');
});

test('スマホは横スライド、PCは複数列グリッド＋縦スクロール', () => {
  const sheet = css();
  const mobile = sheet.slice(sheet.indexOf('@media (max-width:760px)'), sheet.indexOf('@media (min-width:761px)'));
  assert.match(mobile, /\.unified-list\{[^}]*overflow-x:auto/u);
  // 2026-09-22: 与えられた幅の中でちょうど2つ。はみ出させない（左にずれる）
  assert.match(mobile, /flex:0 0 calc\(\(100% - 10px\) \/ 2\)/u, '幅ちょうど2商品');
  assert.ok(!mobile.includes('50vw'), '画面の端まではみ出させない');
  const desktop = sheet.slice(sheet.indexOf('@media (min-width:761px)'));
  assert.match(desktop, /\.unified-list\{display:grid;gap:14px;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/u);
  assert.match(desktop, /@media \(min-width:1000px\)\{\s*\.unified-list\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/u);
  assert.match(desktop, /@media \(min-width:1360px\)\{\s*\.unified-list\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/u);
  assert.ok(!desktop.includes('overflow-x:auto'), 'PCで横スクロールは使わない');
});

test('商品名は2行で切り、カードの高さをそろえる', () => {
  assert.match(css(), /\.unified-card-name\{[^}]*-webkit-line-clamp:2/u);
  assert.match(css(), /\.unified-card-name\{[^}]*min-height:2\.8em/u);
});

test('index.html が読み、app.js が unified_results と候補を渡している', () => {
  const html = read('index.html');
  assert.match(html, /unified-results-ui\.css\?v=6/u);
  assert.match(html, /unified-results-ui\.mjs\?v=5/u);
  const app = read('app.js');
  assert.match(app, /unified_results:result\?\.unified_results\|\|null/u);
  assert.match(app, /candidates:Array\.isArray\(result\?\.candidates\)\?result\.candidates:\[\]/u);
  assert.equal(app, read('assets-v147/app.js'));
});

// 2026-09-22: 棚を畳むには、棚が DOM に並んでからイベントを出す必要がある。
// 先頭で出していたため「ホシルからの提案」が二重に出ていた。
test('結果イベントは商品カードを並べ終えてから出す', () => {
  const app = read('app.js');
  const start = app.indexOf('function renderResults(');
  const replace = app.indexOf('elements.cards.replaceChildren(', start);
  const dispatch = app.indexOf("hoshilu:results-rendered", start);
  assert.ok(start >= 0 && replace > start, '棚を並べる処理がある');
  assert.ok(dispatch > replace, 'イベントは並べ終えてから');
});

// 2026-09-22 追加指示「PC版ページメニューを上帯へ移動」。
// スマホは今までどおり下の固定タブ（追加指示§9）。
test('PCではページメニューを上帯へ。名前は現行のまま、下線だけで現在位置を示す', () => {
  const sheet = readFileSync(new URL('../public/tab-nav.css', import.meta.url), 'utf8');
  const desktop = sheet.slice(sheet.indexOf('/* 2026-09-22 大隆さん指示「PC版ページメニューを上帯へ移動」'));
  assert.ok(desktop, 'PC用の上帯の規則がある');
  assert.match(desktop, /@media \(min-width:761px\)/u);
  // ロゴ帯（sticky top:0 / 60px）の直下に固定する
  assert.match(desktop, /\.tab-bar\{[^}]*position:fixed/u);
  assert.match(desktop, /\.tab-bar\{[^}]*top:60px/u);
  assert.match(desktop, /\.tab-bar\{[^}]*bottom:auto/u);
  // 高さを大きくしすぎない（§6）
  assert.match(desktop, /min-height:46px/u);
  // 現在位置は下線だけ。塗らない（§7）
  assert.match(desktop, /\.tab-bar-item\.active\{[^}]*border-bottom-color:#5140ba/u);
  assert.match(desktop, /\.tab-bar-item\.active\{[^}]*background:none/u);
  // 下の固定タブぶんの余白は要らなくなる
  assert.match(desktop, /body\.has-tab-bar\{padding-bottom:0\}/u);
  // メニュー名は勝手に変えない（追加指示§5）
  const nav = readFileSync(new URL('../public/tab-nav.mjs', import.meta.url), 'utf8');
  for (const label of ['探す', 'ホシる中', 'ショップ', 'ホシルバズ', 'マイアカウント']) {
    assert.ok(nav.includes(`label: '${label}'`), label);
  }
});

// 2026-09-22 大隆さん指示「2条件一致という文字削除して上に詰めて。できるだけ正方形に」
// 「『価格』『いつもの』『気になる』『口コミ』…この4つのボタンは2行に」
// 「口コミはタップしたら、入力欄が開く」
test('カードは4つのボタンを2列2行に。条件一致の文字は出さない', () => {
  const source = ui();
  // 画面に文字として出さない（コメントで理由は残してある）
  assert.ok(!/`\$\{n\}条件一致`/u.test(source), '一致の度合いは並び順に出ている');
  assert.ok(!source.includes('unified-card-matched'), '一致の行ごと消す');
  assert.match(source, /reviews: '💬 口コミ'/u);
  // 口コミを押したら入力欄まで開く（口コミの作りを二重に持たない）
  assert.match(source, /article\.querySelector\('\.experience-post'\)\?\.click\(\)/u);
  const sheet = css();
  assert.match(sheet, /\.unified-card-full \.product-card-actions\{[^}]*grid-template-columns:1fr 1fr/u);
  // ボタンの升目と中身をそろえる（ガタガタにしない）
  assert.match(sheet, /grid-auto-rows:1fr/u);
  // 「価格比較」は4つに入らないので、価格の隣へ移す（2026-09-22）
  assert.match(source, /priceRow\.append\(slots\.buySlot\)/u);
  assert.match(sheet, /\.unified-card-price-row\{display:flex/u);
  // 口コミの中身は押したときだけ
  assert.match(sheet, /\.unified-card-full \.experience-block\{display:none\}/u);
  assert.match(sheet, /\.unified-card-full\.reviews-open \.experience-block\{display:block\}/u);
  // ボタンの文字（🔔 価格通知 / ↻ いつもの / ♡ 気になる）は各モジュールが持つ
  const app = read('app.js');
  assert.match(app, /JA:'🔔 価格通知'/u);
  assert.match(app, /JA:\{keep:'♡ 気になる',kept:'♥ 気になる'/u);
  const usual = read('usual-hoshiru.mjs');
  assert.match(usual, /makeUsual: '↻ いつもの'/u);
  const compare = read('ai-price-comparison-ui.mjs');
  assert.match(compare, /button: '価格比較'/u);
  // 文字が2行に折れないよう、カードを少し広げてボタンは1行に収める
  assert.match(sheet, /flex:0 0 calc\(\(100% - 10px\) \/ 2\)/u);
  assert.match(sheet, /white-space:nowrap/u);
});

// 2026-09-22 大隆さん報告「web検索が表示されてない」。
// 統合した列には商品ページだけを入れているので、web検索が一覧ページしか返さなかった
// 検索では web の結果が1件も出ない。その時だけ元の「web検索から発見」の枠を残す。
test('統合した列に web の商品が1件も無いときは、元のweb検索の枠を残す', () => {
  const source = ui();
  assert.match(source, /function foldLegacySections\(folded, hasWeb = false\)/u);
  assert.match(source, /google\.classList\.toggle\('hidden', folded && hasWeb\)/u);
  assert.match(source, /foldLegacySections\(true, items\.some\(\(item\) => item\.source === 'WEB'\)\)/u);
});

// 2026-09-22 大隆さん指示「届く通知の例は、普段閉じておいて、タップしたら開く。
// 商品提示欄の下に移動して」「ショッピングサイトで探す欄と『この条件、ホシっといて
// 探し続けてもらう？』欄の間を数ミリ空けて」。
test('届く通知の例は畳んだ状態で、商品提示の下に置く', () => {
  const html = read('index.html');
  // 畳んで開ける形（details）。open は付けない＝最初は閉じている
  assert.match(html, /<details id="heroWatchExample" class="marketplace-coverage hero-marketplace-coverage"/u);
  assert.ok(!/<details id="heroWatchExample"[^>]*\sopen/u.test(html), '最初は閉じている');
  assert.match(html, /<summary class="step hero-marketplace-coverage-summary">届く通知の例<\/summary>/u);
  // 置き場所は結果（#resultsSection）の下
  assert.ok(html.indexOf('<details id="heroWatchExample"') > html.indexOf('<div id="resultCards"'),
    '商品提示欄の下にある');
  const sheet = readFileSync(new URL('../public/hero-watch.css', import.meta.url), 'utf8');
  // 枠と開閉の見た目はモール一覧と同じものを使い、独自の見た目は持たせない
  assert.ok(!sheet.includes('details.hero-watch-example>summary'), '独自の開閉装飾を持たない');
  // 「ショッピングサイトで探す」と「ホシっといて探し続けてもらう？」の間に余白
  assert.match(sheet, /\.continuous-search-card\{margin-top:12px\}/u);
  assert.match(html, /hero-watch\.css\?v=6/u);
});

// 2026-09-22 大隆さん指示「検索語だけの欄は不用。ホシッとく欄にもあるから」。
test('見つからなかったとき、検索語だけの箱は出さない', () => {
  const app = read('app.js');
  assert.ok(!app.includes("empty.className='empty-result'"), '検索語だけの箱は作らない');
  // 検索語は「ホシっといて探し続けてもらう？」の中に残っている
  assert.match(app, /continuousSearchCard\(elements\.query\.value,\{found:false\}\)/u);
});
