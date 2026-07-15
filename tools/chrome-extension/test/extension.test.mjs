import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const { normalizePwaBase, buildConsultUrl } = await import('../shared.mjs');

test('Chrome拡張はManifest V3と最小権限だけを使う', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'scripting', 'sidePanel', 'storage'].sort());
  assert.equal('host_permissions' in manifest, false);
  assert.equal(manifest.background.type, 'module');
});

test('P-GATE接続先は認証情報のないHTTPSだけを許可する', () => {
  assert.equal(normalizePwaBase('https://p-gate.example/'), 'https://p-gate.example');
  assert.throws(() => normalizePwaBase('http://p-gate.example'), /PWA_URL_INVALID/);
  assert.throws(() => normalizePwaBase('https://user:pass@p-gate.example'), /PWA_URL_INVALID/);
  assert.throws(() => normalizePwaBase('https://p-gate.example/?token=secret'), /PWA_URL_INVALID/);
});

test('質問はHTTPログへ送られないURLフラグメントでPWAへ渡す', () => {
  const built = new URL(buildConsultUrl('https://p-gate.example', 'アメリカのシリアル'));
  assert.equal(built.search, '');
  assert.match(built.hash, /^#q=/);
  assert.equal(new URLSearchParams(built.hash.slice(1)).get('q'), 'アメリカのシリアル');
  assert.equal(new URLSearchParams(built.hash.slice(1)).get('source'), 'chrome_extension');
});

test('拡張画面は外部スクリプトとinnerHTMLを使用しない', () => {
  const files = ['background.js', 'sidepanel.js', 'options.js', 'shared.mjs'];
  for (const file of files) {
    const source = fs.readFileSync(new URL(file, root), 'utf8');
    assert.equal(/innerHTML/.test(source), false, file);
    assert.equal(/(?:import\s+.*from\s+|fetch\s*\(|importScripts\s*\()["']https?:\/\//.test(source), false, file);
  }
  const panel = fs.readFileSync(new URL('sidepanel.html', root), 'utf8');
  assert.equal(/<script[^>]+src=["']https?:/.test(panel), false);
});

test('現在タブから読み取る内容はタイトルと選択文字に限定する', () => {
  const source = fs.readFileSync(new URL('sidepanel.js', root), 'utf8');
  assert.match(source, /document\.title/);
  assert.match(source, /getSelection/);
  assert.equal(/document\.body|innerText|outerHTML|cookie|localStorage/.test(source), false);
});
