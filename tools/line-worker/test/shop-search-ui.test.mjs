import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-09-17 SHOP強化 P0（画面側）: 「ショップ」タブ最上部の横断検索と Seller Dashboard の需要表示。
test('トップの「ショップ」タブは横断検索が一覧より上にあり、通知の「見つかりました」に SHOP_DEMAND_MATCH を数える', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="shopSearch"') < html.indexOf('id="shopDirectory"'));
  assert.match(html, /<form id="shopSearchForm" class="shop-search-form" role="search">/);
  assert.match(html, /<button type="submit" class="shop-search-submit">全ショップから探す<\/button>/);
  assert.match(html, /<link rel="stylesheet" href="\/shop-search\.css\?v=1">/);
  assert.match(html, /<script type="module" src="\/shop-search\.mjs\?v=1"><\/script>/);
  assert.match(readFileSync(new URL('../public/tab-nav.mjs', import.meta.url), 'utf8'), /\['#shopSearch', 'shops'\]/);
  assert.match(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), /\['INSIGHT_NEW_MATCH','PRICE_DROP','SHOP_DEMAND_MATCH'\]/);
  assert.match(readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), /'\/shop-search\.css', '\/shop-search\.mjs'/);
  const client = readFileSync(new URL('../public/shop-search.mjs', import.meta.url), 'utf8');
  assert.match(client, /fetch\(`\/api\/shops\/search\?q=\$\{encodeURIComponent\(value\)\}`/);
  assert.match(client, /fetch\('\/api\/shops\/demand', \{ method: 'POST'/);
  assert.ok(client.includes('`△ ${label}ではない`'));
  const sellerPage = readFileSync(new URL('../src/seller-page.mjs', import.meta.url), 'utf8');
  assert.match(sellerPage, /<h2>HOSHILUで今探されているもの<\/h2>/);
  assert.match(readFileSync(new URL('../public/seller.js', import.meta.url), 'utf8'), /\/api\/seller\/shop\/demand\/offers/);
});
