import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// v4.2 項目14・15・16: 「主要5モール/ファッション5モール」を廃止し、実際の
// integrated/direct区分に合わせて「まとめて検索3モール/個別に探す10モール」
// へ統一。SHOPLIST/MUSINSAは個別に探すリストから外れ、ロフト・ハンズ・
// マツキヨココカラ・@cosme・ABC-MARTを追加。
test('トップ画面でまとめて検索3モール・個別に探す最大13モールを表示する', async () => {
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
  assert.match(html, /class="marketplace-yahoo"><span>Yahoo!<br>ショッピング<\/span>/);
  assert.match(html, /出品を確認できた商品は商品ページへ/);
  assert.match(html, /HOSHILUが商品をまとめて探して比較します。/);
  assert.match(html, /HOSHILUの検索結果には含まれません。各ショップでも同じ条件で探せます。/);
  assert.doesNotMatch(html, /すべてのジャンルで8モール/);

  assert.match(css, /\.marketplace-groups/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.marketplace-mobile-line \{\s*display: block/);
  assert.match(css, /#marketplaceCoverageLead \.marketplace-mobile-line:nth-child\(2\)[\s\S]*white-space: nowrap/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /\.marketplace-group > p \{\s*display: none/s);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.marketplace-group-direct ul \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.marketplace-group-direct li \{[\s\S]*white-space: nowrap/);
  assert.match(layout, /item\.setAttribute\('role', 'button'\)/);
  assert.match(layout, /scrollIntoView\(\{ behavior: 'smooth'/);
  // UI v3: section order comes from static HTML/CSS grid, not a runtime
  // reorder, to avoid a layout shift after first paint.
  assert.doesNotMatch(layout, /insight\.before\(saleRadar\)/);
  assert.doesNotMatch(layout, /saleRadar\.after\(benefits\)/);
  assert.match(layout, /ホシル検索/);
  assert.match(html, /class="hoshilu-primary"/);
  // UI v5 (2026-08-07): every section lives in one static column, in the
  // exact same order at every breakpoint - ホシル検索 -> MATCHES -> SALE
  // RADAR -> INSIGHT -> NEWS -> MARKETPLACE COVERAGE -> SEARCH AGENT ->
  // DISCOVERY -> OFFICIAL. Assert the canonical order directly so a future
  // edit can't silently reintroduce a per-breakpoint split.
  const sectionMarkers = [
    ['hoshiluSearch', 'id="hoshiluSearch"'],
    ['MATCHES', 'class="section-title"><div><p class="step">MATCHES'],
    // 2026-08-07: MARKETPLACE COVERAGE moved above SALE RADAR on request -
    // which malls HOSHILU can search is what a first-time visitor needs to
    // know before any sale feed makes sense.
    ['MARKETPLACE COVERAGE', '<p class="step">MARKETPLACE COVERAGE'],
    ['SALE RADAR', '<p class="step">HOSHILU SALE RADAR'],
    ['INSIGHT', '<p class="step">HOSHILU INSIGHT'],
    ['NEWS', '<p class="step">HOSHILU NEWS'],
    ['SEARCH AGENT', '<p class="step">HOSHILU SEARCH AGENT'],
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
  assert.match(module, /\['まとめて検索3モールと、', '個別に探す10モールに対応。'\]/);
  assert.match(module, /Up to 13 marketplaces/);
  assert.match(module, /Instagram, X, TikTok, and YouTube/);
  assert.match(module, /最多支持13个商城/);
  assert.match(module, /최대 13개 쇼핑몰/);

  assert.match(serviceWorker, /hoshilu-shell-v350/);
  assert.match(app, /AIが見つけた可能性のある商品/);
  assert.match(app, /AI_DISCOVERY|ai_discovery/);
  assert.match(serviceWorker, /marketplace-coverage\.css/);
  assert.match(serviceWorker, /marketplace-coverage\.mjs/);
});
