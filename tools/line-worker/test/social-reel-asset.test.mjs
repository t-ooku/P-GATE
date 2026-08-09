import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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

test('今日の機能紹介リールは縦型・音声付きMP4として同梱する',async()=>{
  const url=new URL('../public/social/hoshilu-feature-reel-13mall-v1.mp4',import.meta.url);
  const info=await stat(url);
  const header=await readFile(url);
  assert.ok(info.size>100_000);
  assert.ok(info.size<10_000_000);
  assert.equal(header.subarray(4,8).toString('ascii'),'ftyp');
  assert.equal(header.includes(Buffer.from('avc1')),true);
  assert.equal(header.includes(Buffer.from('mp4a')),true);
  // 2026-08-09: コンテナ情報だけ正常で映像NALが破損したMP4を見逃したため、
  // 全フレームのデコード確認済み成果物そのものを固定して再混入を防ぐ。
  assert.equal(createHash('sha256').update(header).digest('hex'),'3f2c9683bace3eefb42113908da9c13240456b6d4f5d0119caa3d7e0bb093d88');
});
