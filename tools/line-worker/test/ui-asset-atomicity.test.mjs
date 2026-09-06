import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicRoot = new URL('../public/', import.meta.url);
const read = (name) => readFile(new URL(name, publicRoot), 'utf8');

test('versioned UI assets are exact copies of their canonical files', async () => {
  const [app, versionedApp, layoutCss, versionedLayoutCss] = await Promise.all([
    read('app.js'),
    read('assets-v147/app.js'),
    read('ai-search-layout-fix.css'),
    read('assets-v126/ai-search-layout-fix.css')
  ]);

  assert.equal(versionedApp, app);
  assert.equal(versionedLayoutCss, layoutCss);
});

test('index loads the atomic versioned app and layout assets', async () => {
  const html = await read('index.html');

  assert.ok(html.includes('href="/assets-v126/ai-search-layout-fix.css?v=126"'));
  assert.ok(html.includes('src="/assets-v147/app.js?v=150"'));
  assert.ok(html.includes('src="/site-i18n.js?v=6"'));
  assert.equal(html.includes('href="/ai-search-layout-fix.css?v=126"'), false);
  assert.equal(html.includes('src="/app.js?v=150"'), false);
  assert.equal(html.includes('/assets-v146/app.js'), false);
  assert.equal(html.includes('/site-i18n.js?v=5'), false);
});

test('service worker precaches canonical and versioned UI assets', async () => {
  const worker = await read('service-worker.js');

  assert.match(worker, /hoshilu-shell-v405/);
  for (const asset of [
    '/app.js',
    '/assets-v147/app.js',
    '/continuous-search.css',
    '/ai-search-layout-fix.css',
    '/assets-v126/ai-search-layout-fix.css'
  ]) {
    assert.ok(worker.includes(`'${asset}'`), `${asset} must be precached`);
  }
  assert.equal(worker.includes("'/assets-v146/app.js'"), false);
});

test('versioned app imports only existing root modules and the offline shell caches them', async () => {
  const [versionedApp, worker] = await Promise.all([
    read('assets-v147/app.js'),
    read('service-worker.js')
  ]);
  const imports = [...versionedApp.matchAll(/^import\s+[^;]+\s+from\s+'([^']+)'/gmu)]
    .map((match) => match[1]);
  assert.ok(imports.length >= 8, 'app dependency imports were not detected');
  for (const specifier of imports) {
    assert.ok(specifier.startsWith('/'), `${specifier} must resolve from the public root`);
    assert.doesNotMatch(specifier, /^\/assets-v147\//u);
    const assetPath = new URL(specifier, 'https://hoshilu.app').pathname;
    await assert.doesNotReject(() => read(assetPath.slice(1)), `${specifier} is not deployed`);
    assert.ok(worker.includes(`'${assetPath}'`), `${specifier} must be available offline`);
  }
});
