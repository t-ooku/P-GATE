import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

test('Instagram向け4モール横断リールは音声付きMP4素材として同梱する',async()=>{
  const url=new URL('../public/social/instagram-reel-cross-market-audio-v2.mp4',import.meta.url);
  const info=await stat(url);
  const header=await readFile(url);
  assert.ok(info.size>100_000);
  assert.ok(info.size<10_000_000);
  assert.equal(header.subarray(4,8).toString('ascii'),'ftyp');
  assert.equal(header.includes(Buffer.from('soun')),true);
  assert.equal(header.includes(Buffer.from('mp4a')),true);
});
