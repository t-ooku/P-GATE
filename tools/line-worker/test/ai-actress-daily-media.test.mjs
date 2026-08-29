import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EXPECTED = Object.freeze({
  mon: 'c4c748a6d4bd78182fe2164fea37826896934f59a7721d2d059dcb19042eeb5c',
  tue: '4319d171d872a45885d39a8a2bc15566a8ccedcd2596ddc97d11aff9f6e45ad0',
  wed: '3dc0d5da783b8bcdc6925ec0f8b32c123a0911494ad317b8ff05f28fc73ffd0a',
  thu: '544a0fe540108cbdfdface9eee528eee5314eecf6719ba6e64062d79ec250690',
  fri: '2367256ef25f806dc636b61ee2651c302165d62f082060bf5af01f1243e3fbf6',
  sat: '04dc93f703b34c35cefaa14a9cf9c7e9c5d5d5b2080c93793e1ec9cb2bcf8641',
  sun: '13a2cbe9421b21866e101a416c60767b0d3d015d051206254e2614deb8368192'
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('the seven daily AI-actress reels are distinct, playable MP4 assets with fixed bytes', async () => {
  const hashes = new Set();
  for (const [day, expectedHash] of Object.entries(EXPECTED)) {
    const bytes = await readFile(new URL(`../public/social/hoshilu-ai-actress-daily-${day}-v1.mp4`, import.meta.url));
    assert.ok(bytes.length > 100_000, `${day} media is unexpectedly small`);
    assert.equal(bytes.subarray(4, 8).toString('ascii'), 'ftyp', `${day} has no MP4 ftyp box`);
    const atoms = bytes.toString('latin1');
    assert.match(atoms, /avc1/u, `${day} has no H.264 track marker`);
    assert.match(atoms, /mp4a/u, `${day} has no AAC track marker`);
    assert.equal(sha256(bytes), expectedHash, `${day} bytes changed without QA/ledger update`);
    hashes.add(expectedHash);
  }
  assert.equal(hashes.size, 7, 'each weekday must use a distinct completed creative');
});

test('rights ledger approves every daily reel and records its exact QA hash', async () => {
  const ledger = await readFile(new URL('../../../marketing/social/HOSHILU_REELS_RIGHTS_LEDGER_2026-08.csv', import.meta.url), 'utf8');
  assert.match(ledger, /hoshilu_model_reference_v2[^\n]+v2=22歳想定/u);
  for (const [day, hash] of Object.entries(EXPECTED)) {
    const row = ledger.split('\n').find((line) => line.startsWith(`hoshilu_ai_actress_daily_${day}_v1,`));
    assert.ok(row, `${day} rights-ledger row is missing`);
    assert.match(row, /,APPROVED,/u);
    assert.match(row, new RegExp(`sha256=${hash}$`, 'u'));
    assert.match(row, /v2 22歳想定/u);
    assert.match(row, /Mixkit無料ライセンス/u);
  }
});

test('the reproducible builder is pinned to the approved v2 portrait and approved music source', async () => {
  const source = await readFile(new URL('../scripts/build-ai-actress-daily-reels.mjs', import.meta.url), 'utf8');
  assert.match(source, /runway\/hoshilu-approved-model-reference-v2\.jpg/u);
  assert.match(source, /hoshilu-reel-9malls-pop-v1\.mp4/u);
  assert.match(source, /10fa067aec79348367ce2036d0f304d7e188b54b80d03b712d73a53dc88eb6f6/u);
  for (const day of Object.keys(EXPECTED)) {
    assert.match(source, new RegExp(`day: '${day}'`, 'u'));
  }
});
