import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicRoot = new URL('../public/', import.meta.url);
const read = (name) => readFile(new URL(name, publicRoot), 'utf8');

test('versioned UI assets are exact copies of their canonical files', async () => {
  const [app, versionedApp, layoutCss, versionedLayoutCss] = await Promise.all([
    read('app.js'),
    read('assets-v142/app.js'),
    read('ai-search-layout-fix.css'),
    read('assets-v125/ai-search-layout-fix.css')
  ]);

  assert.equal(versionedApp, app);
  assert.equal(versionedLayoutCss, layoutCss);
});

test('index loads the atomic versioned app and layout assets', async () => {
  const html = await read('index.html');

  assert.ok(html.includes('href="/assets-v125/ai-search-layout-fix.css?v=125"'));
  assert.ok(html.includes('src="/assets-v142/app.js?v=142"'));
  assert.equal(html.includes('href="/ai-search-layout-fix.css?v=125"'), false);
  assert.equal(html.includes('src="/app.js?v=142"'), false);
});

test('service worker precaches canonical and versioned UI assets', async () => {
  const worker = await read('service-worker.js');

  assert.match(worker, /hoshilu-shell-v400/);
  for (const asset of [
    '/app.js',
    '/assets-v142/app.js',
    '/continuous-search.css',
    '/ai-search-layout-fix.css',
    '/assets-v125/ai-search-layout-fix.css'
  ]) {
    assert.ok(worker.includes(`'${asset}'`), `${asset} must be precached`);
  }
});

test('versioned app imports only existing root modules and the offline shell caches them', async () => {
  const [versionedApp, worker] = await Promise.all([
    read('assets-v142/app.js'),
    read('service-worker.js')
  ]);
  const imports = [...versionedApp.matchAll(/^import\s+[^;]+\s+from\s+'([^']+)'/gmu)]
    .map((match) => match[1]);
  assert.ok(imports.length >= 8, 'app dependency imports were not detected');
  for (const specifier of imports) {
    assert.ok(specifier.startsWith('/'), `${specifier} must resolve from the public root`);
    assert.doesNotMatch(specifier, /^\/assets-v142\//u);
    await assert.doesNotReject(() => read(specifier.slice(1)), `${specifier} is not deployed`);
    assert.ok(worker.includes(`'${specifier}'`), `${specifier} must be available offline`);
  }
});
