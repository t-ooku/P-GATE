import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedJson } from '../src/bounded-json.mjs';

test('上限内のJSONを読み込み、申告された超過サイズを先に拒否する', async () => {
  const parsed = await readBoundedJson(new Request('https://hoshilu.app/test', {
    method: 'POST', body: JSON.stringify({ tenant: 'itg' })
  }), 100);
  assert.deepEqual(parsed, { ok: true, value: { tenant: 'itg' } });

  const declared = await readBoundedJson(new Request('https://hoshilu.app/test', {
    method: 'POST', headers: { 'content-length': '101' }, body: '{}'
  }), 100);
  assert.deepEqual(declared, { ok: false, error: 'REQUEST_TOO_LARGE' });
});

test('Content-Length未申告でも実測バイト数で超過を拒否する', async () => {
  const oversized = await readBoundedJson(new Request('https://hoshilu.app/test', {
    method: 'POST', body: JSON.stringify({ value: 'あ'.repeat(40) })
  }), 100);
  assert.deepEqual(oversized, { ok: false, error: 'REQUEST_TOO_LARGE' });
});

test('不正JSONと不正UTF-8を拒否する', async () => {
  const malformed = await readBoundedJson(new Request('https://hoshilu.app/test', {
    method: 'POST', body: '{'
  }), 100);
  assert.deepEqual(malformed, { ok: false, error: 'INVALID_JSON' });

  const invalidUtf8 = await readBoundedJson(new Request('https://hoshilu.app/test', {
    method: 'POST', body: new Uint8Array([0xff])
  }), 100);
  assert.deepEqual(invalidUtf8, { ok: false, error: 'INVALID_JSON' });
});
