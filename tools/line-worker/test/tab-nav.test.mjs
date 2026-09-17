import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-09-16 大隆さん指示: 下部固定メニュー（探す／ショップ／ホシる中／セール／マイアカウント）と上部のページ名帯
const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('トップは tab-nav を読み込み、5 タブと節の割り当てを持つ', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="\/tab-nav\.css\?v=3">/);
  assert.match(html, /<script type="module" src="\/tab-nav\.mjs\?v=4"><\/script><script type="module" src="\/assets-v147\/app\.js\?v=\d+"><\/script>/);
  assert.match(html, /<section id="accountPanel"/);
  assert.match(html, /<section id="shopCouponsNote"/);
  const nav = read('tab-nav.mjs');
  for (const id of ['search', 'shops', 'hoshiru', 'sale', 'account']) assert.match(nav, new RegExp(`id: '${id}'`));
  for (const label of ['探す', 'ショップ', 'ホシる中', 'セール', 'マイアカウント']) assert.ok(nav.includes(`label: '${label}'`), label);
  assert.match(nav, /\['#insight', 'hoshiru'\]/);
  assert.match(nav, /\['#buzzHome', 'hoshiru'\]/);
  assert.match(nav, /\['#watchDemand', 'hoshiru'\]/);
  assert.match(nav, /\['\.sale-center', 'sale'\]/);
  assert.match(nav, /\['#shopDirectory', 'shops'\]/);
  assert.match(nav, /\['#officialSocial', 'account'\]/);
  // ページ内リンクは属するタブを開いてからスクロール
  assert.match(nav, /target\.closest\('\[data-view\]'\)/);
  // 未実装のユーザーポイントは出さない
  assert.doesNotMatch(html, /ポイント管理/);
  const css = read('tab-nav.css');
  assert.match(css, /\.tab-bar\{position:fixed/);
  assert.match(css, /\.view-hidden\{display:none!important\}/);
  assert.match(read('service-worker.js'), /'\/tab-nav\.css', '\/tab-nav\.mjs'/);
});

// 2026-09-16 大隆さん指示: 「♡ 気になる」で保存した商品を「ホシる中」に横スクロールで一覧（× で外せる）。
test('気になる商品は「ホシる中」タブに横スクロールで並び、BUZZ にもハートがある', () => {
  const html = read('index.html');
  assert.match(html, /<section id="keptProducts" class="insight-card kept-products"/);
  assert.match(html, /<div id="keptProductList" class="kept-list" aria-live="polite">/);
  const nav = read('tab-nav.mjs');
  assert.match(nav, /\['#keptProducts', 'hoshiru'\]/);
  assert.match(nav, /HOSHIRU_ORDER = \['#insight', '#keptProducts', '#buzzHome', '#watchDemand'\]/);
  const app = read('app.js');
  assert.match(app, /function removeKeptProduct\(key\)/);
  assert.match(app, /function renderKeptProducts\(\)/);
  assert.match(app, /kept-card-remove/);
  const css = read('mywatch.css');
  assert.match(css, /\.kept-list\.kept-rail\{[^}]*overflow-x:auto/);
  const buzz = read('buzz-home.mjs');
  assert.match(buzz, /el\('button', 'buzz-home-keep'\)/);
  assert.match(buzz, /window\.HoshiluKeep\?\.toggle\(candidate\)/);
  assert.match(read('buzz-home.css'), /\.buzz-home-keep\.kept\{/);
});

// 2026-09-17 大隆さん報告: 「値下がり待ち」の「いまの価格を見る」を押しても反応しない。
// 検索欄は「探す」タブの中に隠れているので、先にタブを開いてから検索を実行する。
test('「いまの価格を見る」は「探す」タブを開いて検索を実行する', () => {
  const app = read('app.js');
  assert.match(app, /function focusSearch\(\)\{window\.HoshiluTabs\?\.activate\('search',\{scroll:false\}\);/);
  assert.match(app, /function submitSearchNow\(\)\{window\.HoshiluTabs\?\.activate\('search',\{scroll:false\}\);/);
  assert.match(app, /again\.textContent='いまの価格を見る';\n\s*again\.addEventListener\('click',\(\)=>\{elements\.query\.value=name;elements\.clear\.classList\.remove\('hidden'\);submitSearchNow\(\);\}\);/);
  assert.match(read('index.html'), /app\.js\?v=171/);
});

// 2026-09-17: 検索欄の「ショップから探す」ボタンも、ショップ一覧が「ショップ」タブ内に隠れているので先にタブを開く。
test('「ショップから探す」ボタンは「ショップ」タブを開いてからスクロールする', () => {
  assert.match(read('shop-directory.mjs'), /window\.HoshiluTabs\?\.activate\('shops', \{ scroll: false \}\);\n\s*section\?\.scrollIntoView/);
  assert.match(read('index.html'), /shop-directory\.mjs\?v=3/);
});

// 2026-09-17 大隆さん指示（3 件）: 「探す」の帯からページ名を消す／検索候補の右側の『メーカー』『関連』を消す／
// 「ホシルからの提案」のモール導線は商品提示の下へ。
test('「探す」ではページ名の帯を出さず、検索候補に種別バッジが無く、モール導線は商品の下', () => {
  const nav = read('tab-nav.mjs');
  assert.match(nav, /titleBar\.classList\.toggle\('view-title-hidden', view\.id === 'search'\);/);
  assert.match(read('tab-nav.css'), /\.view-title\.view-title-hidden\{display:none\}/);
  const suggest = read('search-suggest.mjs');
  assert.doesNotMatch(suggest, /search-suggest-kind/);
  assert.match(suggest, /li\.append\(icon, label\);/);
  const app = read('app.js');
  assert.match(app, /resultCards\.push\(rows\[0\]\);\s*const quickStrip=marketplaceQuickStrip\(result\);\s*if\(quickStrip\)resultCards\.push\(quickStrip\);/);
  const html = read('index.html');
  for (const asset of ['tab-nav.css?v=3', 'tab-nav.mjs?v=4', 'search-suggest.mjs?v=3', 'app.js?v=171']) assert.ok(html.includes(asset), asset);
});

// 2026-09-17 大隆さん指示: 検索枠の「検索方法」見出しを削除し、余白を上に詰める。
test('検索枠に「検索方法」の見出しが無く、フォームが枠の先頭にある', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="searchStep"/);
  assert.match(html, /<section id="hoshiluSearch" class="search-panel" aria-labelledby="searchTitle">\s*<!--[^>]*-->\s*<form id="knowledgeForm">/);
  assert.match(read('app.js'), /if\(elements\.searchStep\)elements\.searchStep\.textContent=modes\.step;/);
  assert.ok(html.includes('app.js?v=171'));
});

// 2026-09-17 大隆さん指示: 主 CTA は「AIで探す」。検索欄の長方形枠は縦を縮めて上に寄せる。
test('主 CTA は「AIで探す」、検索欄の枠は縦を詰めて上に寄せる', () => {
  assert.match(read('index.html'), /<button id="askAiButton" class="primary ask-ai-button" type="button">AIで探す<\/button>/);
  for (const css of ['ai-search-layout-fix.css', 'assets-v126/ai-search-layout-fix.css']) {
    const text = read(css);
    assert.match(text, /\.search-panel\{padding-top:14px\}/);
    assert.match(text, /#query\{min-height:92px;padding:12px 52px 12px 15px\}/);
  }
  assert.ok(read('index.html').includes('ai-search-layout-fix.css?v=132'));
});

// 2026-09-17 大隆さん指摘: 提示商品を開いた時の画像が荒い。楽天 128px／Yahoo! 中サイズの URL を大きいサイズに書き換える。
test('商品画像はカード 300px・拡大 600px を画像サーバーに要求する', () => {
  const app = read('app.js');
  assert.match(app, /function upgradeProductImageUrl\(url,size\)/);
  assert.match(app, /\.map\(value=>upgradeProductImageUrl\(value,300\)\);/);
  assert.match(app, /expanded\.src=upgradeProductImageUrl\(url,600\);/);
  assert.match(app, /window\.HoshiluImage=\{upgrade:upgradeProductImageUrl\};/);
  assert.match(read('buzz-home.mjs'), /window\.HoshiluImage\?\.upgrade\(text\(item\.image_url\), 300\)/);
  const html = read('index.html');
  assert.ok(html.includes('app.js?v=171') && html.includes('buzz-home.mjs?v=7'));
});
