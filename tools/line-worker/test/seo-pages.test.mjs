import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateSeoPageQuality, renderSeoPage, seoHubPaths, seoPagePaths } from '../src/seo-pages.mjs';

test('検索意図が異なる日本語131ページと英語5ページを提供する', () => {
  assert.equal(seoPagePaths.length, 136);
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    assert.ok(html, path);
    assert.match(html, /<link rel="canonical" href="https:\/\/hoshilu\.app\//);
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, /<form action="\/" method="get" data-seo-search-form>/);
    assert.match(html, /<details>/);
    assert.match(html, /data-seo-article-id=/);
    assert.match(html, /seo-article-analytics\.mjs/);
    assert.match(html, /最終更新|Last updated/);
    assert.match(html, /<table>/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /class="article-toc"/);
    assert.match(html, /class="guide-flow"/);
    assert.match(html, /class="review-check-grid"/);
    assert.match(html, /class="identity-guide"/);
    assert.match(html, /<th scope="col">/);
    assert.match(html, /<td data-label=/);
    assert.match(html, /data-seo-intent=/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.match(html, /og:image" content="https:\/\/hoshilu\.app\/og-hoshilu\.png/);
    assert.doesNotMatch(html, /Amazon公式|楽天公式|Qoo10公式|SHEIN公式/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
  }
});

test('各日本語テーマは検索意図別の固有な図解手順を持つ', () => {
  const japanesePaths = seoPagePaths.filter((path) => path.startsWith('/ja/'));
  const flows = japanesePaths.map((path) => {
    const html = renderSeoPage(path);
    return html.match(/<ol class="guide-flow">([\s\S]*?)<\/ol>/)?.[1] || '';
  });
  assert.equal(new Set(flows).size, japanesePaths.length);
});

test('日本語ガイドハブは131記事を重複なく分類し全記事から戻れる', () => {
  assert.deepEqual(seoHubPaths, ['/ja/guides']);
  const html = renderSeoPage('/ja/guides');
  assert.ok(html);
  assert.match(html, /<link rel="canonical" href="https:\/\/hoshilu\.app\/ja\/guides">/);
  assert.match(html, /<meta name="robots" content="index,follow/);
  assert.match(html, /<h1>商品選び・比較・探し方ガイド<\/h1>/);
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /"@type":"ItemList"/);
  assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/, 'internal SEO links must preserve organic attribution');

  const japanesePaths = seoPagePaths.filter((path) => path.startsWith('/ja/'));
  assert.equal(japanesePaths.length, 131);
  for (const path of japanesePaths) {
    assert.equal((html.match(new RegExp(`href="${path}"`, 'g')) || []).length, 1, `${path} should appear once in the hub`);
    assert.match(renderSeoPage(path), /href="\/ja\/guides"/);
  }
});

test('新規5テーマは商品・価格・口コミ・順位を根拠なく断定しない', () => {
  const paths = [
    '/ja/how-to-check-size-and-installation-space',
    '/ja/check-device-compatibility-before-buying',
    '/ja/find-products-for-small-spaces',
    '/ja/shopping-guide-for-living-alone',
    '/ja/compare-delivery-and-return-conditions'
  ];
  for (const path of paths) {
    const html = renderSeoPage(path);
    assert.ok(html);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /Premium|月額980円/);
  }
});

test('2026-08-21公開のうち更新対象外の9記事は正しい更新日を表示・構造化データへ反映する', () => {
  const published = [
    'find-products-seen-on-social-media', 'find-products-seen-on-tiktok',
    'find-fashion-items-seen-on-instagram', 'find-products-introduced-on-youtube',
    'identify-correct-product-name-from-vague-memory',
    'identify-a-product-someone-else-is-using', 'find-a-product-you-saw-in-a-store',
    'find-a-product-you-saw-in-a-tv-commercial', 'turn-vague-words-into-search-terms'
  ];
  for (const slug of published) {
    const html = renderSeoPage(`/ja/${slug}`);
    assert.match(html, /datetime="2026-08-21"/);
    assert.match(html, /"dateModified":"2026-08-21"/);
  }
});


test('2026-08-22公開の5記事は固有の意図・図解・更新日・品質基準を満たす', () => {
  const published = [
    'find-korean-cosmetics-without-product-name',
    'find-korean-style-fashion-by-features',
    'find-products-used-by-favorite-idol',
    'find-fan-activity-goods-by-purpose',
    'shopping-guide-for-students-on-a-budget'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-22"/);
    assert.match(html, /"dateModified":"2026-08-22"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    const intent = html.match(/data-seo-intent="([^"]+)"/)?.[1];
    assert.ok(intent);
    intents.add(intent);
  }
  assert.equal(intents.size, published.length);
});

test('2026-08-23公開の口コミ2記事・ランキング3記事は固有意図と安全基準を満たす', () => {
  const reviews = [
    'read-korean-cosmetics-reviews-by-skin-type',
    'read-korean-fashion-size-reviews'
  ];
  const rankings = [
    'use-korean-cosmetics-rankings-safely',
    'use-fan-goods-rankings-by-purpose',
    'use-student-commute-item-rankings'
  ];
  const intents = new Set();
  for (const slug of [...reviews, ...rankings]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-23"/);
    assert.match(html, /"dateModified":"2026-08-23"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_review_guide_view"/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|絶対おすすめ/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  for (const slug of reviews) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="review-guide"/);
  for (const slug of rankings) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="ranking-guide"/);
});

test('2026-08-23の新規記事はハブと同一検索意図クラスタへつながる', () => {
  const reviews = ['read-korean-cosmetics-reviews-by-skin-type', 'read-korean-fashion-size-reviews'];
  const rankings = ['use-korean-cosmetics-rankings-safely', 'use-fan-goods-rankings-by-purpose', 'use-student-commute-item-rankings'];
  for (const slug of [...reviews, ...rankings]) {
    const html = renderSeoPage('/ja/' + slug);
    assert.match(html, /href="\/ja\/guides"/);
    const nav = html.match(/<nav class="related"[\s\S]*?<\/nav>/)?.[0] || '';
    const links = [...nav.matchAll(/href="(\/ja\/(?!guides)[^"]+)"/g)].map((match) => match[1]);
    assert.equal(links.length, 3);
    assert.equal(new Set(links).size, 3);
  }
  for (const slug of rankings) {
    const html = renderSeoPage('/ja/' + slug);
    for (const candidate of rankings.filter((other) => other !== slug)) assert.ok(html.includes('href="/ja/' + candidate + '"'));
  }
});

test('2026-08-24公開の口コミ1記事・ランキング2記事・購入先比較2記事は固有意図と安全基準を満たす', () => {
  const reviews = ['read-wireless-earphone-reviews-by-use'];
  const rankings = ['use-korean-fashion-rankings-by-item', 'compare-qoo-and-shein-rankings-for-korean-trends'];
  const comparisons = ['compare-korean-cosmetics-across-malls', 'compare-korean-fashion-purchase-sites'];
  const intents = new Set();
  for (const slug of [...reviews, ...rankings, ...comparisons]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-24"/);
    assert.match(html, /"dateModified":"2026-08-24"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_review_guide_view"/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|絶対おすすめ|最安(?:値)?です/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  for (const slug of reviews) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="review-guide"/);
  for (const slug of rankings) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="ranking-guide"/);
  for (const slug of comparisons) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="comparison-guide"/);
});


test('2026-08-25公開のカテゴリ選び方3記事・比較2記事は固有意図と安全基準を満たす', () => {
  const selection = [
    'choose-commute-backpack-by-load-and-size',
    'choose-desk-light-by-space-and-adjustment',
    'choose-storage-box-by-space-and-opening'
  ];
  const comparisons = [
    'compare-mobile-batteries-by-capacity-weight-and-ports',
    'compare-home-office-desks-by-size-and-cable-routing'
  ];
  const intents = new Set();
  for (const slug of [...selection, ...comparisons]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-25"/);
    assert.match(html, /"dateModified":"2026-08-25"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|売れ筋No\.1|絶対おすすめ|最安(?:値)?です/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  for (const slug of selection) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="shopping-guide"/);
  for (const slug of comparisons) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="comparison-guide"/);
});


test('2026-08-26公開のHOSHILU機能活用5記事は本番導線・固有意図・安全基準を満たす', () => {
  const published = [
    'use-hoshilu-buzz-for-product-discovery',
    'use-hoshilu-sale-radar-before-shopping',
    'install-hoshilu-as-a-web-app',
    'choose-ai-check-or-quick-search-in-hoshilu',
    'use-hoshilu-mall-coverage-to-continue-searching'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-26"/);
    assert.match(html, /"dateModified":"2026-08-26"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-article-type="feature-guide"/);
    assert.match(html, /data-seo-feature-link/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|売れ筋No\.1|絶対おすすめ|最安(?:値)?です/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  assert.match(renderSeoPage('/ja/use-hoshilu-buzz-for-product-discovery'), /href="\/buzz" data-seo-feature-link/);
});

test('2026-08-27公開のカテゴリ選び方3記事・比較2記事は固有意図と安全基準を満たす', () => {
  const selection = [
    'choose-reusable-water-bottle-by-capacity-and-cleaning',
    'choose-folding-umbrella-by-open-size-and-weight',
    'choose-frying-pan-by-heat-source-size-and-weight'
  ];
  const comparisons = [
    'compare-carry-on-suitcases-by-size-weight-and-wheels',
    'compare-cordless-vacuums-by-floor-weight-and-maintenance'
  ];
  const intents = new Set();
  for (const slug of [...selection, ...comparisons]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-27"/);
    assert.match(html, /"dateModified":"2026-08-27"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|売れ筋No\.1|絶対おすすめ|最安(?:値)?です/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  for (const slug of selection) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="shopping-guide"/);
  for (const slug of comparisons) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="comparison-guide"/);
});

test('2026-08-28公開のカテゴリ選び方3記事・比較2記事は固有意図と安全基準を満たす', () => {
  const selection = [
    'choose-rice-cooker-by-servings-size-and-cleaning',
    'choose-office-chair-by-desk-body-and-adjustments',
    'choose-hair-dryer-by-weight-controls-and-storage'
  ];
  const comparisons = [
    'compare-air-purifiers-by-room-filter-and-maintenance',
    'compare-robot-vacuums-by-floor-threshold-and-maintenance'
  ];
  const intents = new Set();
  for (const slug of [...selection, ...comparisons]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-28"/);
    assert.match(html, /"dateModified":"2026-08-28"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|売れ筋No\.1|絶対おすすめ|最安(?:値)?です/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  for (const slug of selection) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="shopping-guide"/);
  for (const slug of comparisons) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="comparison-guide"/);
});

test('2026-08-29公開のカテゴリ選び方3記事・比較2記事は固有意図と安全基準を満たす', () => {
  const selection = [
    'choose-electric-kettle-by-capacity-pouring-and-cleaning',
    'choose-curtains-by-window-size-hanging-and-care',
    'choose-laptop-stand-by-desk-device-and-adjustment'
  ];
  const comparisons = [
    'compare-computer-monitors-by-space-ports-and-stand',
    'compare-wireless-headphones-by-fit-controls-and-charging'
  ];
  const intents = new Set();
  for (const slug of [...selection, ...comparisons]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.match(html, /datetime="2026-08-29"/);
    assert.match(html, /"dateModified":"2026-08-29"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /Premium|月額980円|人気No\.1|売れ筋No\.1|絶対おすすめ|最安(?:値)?です/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, 5);
  for (const slug of selection) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="shopping-guide"/);
  for (const slug of comparisons) assert.match(renderSeoPage('/ja/' + slug), /data-seo-article-type="comparison-guide"/);
});

test('2026-08-29公開の新機能5記事は画像・投稿URL・継続検索の本番仕様を正確に案内する', () => {
  const imageSlugs = [
    'use-hoshilu-camera-search',
    'search-products-from-saved-images',
    'search-products-from-screenshots'
  ];
  const socialSlug = 'search-products-from-public-social-post-urls';
  const persistentSlug = 'use-hoshilu-search-until-found';
  const published = [...imageSlugs, socialSlug, persistentSlug];
  const intents = new Set();
  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.ok(html);
    assert.match(html, /datetime="2026-08-29"/);
    assert.match(html, /"dateModified":"2026-08-29"/);
    assert.match(html, /data-seo-article-type="feature-guide"/);
    assert.match(html, /href="\/#hoshiluSearch" data-seo-feature-link/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/);
    assert.doesNotMatch(html, /Google Lens|必ず(?:特定|見つか)ります[。！]|100％|完全匿名|最安(?:値)?です|人気No\.1/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, published.length);

  for (const slug of imageSlugs) {
    const html = renderSeoPage('/ja/' + slug);
    assert.match(html, /JPEG/);
    assert.match(html, /PNG/);
    assert.match(html, /WebP/);
    assert.match(html, /HEIC/);
    assert.match(html, /EXIF/);
    assert.match(html, /位置情報/);
    assert.match(html, /保存しません/);
    assert.match(html, /Google Cloud VisionはWeb画像照合から名称の手がかり/);
    assert.match(html, /Google Gemini APIは名称・ブランド・特徴・検索語の仮説を整理/);
    assert.match(html, /価格・在庫・購入URLは生成せず/);
  }
  assert.match(renderSeoPage('/ja/search-products-from-screenshots'), /権利と各サービスの利用条件/);

  const social = renderSeoPage('/ja/' + socialSlug);
  for (const service of ['Instagram', 'TikTok', 'X', 'Threads', 'Facebook', 'Pinterest']) {
    assert.match(social, new RegExp(service));
  }
  assert.match(social, /非公開/);
  assert.match(social, /削除済み/);
  assert.match(social, /非対応形式/);
  assert.match(social, /取得不能/);
  assert.match(social, /各サービスのHOSHILU対応形式に合う公開投稿単体URL/);
  assert.match(social, /すべてのURL形式に対応するものではありません/);
  assert.match(social, /画像/);
  assert.match(social, /独立して意味の通る一言/);
  assert.match(social, /投稿URLはHOSHILUへ保存しません/);
  assert.match(social, /Google Gemini API[^。]*名称・ブランド・特徴・検索語の仮説を整理/);
  assert.match(social, /価格・在庫・購入URLは生成しません/);
  assert.doesNotMatch(social, /Google Cloud Vision/);

  const persistent = renderSeoPage('/ja/' + persistentSlug);
  assert.match(persistent, /15分ごと/);
  assert.match(persistent, /初回確認[^<。]*現在の候補[^<。]*基準/);
  assert.match(persistent, /初回確認で得た現在の候補は通知せず/);
  assert.match(persistent, /新しく条件へ一致した実在商品/);
  assert.match(persistent, /以前通知した商品を除/);
  assert.match(persistent, /値下げ通知ではなく/);
  assert.match(persistent, /保証しません/);
});

test('2026-08-30公開の新機能5記事はSNS別URL・画像絞り込み・保存条件管理の本番仕様に一致する', () => {
  const socialSlugs = [
    'search-products-from-instagram-post-urls',
    'search-products-from-tiktok-video-urls',
    'search-products-from-x-post-urls'
  ];
  const imageSlug = 'search-one-product-from-photo-with-multiple-items';
  const managementSlug = 'manage-hoshilu-search-until-found-conditions';
  const published = [...socialSlugs, imageSlug, managementSlug];
  const intents = new Set();

  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.ok(html);
    assert.match(html, /datetime="2026-08-30"/);
    assert.match(html, /"dateModified":"2026-08-30"/);
    assert.match(html, /data-seo-article-type="feature-guide"/);
    assert.match(html, /href="\/#hoshiluSearch" data-seo-feature-link/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/);
    assert.doesNotMatch(html, /Premium|月額980円|最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, published.length);

  const instagram = renderSeoPage('/ja/search-products-from-instagram-post-urls');
  assert.match(instagram, /Instagram/);
  assert.match(instagram, /公開投稿またはリール/);
  assert.match(instagram, /プロフィールURL/);
  assert.match(instagram, /非公開・削除済み・取得不能/);
  assert.match(instagram, /投稿URLはHOSHILUへ保存せず/);
  assert.match(instagram, /Google Gemini API/);
  assert.doesNotMatch(instagram, /Google Cloud Vision/);

  const tiktok = renderSeoPage('/ja/search-products-from-tiktok-video-urls');
  assert.match(tiktok, /TikTok/);
  assert.match(tiktok, /動画URLまたは共有URL/);
  assert.match(tiktok, /非公開・削除済み・取得不能/);
  assert.match(tiktok, /YouTube動画URL/);
  assert.match(tiktok, /投稿URLは保存せず/);
  assert.match(tiktok, /Google Gemini API/);

  const xPost = renderSeoPage('/ja/search-products-from-x-post-urls');
  assert.match(xPost, /status ID/);
  assert.match(xPost, /保護されたアカウント/);
  assert.match(xPost, /削除済み・取得不能/);
  assert.match(xPost, /投稿URLは保存せず/);
  assert.match(xPost, /Google Gemini API/);

  const image = renderSeoPage('/ja/' + imageSlug);
  for (const format of ['JPEG', 'PNG', 'WebP', 'HEIC', 'EXIF']) assert.match(image, new RegExp(format));
  assert.match(image, /位置情報/);
  assert.match(image, /HOSHILUにも保存されません/);
  assert.match(image, /Google Cloud Vision/);
  assert.match(image, /Google Gemini API/);
  assert.match(image, /端末の編集機能/);

  const management = renderSeoPage('/ja/' + managementSlug);
  assert.match(management, /「見つかるまで探す条件」の一覧/);
  assert.match(management, /ON・OFF/);
  assert.match(management, /条件の変更/);
  assert.match(management, /解除/);
  assert.match(management, /15分ごとの確認処理/);
  assert.match(management, /15分以内に完了する保証はありません/);
  assert.match(management, /初回確認では現在の候補を基準/);
  assert.match(management, /新しく一致した実在商品/);
  assert.match(management, /アプリ内と接続済みのLINE・メール/);
});

test('2026-08-31公開のカテゴリ選び方5記事は固有意図と安全基準を満たす', () => {
  const published = [
    'choose-microwave-oven-by-space-capacity-and-cleaning',
    'choose-refrigerator-by-space-capacity-and-door',
    'choose-washing-machine-by-space-load-and-maintenance',
    'choose-tablet-by-screen-storage-and-connectivity',
    'choose-printer-by-purpose-ink-and-connectivity'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.ok(html);
    assert.match(html, /datetime="2026-08-31"/);
    assert.match(html, /"dateModified":"2026-08-31"/);
    assert.match(html, /data-seo-article-type="shopping-guide"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/);
    assert.doesNotMatch(html, /Premium|月額980円|最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, published.length);
});

test('2026-09-01公開のモール横断・購入条件5記事は固有意図と安全基準を満たす', () => {
  const published = [
    'search-same-product-by-code-across-malls',
    'compare-official-stores-and-marketplace-sellers',
    'compare-new-used-refurbished-and-outlet-products',
    'compare-domestic-and-parallel-import-products',
    'compare-bundle-quantities-and-unit-conditions'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.ok(html);
    assert.match(html, /datetime="2026-09-01"/);
    assert.match(html, /"dateModified":"2026-09-01"/);
    assert.match(html, /data-seo-cluster="marketplace-purchase-check"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /data-seo-section-event="seo_comparison_view"/);
    assert.match(html, /販売ページ/);
    assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/);
    assert.doesNotMatch(html, /Premium|月額980円|最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|webp)/i);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)?.[1]);
  }
  assert.equal(intents.size, published.length);
});

test('既存の写真記事は直接画像入力と競合せず補足の一言に特化し、新しい3ガイドへ案内する', () => {
  const path = '/ja/find-a-product-from-a-photo-or-screenshot';
  const html = renderSeoPage(path);
  assert.ok(html);
  assert.match(html, /<h1>画像から商品検索を補う一言を作るコツ<\/h1>/);
  assert.match(html, /datetime="2026-08-29"/);
  assert.match(html, /"dateModified":"2026-08-29"/);
  assert.match(html, /data-seo-intent="write_supporting_words_for_image_search"/);
  assert.match(html, /data-seo-cluster="hoshilu-image-search"/);
  assert.match(html, /data-seo-article-type="how-to"/);
  for (const format of ['JPEG', 'PNG', 'WebP']) assert.match(html, new RegExp(format));
  assert.match(html, /画像の内容をすべて文章へ置き換える必要はありません/);
  assert.doesNotMatch(html, /HOSHILUは文章で入力した条件から候補を探します/);

  const linkedGuides = [
    '/ja/use-hoshilu-camera-search',
    '/ja/search-products-from-saved-images',
    '/ja/search-products-from-screenshots'
  ];
  const related = html.match(/<nav class="related"[\s\S]*?<\/nav>/)?.[0] || '';
  for (const linkedPath of linkedGuides) {
    assert.equal((related.match(new RegExp(`href="${linkedPath}"`, 'g')) || []).length, 1);
  }

  const intents = [path, ...linkedGuides].map((pagePath) =>
    renderSeoPage(pagePath).match(/data-seo-intent="([^"]+)"/)?.[1]
  );
  assert.equal(new Set(intents).size, intents.length);
});

test('旧記事にも直接画像入力を反映し、文章入力だけという旧説明を残さない', () => {
  const social = renderSeoPage('/ja/find-products-seen-on-social-media');
  assert.match(social, /スクリーンショットがあれば画像として直接追加できます/);
  assert.match(social, /JPEG・PNG・WebP画像をHOSHILUへ直接追加/);

  const cosmetics = renderSeoPage('/ja/find-korean-cosmetics-without-product-name');
  assert.match(cosmetics, /JPEG・PNG・WebP/);
  assert.match(cosmetics, /写真やスクリーンショットをHOSHILUへ直接追加/);
  assert.doesNotMatch(cosmetics, /HOSHILUは文章で入力した条件から候補を探します/);
  assert.doesNotMatch(cosmetics, /画像に写る内容を言葉へ置き換えてください/);
});

test('サイトマップはガイドハブ・全SEOページ・canonicalの法的ページを含む', () => {
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const path of seoPagePaths) assert.match(sitemap, new RegExp(`<loc>https://hoshilu\\.app${path}</loc>`));
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/ja\/guides<\/loc>\s*<lastmod>2026-09-03<\/lastmod>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/privacy<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/terms<\/loc>/);
  assert.doesNotMatch(sitemap, /<loc>[^<]+\.html<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 144);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/buzz<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/for-sellers<\/loc>/);
});

test('新規5記事はハブと同一クラスタの関連記事へ重複なくつながる', () => {
  const youth = [
    'find-korean-cosmetics-without-product-name',
    'find-korean-style-fashion-by-features',
    'find-products-used-by-favorite-idol',
    'find-fan-activity-goods-by-purpose'
  ];
  const published = [...youth, 'shopping-guide-for-students-on-a-budget'];
  for (const slug of published) {
    const html = renderSeoPage('/ja/' + slug);
    assert.match(html, /href="\/ja\/guides"/);
    const nav = html.match(/<nav class="related"[\s\S]*?<\/nav>/)?.[0] || '';
    const articleLinks = [...nav.matchAll(/href="(\/ja\/(?!guides)[^"]+)"/g)].map((match) => match[1]);
    assert.equal(articleLinks.length, 3);
    assert.equal(new Set(articleLinks).size, 3);
  }
  for (const slug of youth) {
    const html = renderSeoPage('/ja/' + slug);
    for (const candidate of youth.filter((other) => other !== slug)) {
      assert.ok(html.includes('href="/ja/' + candidate + '"'));
    }
  }
});
test('スマホ比較表は横スクロールではなく行カードへ変換するCSSを持つ', () => {
  const css = readFileSync(new URL('../public/seo-article.css', import.meta.url), 'utf8');
  assert.match(css, /td::before\s*\{\s*content:\s*attr\(data-label\)/);
  assert.match(css, /table, tbody, tr, td\s*\{\s*display:\s*block/);
  assert.doesNotMatch(css, /margin-right:\s*-1rem/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.breadcrumbs a\s*\{[^}]*display:\s*inline-flex[^}]*min-height:\s*44px/s);
  assert.match(css, /\.guide-hub-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.guide-hub-grid a\s*\{[^}]*min-height:\s*108px[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.guide-hub-grid\s*\{\s*grid-template-columns:\s*1fr/);
});

test('Service Workerは存在しない旧SEO素材をprecacheしない', () => {
  const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /seo-pages\.css|seo\/hoshilu-seo-hero-v1|seo\/hoshilu-category-guide-v1/);
  assert.match(worker, /seo-article\.css/);
  assert.match(worker, /seo-article-analytics\.mjs/);
});

test('英語版がない日本語記事へ存在しないalternateを出さない', () => {
  const html = renderSeoPage('/ja/search-product-by-model-number');
  assert.match(html, /hreflang="ja"/);
  assert.doesNotMatch(html, /hreflang="en"/);
});

test('未定義SEOパスは通常ルーティングへ戻す', () => {
  assert.equal(renderSeoPage('/ja/not-defined'), null);
  assert.equal(renderSeoPage('/api/config'), null);
});

test('受け入れ検証アクセスは記事の実KPIではなくQAへ分類できる', () => {
  const analytics = readFileSync(new URL('../public/seo-article-analytics.mjs', import.meta.url), 'utf8');
  assert.match(analytics, /requestedSource\.startsWith\('codex'\)/);
  assert.match(analytics, /requestedMedium === 'qa'/);
  assert.match(analytics, /eventMedium = isQaVisit \? 'qa' : 'internal'/);
  assert.match(analytics, /campaign: searchIntent/);
  assert.match(analytics, /IntersectionObserver/);
  assert.match(analytics, /seo_feature_transition/);
});

test('2026-09-01公開のセール準備7記事は固有意図と安全基準を満たす', () => {
  const published = [
    'prepare-for-qoo10-mega-sale',
    'use-yahoo-shopping-point-days',
    'prepare-for-rakuten-sale-events',
    'prepare-for-amazon-sale-events',
    'plan-shopping-with-ec-sale-calendar',
    'check-if-sale-price-is-really-cheaper',
    'prepare-for-year-end-sale-season'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.ok(html);
    assert.match(html, /datetime="2026-09-01"/);
    assert.match(html, /data-seo-cluster="sale-timing"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /販売ページ/);
    assert.match(html, /キャンペーンページ/);
    assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ|必ず安く/);
    assert.doesNotMatch(html, /Amazon公式|楽天公式|Qoo10公式|SHEIN公式/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)[1]);
  }
  assert.equal(intents.size, published.length);
});

test('2026-09-03公開の横断検索9記事は固有意図・まとめて探す導線・誇張なしの表現を満たす', () => {
  const published = [
    'stop-checking-shopping-sites-one-by-one',
    'search-products-across-multiple-shopping-sites',
    'cross-search-ec-sites',
    'compare-online-shopping-sites',
    'compare-products-across-online-shops',
    'compare-amazon-and-rakuten',
    'compare-amazon-and-qoo10',
    'compare-qoo10-and-rakuten',
    'find-products-at-a-lower-price'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = `/ja/${slug}`;
    const html = renderSeoPage(path);
    assert.ok(html, path);
    assert.match(html, /datetime="2026-09-03"/);
    assert.match(html, /"dateModified":"2026-09-03"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.match(html, /HOSHILUでまとめて探す/, `${slug} must carry the cross-search CTA`);
    assert.match(html, /この条件でまとめて探す/);
    assert.match(html, /販売ページ/);
    assert.match(html, /href="\/ja\/guides"/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ/);
    assert.doesNotMatch(html, /全(?:て|ての)?(?:通販|EC)サイトを統合/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(/data-seo-intent="([^"]+)"/.exec(html)[1]);
    assert.match(html, /data-seo-cluster="cross-market-search"/);
  }
  assert.equal(intents.size, published.length);
});

test('全日本語ガイドが「まとめて探す」導線を持つ', () => {
  for (const path of seoPagePaths.filter((entry) => entry.startsWith('/ja/'))) {
    assert.match(renderSeoPage(path), /HOSHILUでまとめて探す/, path);
  }
  assert.match(renderSeoPage('/ja/guides'), /HOSHILUでまとめて探す/);
});

// 2026-09-03 大隆さん指示: セラー向けのSEO記事を出す。最終的にセラーが集まる
// ことが目的で、そのためにユーザーが集まる必要がある、という順序。
// 各記事は /for-sellers の相談フォームへ落とす。送客規模は誇張しない。
test('出品者向け6記事は相談フォームへ落とし、集客効果を約束しない', () => {
  const published = [
    'sell-more-on-ec-malls',
    'why-your-product-page-is-not-found',
    'get-found-when-buyers-dont-know-the-product-name',
    'find-unmet-demand-for-your-products',
    'compare-ec-mall-fees-for-sellers',
    'parallel-import-selling-in-japan'
  ];
  const intents = new Set();
  for (const slug of published) {
    const path = `/ja/${slug}`;
    const html = renderSeoPage(path);
    assert.ok(html, path);
    assert.match(html, /datetime="2026-09-03"/);
    assert.match(html, /data-seo-article-type="seller-guide"/);
    assert.match(html, /data-seo-cluster="seller-growth"/);
    // 相談フォームへの導線を必ず持つ
    assert.match(html, /href="\/for-sellers" data-seo-feature-link/);
    assert.match(html, /HOSHILUへの掲載を相談する/);
    // 送客・売上の約束はしない
    assert.doesNotMatch(html, /売上が(?:必ず|確実に)?(?:上がります|増えます)/);
    assert.doesNotMatch(html, /集客(?:が|も)?(?:必ず|確実に)?増えます/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|絶対おすすめ/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85);
    intents.add(/data-seo-intent="([^"]+)"/.exec(html)[1]);
  }
  assert.equal(intents.size, published.length);
  // 出品者向けはハブ内で買い手向けと分けて並べる
  const hub = renderSeoPage('/ja/guides');
  assert.match(hub, /<h2>出品者・メーカー向け<\/h2>/);
});

// 2026-09-04: 直近30日の実数でSEO記事152閲覧(107人)に対し検索導線の利用が0件、
// 記事中盤の比較セクション到達も19件だった。CTAが記事の約7割地点にしかなく、
// 大半の読者は見ずに離脱している。結論直後にも ?q= 付きCTAを置き、
// ?q= 着地の自動検索(#147)へつなぐ。
test('全記事で結論の直後に ?q= 付きの検索CTAが正確な文言と共に出る', () => {
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const topCta = html.match(/<section class="answer" id="answer">[\s\S]*?<\/section>\s*<p class="top-cta">([\s\S]*?)<\/p>/)?.[1] || '';
    assert.ok(topCta, `${path} must place a top CTA right after the answer section`);
    const query = topCta.match(/href="\/\?q=([^"]+)" data-seo-search-link/)?.[1] || '';
    assert.ok(query, `${path} top CTA must carry a prefilled ?q=`);
    assert.ok(decodeURIComponent(query).length <= 200);
    if (path.startsWith('/ja/')) {
      assert.match(topCta, /楽天市場とYahoo!ショッピングは候補を表示/);
      assert.match(topCta, /Amazon・Qoo10などは同じ条件のまま検索先を開けます/);
    } else {
      assert.match(topCta, /Shows candidates from Rakuten and Yahoo! Shopping/);
    }
  }
});

// 2026-09-05: 結論直後・記事中盤・末尾の3箇所にCTAを置いた後も、直近30日の
// 実数で検索導線クリック(seo_search_transition)が依然0件だった。スクロール
// 位置に関わらず常に見える固定フッターCTAを追加し、既存のdata-seo-search-link
// 計測(seo-article-analytics.mjs)にそのまま乗せる。
test('全記事にスクロール追従の固定検索CTAがあり、既存の計測属性を使う', () => {
  for (const path of seoPagePaths) {
    const html = renderSeoPage(path);
    const stickyCta = html.match(/<div class="sticky-cta">([\s\S]*?)<\/div>\s*<script/)?.[1] || '';
    assert.ok(stickyCta, `${path} must render a sticky footer CTA`);
    const query = stickyCta.match(/href="\/\?q=([^"]+)" data-seo-search-link/)?.[1] || '';
    assert.ok(query, `${path} sticky CTA must carry a prefilled ?q= and reuse data-seo-search-link tracking`);
    assert.ok(decodeURIComponent(query).length <= 200);
  }
});

test('2026-09-05公開のクリエイター募集6記事＋値下げ・クーポン10記事は固有意図・導線・誇張なしを満たす', () => {
  const creators = [
    'pr-post-rules-for-influencers', 'earn-with-shopping-app-review-posts', 'influencer-recruitment-for-small-accounts',
    'how-to-report-and-invoice-creator-rewards', 'screenshot-tips-for-app-review-posts', 'what-to-write-in-price-drop-alert-review'
  ];
  const deals = [
    'get-notified-when-price-drops', 'how-to-set-a-target-price', 'find-coupons-before-checkout', 'coupon-conditions-to-check',
    'sale-notification-only-for-malls-you-use', 'is-it-cheaper-to-wait-for-sale', 'track-price-history-before-buying',
    'prime-day-vs-rakuten-super-sale-vs-mega-wari', 'avoid-fake-discount-displays', 'budget-shopping-for-families-with-price-alerts'
  ];
  const hub = renderSeoPage('/ja/guides');
  assert.match(hub, /id="creators"/);
  const intents = new Set();
  for (const slug of [...creators, ...deals]) {
    const path = '/ja/' + slug;
    const html = renderSeoPage(path);
    assert.ok(html, slug);
    assert.match(html, /datetime="2026-09-05"/);
    assert.match(html, /<figure class="guide-visual"/);
    assert.doesNotMatch(html, /utm_(?:source|medium|campaign|content)/);
    assert.doesNotMatch(html, /最安(?:値)?です|人気No\.1|売れ筋No\.1|絶対おすすめ/);
    assert.ok(evaluateSeoPageQuality(path).total >= 85, slug);
    intents.add(html.match(/data-seo-intent="([^"]+)"/)[1]);
    assert.equal((hub.match(new RegExp(`href="${path}"`, 'g')) || []).length, 1, slug);
  }
  assert.equal(intents.size, creators.length + deals.length);
  for (const slug of creators) {
    const html = renderSeoPage('/ja/' + slug);
    assert.match(html, /data-seo-cluster="creators"/);
    assert.match(html, /href="\/for-creators" data-seo-feature-link/);
    assert.match(html, /1,500円/);
  }
  for (const slug of deals) {
    const html = renderSeoPage('/ja/' + slug);
    assert.match(html, /data-seo-cluster="sale-timing"/);
    assert.match(html, /href="\/" data-seo-feature-link/);
    assert.match(html, /販売ページ|キャンペーンページ/);
  }
});
