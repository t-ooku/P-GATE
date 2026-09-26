import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasVersionedAsset } from './helpers/asset-version.mjs';

// 2026-09-17 SHOP強化 P0（画面側）: 「ショップ」タブ最上部の横断検索と Seller Dashboard の需要表示。
test('トップの「ショップ」タブは横断検索が一覧より上にあり、通知の「見つかりました」に SHOP_DEMAND_MATCH を数える', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="shopSearch"') < html.indexOf('id="shopDirectory"'));
  assert.match(html, /<form id="shopSearchForm" class="shop-search-form" role="search">/);
  assert.match(html, /<button type="submit" class="shop-search-submit">全ショップから探す<\/button>/);
  assert.match(html, /<link rel="stylesheet" href="\/shop-search\.css\?v=3">/);
  assert.match(html, /<script type="module" src="\/shop-search\.mjs\?v=4"><\/script>/);
  assert.match(readFileSync(new URL('../public/tab-nav.mjs', import.meta.url), 'utf8'), /\['#shopSearch', 'shops'\]/);
  assert.match(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), /\['INSIGHT_NEW_MATCH','PRICE_DROP','SHOP_DEMAND_MATCH'\]/);
  assert.match(readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), /'\/shop-search\.css', '\/shop-search\.mjs'/);
  const client = readFileSync(new URL('../public/shop-search.mjs', import.meta.url), 'utf8');
  assert.match(client, /fetch\(`\/api\/shops\/search\?\$\{params\.toString\(\)\}`/);
  assert.match(client, /fetch\('\/api\/shops\/demand', \{ method: 'POST'/);
  assert.ok(client.includes('`△ ${label}ではない`'));
  const sellerPage = readFileSync(new URL('../src/seller-page.mjs', import.meta.url), 'utf8');
  assert.match(sellerPage, /<h2>HOSHILUで今探されているもの<\/h2>/);
  assert.match(readFileSync(new URL('../public/seller.js', import.meta.url), 'utf8'), /\/api\/seller\/shop\/demand\/offers/);
});

// 2026-09-17 大隆さん指示: 総合検索にジャンル・詳細条件。ヘッダーは 1 段（会員名・ログアウトはマイアカウントへ、「販売者専用」）。
test('総合検索にジャンル・詳細条件があり、ヘッダーは言語と「販売者専用」だけ、会員名・ログアウトはマイアカウントにある', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<details id="shopSearchFilters" class="shop-search-filters">/);
  for (const name of ['genre', 'subgenre', 'color', 'material', 'size', 'brand']) assert.ok(html.includes(`name="${name}"`), name);
  const client = readFileSync(new URL('../public/shop-search.mjs', import.meta.url), 'utf8');
  assert.match(client, /fetch\('\/api\/shops\/filters'/);
  assert.match(client, /function filterParams\(\)/);
  const header = html.slice(html.indexOf('<header class="topbar"'), html.indexOf('</header>'));
  assert.doesNotMatch(header, /id="memberLink"|id="memberLogout"/);
  assert.match(header, /<a class="business-link" href="\/for-sellers" data-i18n="nav\.business">販売者専用<\/a>/);
  const account = html.slice(html.indexOf('id="accountPanel"'), html.indexOf('id="officialSocial"'));
  assert.match(account, /<div id="accountSession" class="account-session"><a id="memberLink" href="\/login\.html">ログイン／無料登録<\/a><button id="memberLogout"/);
  assert.match(readFileSync(new URL('../public/site-i18n.js', import.meta.url), 'utf8'), /'nav\.business':'販売者専用'/);
  assert.match(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), /account:'ログイン／無料登録'/);
  assert.match(readFileSync(new URL('../public/tab-nav.css', import.meta.url), 'utf8'), /\.topbar\{min-height:56px/);
  for (const asset of ['site-i18n.js', 'tab-nav.css', 'assets-v147/app.js']) assert.ok(hasVersionedAsset(html, asset), asset);
});

// 2026-09-17 第2指示書（テスト2・§Seller プライバシー・KPI）: 会員の「ショップで探しているもの」一覧、Seller には 5 人以上の需要だけを条件表示、新 KPI イベント。
test('会員は「ホシってるもの」でショップ需要を見て「やめる」でき、Seller には 5 人以上の需要だけが条件で見え、KPI イベントが記録される', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<div id="shopDemandMine" class="shop-demand-mine hidden" aria-live="polite">/);
  // 2026-09-20 大隆さん指示: 値下がり待ちを先に。ショップ需要は「探しているもの」の中（wishList の直後）に残す。
  assert.ok(html.indexOf('id="entrustedWatches"') < html.indexOf('id="wishList"') && html.indexOf('id="wishList"') < html.indexOf('id="shopDemandMine"'));
  const client = readFileSync(new URL('../public/shop-search.mjs', import.meta.url), 'utf8');
  assert.match(client, /fetch\('\/api\/shops\/demand\/mine'/);
  assert.match(client, /method: 'DELETE'/);
  assert.match(client, /matched \? '見つかりました' : '探しています'/);
  assert.match(client, /claimDemands\(\)\.then\(loadMine\)/);
  assert.match(readFileSync(new URL('../public/shop-search.css', import.meta.url), 'utf8'), /\.shop-demand-mine\{/);
  const sellerJs = readFileSync(new URL('../public/seller.js', import.meta.url), 'utf8');
  assert.match(sellerJs, /data\.below_threshold/);
  assert.match(sellerJs, /#sellerDemandNote/);
  const sellerPage = readFileSync(new URL('../src/seller-page.mjs', import.meta.url), 'utf8');
  assert.match(sellerPage, /同じ条件を5人以上が探している項目だけ/);
  assert.match(sellerPage, /<p id="sellerDemandNote" class="metric-help"><\/p>/);
  const events = readFileSync(new URL('../src/growth-events.mjs', import.meta.url), 'utf8');
  for (const name of ['shop_search_completed', 'shop_demand_saved', 'shop_demand_matched']) assert.ok(events.includes(`'${name}'`), name);
  assert.match(readFileSync(new URL('../src/shop-demand.mjs', import.meta.url), 'utf8'), /export const SELLER_DEMAND_MIN_PEOPLE = 5;/);
});


test('手動掲載のショップ導線は正しい同一サイトの公開ページへ進む', async () => {
 const {sellerShopLink}=await import('../public/seller-shop-link.mjs');
 assert.equal(sellerShopLink({slug:'with-care'}),'/shop/with-care');
 assert.equal(sellerShopLink({slug:'SPL_test',url:'/seller-pilot/shops/SPL_test'}),'/seller-pilot/shops/SPL_test');
 assert.equal(sellerShopLink({slug:'safe',url:'https://evil.example'}),'/shop/safe');
 assert.equal(sellerShopLink({slug:'safe',url:'//evil.example'}),'/shop/safe');
});
