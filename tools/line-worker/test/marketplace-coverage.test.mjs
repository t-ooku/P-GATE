import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// v4.2 項目14・15・16: 「主要5モール/ファッション5モール」を廃止し、実際の
// integrated/direct区分に合わせて「まとめて検索2モール/個別に探す11モール」
// へ統一。SHOPLIST/MUSINSAは個別に探すリストから外れ、ロフト・ハンズ・
// マツキヨココカラ・@cosme・ABC-MARTを追加。
test('トップ画面でまとめて検索2モール・個別に探す最大13モールを表示する', async () => {
  const [html, css, module, layout, serviceWorker, app] = await Promise.all([
    read('index.html'),
    read('marketplace-coverage.css'),
    read('marketplace-coverage.mjs'),
    read('lp-layout.mjs'),
    read('service-worker.js'),
    read('app.js')
  ]);

  assert.match(html, /MARKETPLACE COVERAGE/);
  assert.match(html, /まとめて検索/);
  assert.match(html, /個別に探す/);
  for (const mall of ['Amazon', '楽天市場', 'Qoo10', 'SHEIN', 'ZOZOTOWN', 'ロフト', 'ハンズ', 'マツキヨココカラ', '@cosme', 'ABC-MART', 'BUYMA', 'SNKRDUNK']) {
    assert.match(html, new RegExp(`>${mall}<`));
  }
  assert.doesNotMatch(html, />SHOPLIST</);
  assert.doesNotMatch(html, />MUSINSA</);
  assert.match(html, /最大13モール対応/);
  assert.match(html, /まとめて検索2モールと、個別に探す11モールに対応/);
  assert.match(html, /heroMarketplaceIntegratedList[^]*?<li>楽天市場<\/li><li class="marketplace-yahoo"/);
  assert.match(html, /heroMarketplaceDirectList[^]*?<li>Amazon<\/li>/);
  assert.match(html, /class="marketplace-yahoo"><span>Yahoo!ショッピング<\/span>/);
  // 2026-08-19 大隆さん指示: 注記は1行に圧縮(長い説明はダサい)。
  assert.match(html, /出品を確認できた商品は商品ページへ、それ以外は各モールの検索結果へ案内します。/);
  assert.doesNotMatch(html, /HOSHILUが商品をまとめて探して比較します。/);
  assert.doesNotMatch(html, /すべてのジャンルで8モール/);

  assert.match(css, /\.marketplace-groups/);
  assert.match(css, /grid-template-columns: repeat\(13, minmax\(82px, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.marketplace-mobile-line \{\s*display: block/);
  // 2026-08-18: nowrapの固定をやめた。1行に押し込むために文字が
  // clamp(7px,...,9px)まで縮み、実機で読めないという指摘を受けたため、
  // 折り返しを許して文字サイズを優先する方針へ変更した。
  // 代わりに「小さすぎる文字が復活しないこと」を固定する。
  assert.doesNotMatch(css, /font-size: clamp\((?:[0-9]|10)(?:\.\d+)?px,/);
  assert.match(css, /\.marketplace-group > p \{\s*display: none/s);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*grid-template-columns: repeat\(13, max-content\)/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*justify-content: space-between/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*overflow-x: hidden/);
  // 同上。モール名も折り返し可にして11.5px以上を確保する。
  assert.match(css, /\.marketplace-group-direct li \{[\s\S]*font-size: clamp\(11\.5px/);
  assert.doesNotMatch(layout, /item\.setAttribute\('role', 'button'\)/);
  assert.doesNotMatch(layout, /document\.querySelectorAll\('\.marketplace-group li'\)/);
  // UI v3: section order comes from static HTML/CSS grid, not a runtime
  // reorder, to avoid a layout shift after first paint.
  assert.doesNotMatch(layout, /insight\.before\(saleRadar\)/);
  assert.doesNotMatch(layout, /saleRadar\.after\(benefits\)/);
  assert.match(layout, /検索方法/);
  assert.match(html, /class="hoshilu-primary"/);
  // UI v5 (2026-08-07): every section lives in one static column, in the
  // exact same order at every breakpoint - ホシル検索 -> MATCHES -> SALE
  // RADAR -> INSIGHT -> NEWS -> SEARCH AGENT -> MARKETPLACE COVERAGE ->
  // DISCOVERY -> OFFICIAL. Assert the canonical order directly so a future
  // edit can't silently reintroduce a per-breakpoint split.
  const sectionMarkers = [
    ['hoshiluSearch', 'id="hoshiluSearch"'],
    ['MATCHES', 'class="section-title"><div><p class="step">MATCHES'],
    // 2026-08-19 大隆さん指示: HOSHILU BUZZは目立つ箇所へ。検索・結果の直下
    // (SALE RADARより上)の一等地に置き、バズ目当ての若者流入の受け口にする。
    ['HOSHILU BUZZ', '<p class="step">HOSHILU BUZZ'],
    ['SALE RADAR', '<p class="step">HOSHILU SALE RADAR'],
    ['INSIGHT', '<p class="step">HOSHILU INSIGHT'],
    ['NEWS', '<p class="step">HOSHILU NEWS'],
    ['SEARCH AGENT', '<p class="step">HOSHILU SEARCH AGENT'],
    // 2026-08-19 大隆さん指示: MARKETPLACE COVERAGE は検索直下から
    // HOSHILU SEARCH AGENT の直後へ移動(探し方の説明→対応モール一覧の順)。
    ['MARKETPLACE COVERAGE', '<p class="step">MARKETPLACE COVERAGE'],
    ['DISCOVERY', '<p class="step">HOSHILU DISCOVERY'],
    ['OFFICIAL', '<p class="step">HOSHILU OFFICIAL'],
  ];
  const positions = sectionMarkers.map(([name, marker]) => {
    const index = html.indexOf(marker);
    assert.notEqual(index, -1, `missing section marker for ${name}: ${marker}`);
    return index;
  });
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(
      positions[i - 1] < positions[i],
      `${sectionMarkers[i - 1][0]} should come before ${sectionMarkers[i][0]} in the static section order`
    );
  }

  for (const language of ['JA', 'EN', 'ZH', 'KO']) {
    assert.match(module, new RegExp(`${language}: \\{`));
  }
  assert.match(module, /hoshilu:languagechange/);
  assert.match(module, /\['探せるモールが、', 'ひと目で分かる。'\]/);
  assert.match(module, /\['まとめて検索2モールと、', '個別に探す11モールに対応。'\]/);
  assert.match(module, /Up to 13 marketplaces/);
  assert.match(module, /everything else opens each marketplace/);
  assert.match(module, /最多支持13个商城/);
  assert.match(module, /최대 13개 쇼핑몰/);

  assert.match(serviceWorker, /hoshilu-shell-v393/);
  assert.match(app, /AIが見つけた可能性のある商品/);
  assert.match(app, /AI_DISCOVERY|ai_discovery/);
  assert.match(serviceWorker, /marketplace-coverage\.css/);
  assert.match(serviceWorker, /marketplace-coverage\.mjs/);
  assert.match(app, /個別に探す/);
  assert.match(app, /※まとめて検索する場合は、ホシル検索へ。/);
  assert.match(app, /marketplaceFallbackGroup\(directLabel,marketplaceLinks\(allLinks\),directBody,searchJump\)/);
  assert.match(app, /marketplace-fallback-search-jump/);
  assert.match(app, /querySelector\('#hoshiluSearch'\)\?\.scrollIntoView/);
  assert.doesNotMatch(html, /<em>BETA<\/em>|PUBLIC BETA|ベータ版/);
});
