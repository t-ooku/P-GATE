import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasVersionedAsset } from './helpers/asset-version.mjs';

// 2026-09-16 大隆さん指示: 下部固定メニュー（探す／ショップ／ホシる中／セール／マイアカウント）と上部のページ名帯
const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('トップは tab-nav を読み込み、5 タブと節の割り当てを持つ', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="\/tab-nav\.css\?v=4">/);
  assert.match(html, /<script type="module" src="\/tab-nav\.mjs\?v=10"><\/script><script type="module" src="\/assets-v147\/app\.js\?v=\d+"><\/script>/);
  assert.match(html, /<section id="accountPanel"/);
  assert.match(html, /<section id="shopCouponsNote"/);
  const nav = read('tab-nav.mjs');
  for (const id of ['search', 'shops', 'hoshiru', 'buzz', 'account']) assert.match(nav, new RegExp(`id: '${id}'`));
  for (const label of ['探す', 'ショップ', 'ホシる中', 'ホシルバズ', 'マイアカウント']) assert.ok(nav.includes(`label: '${label}'`), label);
  assert.match(nav, /\['#insight', 'hoshiru'\]/);
  assert.match(nav, /\['#buzzHome', 'buzz'\]/);
  assert.match(nav, /\['#watchDemand', 'buzz'\]/);
  assert.match(nav, /\['\.sale-center', 'account'\]/);
  assert.match(nav, /VIEW_ALIASES = \{ sale: 'account' \}/);
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
  // 2026-09-20 大隆さん指示: 「気になる商品」は「値下がり待ち」の上（ホシってるものの中）。
  assert.match(nav, /HOSHIRU_ORDER = \['#insight'\]/);
  assert.match(nav, /entrusted\.before\(kept\)/);
  assert.match(nav, /kept\.classList\.add\('kept-in-insight'\)/);
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
  assert.ok(hasVersionedAsset(read('index.html'), 'assets-v147/app.js'));
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
  // 2026-09-17 大隆さん指示: 全ページともページ名の帯を出さない
  assert.doesNotMatch(nav, /titleBar|viewTitle/);
  const suggest = read('search-suggest.mjs');
  assert.doesNotMatch(suggest, /search-suggest-kind/);
  assert.match(suggest, /li\.append\(icon, label\);/);
  const app = read('app.js');
  assert.match(app, /resultCards\.push\(rows\[0\]\);\s*const quickStrip=marketplaceQuickStrip\(result\);\s*if\(quickStrip\)resultCards\.push\(quickStrip\);/);
  const html = read('index.html');
  for (const asset of ['tab-nav.css', 'tab-nav.mjs', 'search-suggest.mjs', 'assets-v147/app.js']) assert.ok(hasVersionedAsset(html, asset), asset);
});

// 2026-09-17 大隆さん指示: 検索枠の「検索方法」見出しを削除し、余白を上に詰める。
test('検索枠に「検索方法」の見出しが無く、フォームが枠の先頭にある', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="searchStep"/);
  assert.match(html, /<section id="hoshiluSearch" class="search-panel" aria-labelledby="searchTitle">\s*<!--[^>]*-->\s*<form id="knowledgeForm">/);
  assert.match(read('app.js'), /if\(elements\.searchStep\)elements\.searchStep\.textContent=modes\.step;/);
  assert.ok(hasVersionedAsset(html, 'assets-v147/app.js'));
});

// 2026-09-17 大隆さん指示: 主 CTA は「AIで探す」。検索欄の長方形枠は縦を縮めて上に寄せる。
test('主 CTA は「AIで探す」、検索欄の枠は縦を詰めて上に寄せる', () => {
  assert.match(read('index.html'), /<button id="askAiButton" class="primary ask-ai-button" type="button">AIで探す<\/button>/);
  for (const css of ['ai-search-layout-fix.css', 'assets-v126/ai-search-layout-fix.css']) {
    const text = read(css);
    assert.match(text, /\.search-panel\{padding-top:14px\}/);
    assert.match(text, /#query\{min-height:92px;padding:12px 52px 12px 15px\}/);
  }
  assert.ok(read('index.html').includes('ai-search-layout-fix.css?v=135'));
});

// 2026-09-17 大隆さん指摘: 提示商品を開いた時の画像が荒い。楽天 128px／Yahoo! 中サイズの URL を大きいサイズに書き換える。
test('商品画像はカード・拡大とも 600px を画像サーバーに要求する（2倍画素の端末でぼやけない）', () => {
  const app = read('app.js');
  assert.match(app, /function upgradeProductImageUrl\(url,size\)/);
  assert.match(app, /\.map\(value=>upgradeProductImageUrl\(value,600\)\);/);
  assert.match(app, /expanded\.src=upgradeProductImageUrl\(url,600\);/);
  assert.match(app, /window\.HoshiluImage=\{upgrade:upgradeProductImageUrl\};/);
  assert.match(read('buzz-home.mjs'), /window\.HoshiluImage\?\.upgrade\(text\(item\.image_url\), 300\)/);
  const html = read('index.html');
  for (const asset of ['assets-v147/app.js', 'buzz-home.mjs']) assert.ok(hasVersionedAsset(html, asset), asset);
});

// 2026-09-17 大隆さん報告: 「値下がり待ち」に削除ボタンがない。各行に「やめる」（会員 DB の wish を削除）を付ける。
test('「値下がり待ち」の各行に「やめる」があり、押すと wish を削除して描き直す', () => {
  const app = read('app.js');
  assert.match(app, /remove\.className='entrusted-row-remove';remove\.textContent='やめる';/);
  assert.match(app, /await deleteWish\(String\(item\.query_text\|\|name\)\);renderWishes\(\);/);
  assert.match(read('mywatch.css'), /\.entrusted-row-remove\{/);
  const html = read('index.html');
  for (const asset of ['assets-v147/app.js', 'mywatch.css']) assert.ok(hasVersionedAsset(html, asset), asset);
});


// 2026-09-20 大隆さん指示: 「気になる商品」の余白が無駄なので詰める（外側 margin-bottom:64px をやめる）。
test('ホシる中のカードは余白を詰め、気になる商品の空状態も詰める', () => {
  const css = read('mywatch.css');
  assert.match(css, /#keptProducts\.insight-card,#insight\.insight-card\{margin:12px 0 14px;padding:16px\}/);
  assert.match(css, /#keptProducts \.kept-list \.empty\{margin:2px 0 0/);
  assert.match(css, /#insight #keptProducts\.kept-in-insight\{[^}]*border:0;border-top:1px solid var\(--line\)/);
  assert.match(css, /#insight #keptProducts\.kept-in-insight \.step\{display:none\}/);
  const html = read('index.html');
  for (const asset of ['mywatch.css', 'tab-nav.mjs']) assert.ok(hasVersionedAsset(html, asset), asset);
});


// 2026-09-20 大隆さん報告: 値下がり待ちに商品画像が出ない。検索結果の画像は image_urls（配列）にあり、
// 希望価格ダイアログが image_url しか見ていなかった。商品カードと同じ順で拾う。
test('希望価格ウォッチの商品画像は image_urls からも拾う', () => {
  const app = read('app.js');
  assert.ok(app.includes('const imageCandidates=[...(Array.isArray(candidate&&candidate.image_urls)?candidate.image_urls:[]),candidate&&candidate.image,candidate&&candidate.image_url];'));
  assert.ok(app.includes("if(text.slice(0,8)==='https://'){targetImage=text;break;}"));
  assert.equal(read('app.js'), read('assets-v147/app.js'));
});
