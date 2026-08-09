import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachVerticalTicker, detachVerticalTicker } from '../public/vertical-ticker.mjs';

test('商品一覧を再描画する前に古いtickerのタイマーとリスナーを解除する', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /querySelectorAll\('\.result-track'\)\.forEach\(detachVerticalTicker\)/);

  const added = [];
  const removed = [];
  const row = { getBoundingClientRect: () => ({ height: 100 }), offsetTop: 0 };
  const viewport = {
    scrollTop: 0, scrollHeight: 300, clientHeight: 100, style: {},
    querySelectorAll: () => [row, { ...row, offsetTop: 100 }],
    addEventListener: (type) => added.push(type),
    removeEventListener: (type) => removed.push(type),
    contains: () => false
  };
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervals = new Set();
  globalThis.setInterval = () => { const token = {}; intervals.add(token); return token; };
  globalThis.clearInterval = (token) => intervals.delete(token);
  try {
    attachVerticalTicker(viewport);
    assert.equal(intervals.size, 1);
    assert.equal(added.length, 6);
    detachVerticalTicker(viewport);
    assert.equal(intervals.size, 0);
    assert.deepEqual(removed, added);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
