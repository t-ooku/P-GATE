import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('HOSHILU AI action stays onsite and marketplace buttons use accessible brand colors', async () => {
  const [html, script, styles, layout, worker, app] = await Promise.all([
    read('index.html'), read('ai-search-ui.mjs'), read('ai-search-ui.css'), read('ai-search-layout-fix.css'), read('service-worker.js'), read('app.js')
  ]);
  assert.match(html, /ai-search-ui\.mjs/);
  assert.match(html, /ai-search-ui\.css/);
  assert.match(html, /ai-search-layout-fix\.css/);
  assert.match(script, /HOSHILU AIでも候補を探す/);
  assert.match(script, /#submitButton/);
  assert.doesNotMatch(script, /aistudio|gemini\.google|chatgpt|claude\.ai/i);
  for (const marketplace of ['AMAZON_JP','RAKUTEN_JP','YAHOO_JP','QOO10_JP','SHEIN_JP','ZOZOTOWN_JP','SHOPLIST_JP','MUSINSA_JP','BUYMA_JP','SNKRDUNK_JP']) {
    assert.match(styles, new RegExp(`data-marketplace="${marketplace}"`));
  }
  for (const channel of ['instagram','x','tiktok','youtube','line','gmail']) {
    assert.match(styles, new RegExp(`data-channel="${channel}"`));
  }
  assert.match(styles, /focus-visible/);
  assert.match(layout, /grid-template-columns:minmax\(280px,1fr\) minmax\(220px,270px\) minmax\(360px,1fr\)/);
  assert.match(layout, /@media\(max-width:760px\)/);
  assert.match(worker, /hoshilu-shell-v300/);
  assert.match(script, /function linkDisplayedProducts\(\)/);
  assert.match(script, /product-primary-link/);
  assert.match(script, /target = '_blank'/);
  assert.match(script, /a\.all-marketplaces-button/);
  assert.match(app, /link\.href='#marketplaceFallback'/);
  assert.match(worker, /ai-search-ui\.mjs/);
  assert.match(worker, /ai-search-layout-fix\.css/);
});

test('WHY HOSHILU is concise and official social labels are not duplicated', async () => {
  const html = await read('index.html');
  assert.match(html, /<h2 id="benefitTitle">[^<]+<\/h2>/);
  assert.doesNotMatch(html, /<div class="benefit-grid">/);
  assert.doesNotMatch(html, /official-social-link[^>]*>\s*<span/);
});
