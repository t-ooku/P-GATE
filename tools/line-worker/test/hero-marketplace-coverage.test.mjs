import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 2026-08-08 依頼: 「今日は、何が欲しい？」の直下にもう一つMARKETPLACE
// COVERAGEを設置し、検索窓が下へ行き過ぎないよう折りたたみ式にする。各
// ユーザー(ブラウザ)はログイン/訪問1回目だけ開いておき、2回目以降は
// 閉じておく。
// 2026-09-03 指示書 §13–17(トップは検索開始装置。順番は 検索 → 写真・
// スクショ・SNS → 検索例 → BUZZ → SALE RADAR → 13モール → 仕組み …、
// MARKETPLACE COVERAGE と長い説明は後ろへ): ウィジェット自体は残し、
// 置き場所をヒーロー直下から SALE RADAR の直後(13モールの位置)へ移した。

test('折りたたみ式のMARKETPLACE COVERAGE(heroMarketplaceCoverage)は検索窓より後ろ、SALE RADARの直後に置く', async () => {
  const [html,css] = await Promise.all([read('index.html'),read('ai-search-layout-fix.css')]);
  assert.match(html, /<details id="heroMarketplaceCoverage" class="marketplace-coverage hero-marketplace-coverage">/);
  assert.match(html, /<summary class="step hero-marketplace-coverage-summary">MARKETPLACE COVERAGE<\/summary>/);
  assert.match(css, /hero-marketplace-coverage>summary::after\{[\s\S]*content:'（開く）'/);
  assert.match(css, /hero-marketplace-coverage\[open\]>summary::after\{\s*content:'（閉じる）'/);
  assert.match(css, /\.hoshilu-primary>\.hero\{\s*padding-bottom:12px/);
  // §13–17: ヒーロー → 検索フォーム(#hoshiluSearch) → BUZZ → SALE RADAR → このウィジェット。
  const heroEnd = html.indexOf('<div class="hero-visual" aria-hidden="true"></div>');
  const widgetStart = html.indexOf('id="heroMarketplaceCoverage"');
  const searchStart = html.indexOf('id="hoshiluSearch"');
  const saleStart = html.indexOf('class="sale-center"');
  const insightStart = html.indexOf('id="insight"');
  assert.notEqual(heroEnd, -1);
  assert.notEqual(widgetStart, -1);
  assert.notEqual(searchStart, -1);
  assert.ok(heroEnd < searchStart, 'search form directly follows the hero');
  assert.ok(searchStart < saleStart && saleStart < widgetStart, 'widget comes after search, BUZZ and SALE RADAR');
  assert.ok(widgetStart < insightStart, 'widget stays above the saved hub / news / journey');
  // 既存の#marketplaceCoverageと同じ13モール内訳(integrated 3 / direct 10)。
  for (const mall of ['Amazon', '楽天市場', 'Qoo10', 'SHEIN', 'ZOZOTOWN', 'ロフト', 'ハンズ', 'マツキヨココカラ', '@cosme', 'ABC-MART', 'BUYMA', 'SNKRDUNK']) {
    const widgetSection = html.slice(widgetStart, html.indexOf('</details>', widgetStart));
    assert.match(widgetSection, new RegExp(`>${mall}<`), `missing ${mall} in hero widget`);
  }
});

test('hero-marketplace-coverage.mjsは既存のmarketplace-coverage.mjsの文言・分岐を再利用する(二重管理しない)', async () => {
  const module = await read('hero-marketplace-coverage.mjs');
  assert.match(module, /import \{ COPY, applyMarketplaceCoverageToNodes, selectedLanguage \} from '\.\/marketplace-coverage\.mjs'/);
  assert.match(module, /#heroMarketplaceCoverageTitle/);
  assert.match(module, /#heroMarketplaceCoverageLead/);
  assert.match(module, /#heroMarketplaceCoverageCount/);
  assert.match(module, /#heroMarketplaceIntegratedLabel/);
  assert.match(module, /#heroMarketplaceIntegratedList/);
  assert.match(module, /#heroMarketplaceDirectLabel/);
  assert.match(module, /#heroMarketplaceDirectList/);
  assert.match(module, /#heroMarketplaceCoverageNote/);
  assert.match(module, /hoshilu:languagechange/);

  // marketplace-coverage.mjs側もCOPY/applyMarketplaceCoverageToNodesを
  // exportし、既存の#marketplaceCoverage向けの挙動は変えていない。
  const base = await read('marketplace-coverage.mjs');
  assert.match(base, /export const COPY = \{/);
  assert.match(base, /export function applyMarketplaceCoverageToNodes\(targetNodes, language = selectedLanguage\(\)\)/);
  assert.match(base, /export function applyMarketplaceCoverage\(language = selectedLanguage\(\)\) \{\s*applyMarketplaceCoverageToNodes\(nodes, language\);\s*\}/);
});

// 2026-08-16更新: 実データ(/admin/promotion)で訪問68件中、検索開始まで
// 到達したのは21件(離脱69%)と判明した。離脱のほとんどは初回訪問者の
// はずのセッションに集中していると考えられ、このウィジェットを初回だけ
// 開いた状態で見せると、検索窓の前に13モール分のリストが挟まり、一番
// 見せたい初回訪問者ほど検索窓まで遠くなってしまう。そのため大隆さんの
// 判断で「初回訪問時も閉じたまま」に変更した(検索窓を最優先で見せ、
// モール一覧は見たい人だけタップで開く)。
test('ヒーローウィジェットは初回訪問時も含め常に閉じた状態で表示する(検索窓を優先)', async () => {
  const app = await read('app.js');
  assert.match(app, /const heroMarketplaceCoverageDetails=document\.querySelector\('#heroMarketplaceCoverage'\);/);
  assert.match(app, /if\(heroMarketplaceCoverageDetails\)heroMarketplaceCoverageDetails\.open=false;/);
  // 初回だけ開く挙動は廃止したので、専用のlocalStorageキーはもう使わない
  assert.doesNotMatch(app, /hoshilu_hero_coverage_seen/);
});

test('service-workerがhero-marketplace-coverage.mjsをプリキャッシュ対象に含む', async () => {
  const sw = await read('service-worker.js');
  assert.match(sw, /'\/hero-marketplace-coverage\.mjs'/);
});

test('index.htmlがhero-marketplace-coverage.mjsを読み込む', async () => {
  const html = await read('index.html');
  assert.match(html, /<script type="module" src="\/hero-marketplace-coverage\.mjs"><\/script>/);
});

// 2026-09-03 指示書 §13–17: 第一画面の言葉と、タップで即検索できる検索例6件。
test('第一画面は「欲しいけど、名前が分からない。」と「何が欲しいの？」、検索例は指示書の6件', async () => {
  const [html, app] = await Promise.all([read('index.html'), read('app.js')]);
  assert.match(html, /<p id="heroEyebrow" class="eyebrow">欲しいけど、名前が分からない。<\/p>/);
  // 例文はプレースホルダではなく下の検索例チップが担う(狭い画面で括弧書きが
  // 語の途中で折り返していた。2026-09-03 大隆さん報告)。
  assert.match(html, /placeholder="何が欲しいの？"/);
  assert.match(app, /JA:\{eyebrow:'欲しいけど、名前が分からない。'/);
  for (const example of ['インスタで見た白いバッグ', '韓国っぽいシルバーリング', 'このスクショのマットレス', '自立する本革トート', 'この靴に似たもの', 'SNSで見たピンクのリップ']) {
    assert.ok(app.includes(`'${example}'`), `example missing: ${example}`);
  }
  // 画像が前提の例は文字だけで検索せず、画像選択を開く
  assert.match(app, /elements\.screenshot\.click\(\);/);
  const assets = await read('assets-v147/app.js');
  assert.equal(assets, app, 'public/app.js と assets-v147/app.js は同一');
});

// 2026-09-03 指示書 §18–21「登録は後」: ♡ ホシっとく は登録なしで押せ、押した後に登録導線。
// 🔔 値下がり通知は未登録でも行き止まりにせず、希望額を端末に残して無料登録へ案内する。
test('♡ ホシっとく は登録前に端末へ保存し、押した後だけ登録導線を出す。🔔 は未登録でも行き止まりにしない', async () => {
  const app = await read('app.js');
  assert.match(app, /const KEPT_PRODUCTS_KEY='hoshilu_kept_products';/);
  assert.match(app, /JA:\{keep:'♡ ホシっとく',kept:'♥ ホシった'/);
  assert.match(app, /mediaActions\.append\(createKeepButton\(candidate\)\);/);
  assert.match(app, /new CustomEvent\('hoshilu:wish-saved',\{detail:\{source:'keep'\}\}\)/, 'ホシっとく は wish_saved として計測');
  assert.match(app, /localStorage\.setItem\('hoshilu_pending_watch'/);
  assert.match(app, /cta\.className='watch-login-cta';cta\.href=memberLoginHref\(\)/);
  assert.match(app, /syncMemberWishes=async function\(\)\{await baseSyncMemberWishes\(\);applyPendingWatch\(\);\};/, '登録して戻ったら希望額をそのまま保存');
  const css = await read('ai-search-layout-fix.css');
  assert.match(css, /\.keep-product-button\.kept\{/);
});
