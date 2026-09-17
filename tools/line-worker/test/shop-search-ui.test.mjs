import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-09-17 SHOP強化 P0（画面側）: 「ショップ」タブ最上部の横断検索と Seller Dashboard の需要表示。
test('トップの「ショップ」タブは横断検索が一覧より上にあり、通知の「見つかりました」に SHOP_DEMAND_MATCH を数える', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="shopSearch"') < html.indexOf('id="shopDirectory"'));
  assert.match(html, /<form id="shopSearchForm" class="shop-search-form" role="search">/);
  assert.match(html, /<button type="submit" class="shop-search-submit">全ショップから探す<\/button>/);
  assert.match(html, /<link rel="stylesheet" href="\/shop-search\.css\?v=2">/);
  assert.match(html, /<script type="module" src="\/shop-search\.mjs\?v=2"><\/script>/);
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
  assert.ok(html.includes('site-i18n.js?v=8') && html.includes('tab-nav.css?v=3') && html.includes('app.js?v=171'));
});
