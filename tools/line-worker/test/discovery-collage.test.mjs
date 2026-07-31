import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('discovery collage is lightweight, localized, accessible, and cached', async () => {
  const [html, app, css, wishCss, sw, i18n, desktop, mobile] = await Promise.all([
    read('index.html'), read('app.js'), read('discovery.css'), read('wish-carousel.css'),
    read('service-worker.js'), read('site-i18n.js'),
    stat(new URL('../public/hoshilu-discovery-collage.webp', import.meta.url)),
    stat(new URL('../public/hoshilu-discovery-collage-mobile.webp', import.meta.url)),
  ]);
  assert.match(html, /id="discoveryTitle"><span>名前が分からなくても、<\/span><span>記憶から探せる。<\/span>/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /hoshilu-discovery-collage-mobile\.webp/);
  assert.match(html, /見た目、見た場所、使い方。覚えていることから話してください。/);
  assert.match(app, /Appearance, where you saw it, and how it is used/);
  assert.match(app, /外观、看到它的地方、用途/);
  assert.match(app, /생김새, 본 장소, 사용법/);
  assert.match(app, /discoveryExample\.addEventListener/);
  assert.match(app, /function clarificationCard/);
  assert.match(app, /clarification-option/);
  assert.match(app, /resultCards\.push\(clarification\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.hero-visual \{ display: none; \}/);
  assert.match(css, /width: min\(560px/);
  assert.match(css, /h2 span \{ display: block; \}/);
  assert.match(css, /mask-image: radial-gradient/);
  assert.match(css, /white-space: nowrap/);
  assert.match(sw, /hoshilu-shell-v80/);
  assert.match(sw, /marketplace-search-keywords-v2\.mjs/);
  assert.match(app, /buildMarketplaceSearchKeywords/);
  assert.match(sw, /if \(response\.ok\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/seller'\)/);
  assert.match(sw, /url\.pathname === '\/go'/);
  assert.match(sw, /campaign-attribution\.mjs/);
  assert.match(app, /hoshilu_member_search_history/);
  assert.match(app, /function personalizedDiscoveryExample/);
  assert.match(app, /rememberMemberSearch\(elements\.query\.value\)/);
  assert.match(app, /if\(!memberSession\)return''/);
  assert.match(sw, /wish-carousel\.css/);
  assert.ok(
    html.indexOf('id="insightSummary"') < html.indexOf('id="wishList"'),
    'saved keywords should appear directly below the INSIGHT summary'
  );
  assert.match(app, /function wishCycle/);
  assert.match(app, /wishes\.length<=5/);
  assert.match(app, /scrollTop-=cycleHeight/);
  assert.match(wishCss, /max-height: 274px/);
  assert.match(wishCss, /overflow-y: auto/);
  assert.match(html, /id="wishFilter"/);
  assert.match(app, /wishFilter\.addEventListener\('input'/);
  assert.match(app, /wishMatchIndex/);
  assert.match(wishCss, /\.wish-toolbar/);
  assert.match(app, /function shareDiscoveryCard/);
  assert.match(app, /utm_campaign=found_with_hoshilu/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /include\.type='checkbox'/);
  assert.match(app, /include\.checked&&raw/);
  assert.match(app, /share-copy-button/);
  assert.match(app, /function marketplaceFallbackCard/);
  assert.match(app, /4つのモールを横断して探す/);
  assert.match(css, /font-size: clamp\(28px, 7\.4vw, 34px\)/);
  assert.match(css, /minmax\(280px, 34%\)/);
  assert.match(css, /font-size: clamp\(44px, 5vw, 68px\)/);
  assert.match(sw, /hoshilu-discovery-collage\.webp/);
  assert.match(html, /id="journeyTitle"><span>検索する前に、<\/span><span>ホシルに話す。<\/span>/);
  assert.match(html, /確認済み商品ページへ直接案内。通常は主要4モール、ファッションは最大8モールで探せます。/);
  assert.match(app, /Talk to HOSHILU before you search/);
  assert.match(app, /elements\.journey\.forEach/);
  assert.match(app, /copySearchKeywords/);
  assert.match(app, /検索ワードをコピー/);
  assert.match(app, /Find this product on Amazon/);
  assert.match(app, /features:\['找商品','已收藏'\]/);
  assert.match(app, /features:\['호시루 검색','저장'\]/);
  assert.match(html, /class="language-label header-language"/);
  assert.match(html, /HOSHILUはAmazonアソシエイトおよび楽天アフィリエイトのリンクを通じて収入を得る場合があります。/);
  assert.match(html, /広告：Amazon・楽天市場へのリンクにはアフィリエイトリンクが含まれる場合があります。/);
  assert.match(html, /data-i18n="affiliate\.searchNotice"/);
  assert.match(html, /data-i18n="affiliate\.footerDisclosure"/);
  assert.match(i18n, /affiliate\.searchNotice/);
  assert.match(i18n, /affiliate\.footerDisclosure/);
  assert.match(i18n, /Amazon and Rakuten may be affiliate links/);
  assert.match(i18n, /乐天市场/);
  assert.match(i18n, /라쿠텐 시장/);
  assert.match(html, /social-share-targets\.js/);
  assert.match(html, /og\/hoshilu-x-v3\.png/);
  assert.match(html, /twitter:image:alt/);
  assert.match(sw, /social-share-targets\.js/);
  assert.ok(desktop.size < 80_000, `desktop image is ${desktop.size} bytes`);
  assert.ok(mobile.size < 40_000, `mobile image is ${mobile.size} bytes`);
});
