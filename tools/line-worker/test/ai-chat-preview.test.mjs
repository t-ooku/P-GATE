import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiChatCandidatePreviews } from '../src/ai-chat-preview.mjs';

const rakutenPayload = { Items: [
  { itemName: '象印 ステンレスマグ 480ml', itemCode: 'shop:1', itemPrice: 2980, itemUrl: 'https://item.rakuten.co.jp/shop/1/', mediumImageUrls: ['https://thumbnail.image.rakuten.co.jp/1.jpg'], availability: 1, postageFlag: 0 },
  { itemName: '画像なし商品', itemCode: 'shop:2', itemPrice: 1000, itemUrl: 'https://item.rakuten.co.jp/shop/2/', mediumImageUrls: [], availability: 1, postageFlag: 1 },
  { itemName: 'サーモス 水筒 500ml', itemCode: 'shop:3', itemPrice: 1980, itemUrl: 'https://item.rakuten.co.jp/shop/3/', mediumImageUrls: ['https://thumbnail.image.rakuten.co.jp/3.jpg'], availability: 1, postageFlag: 1 },
  { itemName: 'タイガー 水筒', itemCode: 'shop:4', itemPrice: 2480, itemUrl: 'https://item.rakuten.co.jp/shop/4/', mediumImageUrls: ['https://thumbnail.image.rakuten.co.jp/4.jpg'], availability: 1, postageFlag: 1 },
  { itemName: '5件目', itemCode: 'shop:5', itemPrice: 100, itemUrl: 'https://item.rakuten.co.jp/shop/5/', mediumImageUrls: ['https://thumbnail.image.rakuten.co.jp/5.jpg'], availability: 1, postageFlag: 1 }
] };
const env = { RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'key', LINK_SIGNING_SECRET: 's'.repeat(64) };
const fetcher = async () => new Response(JSON.stringify(rakutenPayload), { status: 200, headers: { 'content-type': 'application/json' } });

test('AI確認チャットの候補には楽天上位3件の画像・名前・価格が付き、リンクは /go 経由', async () => {
  const previews = await aiChatCandidatePreviews(env, '象印 水筒', { fetcher, createTrackToken: async (payload) => `tok.${payload.j}`, origin: 'https://hoshilu.app', sessionHash: 'h', seed: 'AI_CHAT:x' });
  assert.equal(previews.length, 3);
  assert.equal(previews[0].name, '象印 ステンレスマグ 480ml');
  assert.equal(previews[0].image, 'https://thumbnail.image.rakuten.co.jp/1.jpg');
  assert.equal(previews[0].price, 2980);
  assert.equal(previews[0].tracking_url, 'https://hoshilu.app/go?token=AI_CHAT%3Ax%3A0%3AAI_PREVIEW'.replace('AI_CHAT%3Ax%3A0%3AAI_PREVIEW', encodeURIComponent('tok.AI_CHAT:x:0:AI_PREVIEW')));
  assert.ok(previews.every((p) => p.image && p.name !== '画像なし商品'));
  // 失敗しても候補提示を止めない
  assert.deepEqual(await aiChatCandidatePreviews(env, '象印 水筒', { fetcher: async () => { throw new Error('down'); } }), []);
  assert.deepEqual(await aiChatCandidatePreviews({}, '象印 水筒', { fetcher }), []);
});

test('チャット画面は candidate_previews を吹き出しの直後に描画し、資材の版が上がっている', () => {
  const client = readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  assert.match(client, /result\.candidate_previews/u);
  assert.match(client, /ai-chat-preview-strip/u);
  assert.equal((client.match(/previewLabel:'/gu) || []).length, 4);
  const css = readFileSync(new URL('../public/ai-search-ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.ai-chat-preview-list\{/u);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /ai-search-ui\.mjs\?v=14/u);
  assert.match(html, /ai-search-ui\.css\?v=12/u);
  const server = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(server, /candidate_previews: candidatePreviews/u);
});
