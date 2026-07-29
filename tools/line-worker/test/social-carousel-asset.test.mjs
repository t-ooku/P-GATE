import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

test('Instagram向け4モール横断カルーセル画像は公開可能なPNG素材として同梱される', async () => {
  const url = new URL(
    '../public/social/instagram-ambiguous-four-market-v1.png',
    import.meta.url,
  );
  const info = await stat(url);
  const image = await readFile(url);

  assert.ok(info.size > 100_000);
  assert.ok(info.size < 10_000_000);
  assert.deepEqual(
    image.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
});
