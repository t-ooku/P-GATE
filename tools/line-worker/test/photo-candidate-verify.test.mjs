import test from 'node:test';
import assert from 'node:assert/strict';
import {
  photoCandidateVerifyEnabled, verifiableImageUrl, verifyPhotoCandidates, applyPhotoVerdicts,
  verifyPhotoSearchResult, PHOTO_VERIFY_MAX_CANDIDATES
} from '../src/photo-candidate-verify.mjs';

const KEY = 'k'.repeat(24);
const PHOTO = { mime_type: 'image/jpeg', data: '/9j/4AAQ' };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const item = (n, extra = {}) => ({
  position: n, source: 'HOSHILU', product_name: `商品${n}`, url: `https://item.rakuten.co.jp/s/${n}`,
  image_url: `https://thumbnail.image.rakuten.co.jp/s/${n}.jpg`, price_jpy: 100 * (10 - n), listing: false, ...extra
});
const imageResponse = () => new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
const geminiResponse = (results) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ results }) }] } }]
}), { status: 200, headers: { 'content-type': 'application/json' } });

function fakeFetch(results, calls = []) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) return geminiResponse(results);
    return imageResponse();
  };
}

test('スイッチは既定 false（明示の true と API キーの両方が要る）', () => {
  assert.equal(photoCandidateVerifyEnabled({}), false);
  assert.equal(photoCandidateVerifyEnabled({ GEMINI_API_KEY: KEY }), false);
  assert.equal(photoCandidateVerifyEnabled({ PHOTO_CANDIDATE_VERIFY_ENABLED: 'true' }), false);
  assert.equal(photoCandidateVerifyEnabled({ PHOTO_CANDIDATE_VERIFY_ENABLED: 'true', GEMINI_API_KEY: KEY }), true);
});

test('画像はモールの配信元の https だけ取りに行く', () => {
  assert.ok(verifiableImageUrl('https://thumbnail.image.rakuten.co.jp/a.jpg'));
  assert.ok(verifiableImageUrl('https://item-shopping.c.yimg.jp/i/a.jpg'));
  assert.ok(verifiableImageUrl('https://m.media-amazon.com/images/I/a.jpg'));
  assert.equal(verifiableImageUrl('http://thumbnail.image.rakuten.co.jp/a.jpg'), '');
  assert.equal(verifiableImageUrl('https://evil.example/rakuten.co.jp.jpg'), '');
  assert.equal(verifiableImageUrl('https://rakuten.co.jp.evil.example/a.jpg'), '');
  assert.equal(verifiableImageUrl('https://user:pw@thumbnail.image.rakuten.co.jp/a.jpg'), '');
  assert.equal(verifiableImageUrl('https://169.254.169.254/latest'), '');
});

test('same を上に、different を下げる（消さない）。7 件目以降は動かさない。安い順を付け直す', () => {
  const unified = { items: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => item(n)), price_order: [] };
  const verdicts = new Map([[0, 'different'], [1, 'similar'], [3, 'same']]);
  const out = applyPhotoVerdicts(unified, verdicts);
  assert.deepEqual(out.items.map((row) => row.product_name), ['商品4', '商品2', '商品3', '商品5', '商品6', '商品1', '商品7', '商品8']);
  assert.deepEqual(out.items.map((row) => row.position), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(out.items.length, 8);
  assert.equal(out.items[0].photo_match, 'same');
  assert.equal(out.items[5].photo_match, 'different');
  assert.equal(out.items[2].photo_match, undefined);
  // 安い順: 商品8 が最安（price_jpy 200）→ 新しい position 8
  assert.equal(out.price_order[0], 8);
  assert.deepEqual(out.photo_verify, { applied: true, same: 1, similar: 1, different: 1 });
  // 価格・商品名は変えない
  assert.equal(out.items[0].price_jpy, item(4).price_jpy);
});

test('モデルの答えで並びが変わる。送るのは上位 6 件の画像まで。範囲外の番号・知らない判定は捨てる', async () => {
  const calls = [];
  const items = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => item(n));
  const out = await verifyPhotoCandidates({
    image: PHOTO, items, env: { GEMINI_API_KEY: KEY },
    fetchImpl: fakeFetch([{ i: 1, v: 'different' }, { i: 3, v: 'same' }, { i: 7, v: 'same' }, { i: 2, v: 'maybe' }], calls)
  });
  assert.equal(out.status, 'OK');
  assert.deepEqual([...out.verdicts.entries()], [[0, 'different'], [2, 'same']]);
  const imageCalls = calls.filter((call) => !call.url.startsWith('https://generativelanguage'));
  assert.equal(imageCalls.length, PHOTO_VERIFY_MAX_CANDIDATES);
  const body = JSON.parse(calls.find((call) => call.url.startsWith('https://generativelanguage')).init.body);
  const inline = body.contents[0].parts.filter((part) => part.inline_data);
  assert.equal(inline.length, 1 + PHOTO_VERIFY_MAX_CANDIDATES);
  assert.equal(inline[0].inline_data.data, PHOTO.data);
});

test('時間切れなら今の並びのまま（待たせない）', async () => {
  const slow = async (url, init = {}) => new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const started = Date.now();
  const out = await verifyPhotoCandidates({
    image: PHOTO, items: [item(1), item(2)], env: { GEMINI_API_KEY: KEY }, fetchImpl: slow, timeoutMs: 50
  });
  assert.equal(out.status, 'TIMEOUT');
  assert.equal(out.verdicts.size, 0);
  assert.ok(Date.now() - started < 1000);
});

test('モデルが失敗・JSON でない時は判定なし', async () => {
  const bad = async (url) => String(url).startsWith('https://generativelanguage')
    ? new Response('{}', { status: 500 }) : imageResponse();
  assert.equal((await verifyPhotoCandidates({ image: PHOTO, items: [item(1), item(2)], env: { GEMINI_API_KEY: KEY }, fetchImpl: bad })).status, 'HTTP_500');
  const text = async (url) => String(url).startsWith('https://generativelanguage')
    ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'すみません' }] } }] }), { status: 200 }) : imageResponse();
  assert.equal((await verifyPhotoCandidates({ image: PHOTO, items: [item(1), item(2)], env: { GEMINI_API_KEY: KEY }, fetchImpl: text })).status, 'NO_VERDICT');
});

test('取りに行けない画像（Web の任意ホスト・画像でない応答）は送らない', async () => {
  const calls = [];
  const items = [item(1, { image_url: 'https://example.com/a.jpg' }), item(2, { image_url: '' })];
  const out = await verifyPhotoCandidates({ image: PHOTO, items, env: { GEMINI_API_KEY: KEY }, fetchImpl: fakeFetch([], calls) });
  assert.equal(out.status, 'NO_IMAGES');
  assert.equal(calls.length, 0);
  const html = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
  assert.equal((await verifyPhotoCandidates({ image: PHOTO, items: [item(1), item(2)], env: { GEMINI_API_KEY: KEY }, fetchImpl: html })).status, 'NO_IMAGES');
});

test('スイッチ false・文字の検索では何もしない（外へ取りに行かない）', async () => {
  const calls = [];
  const decorated = {
    search_input_analysis: { applied: true, sources: { image: true } },
    unified_results: { items: [item(1), item(2)], price_order: [1, 2] }
  };
  const off = await verifyPhotoSearchResult(decorated, { image: PHOTO, env: { GEMINI_API_KEY: KEY }, fetchImpl: fakeFetch([], calls) });
  assert.equal(off, decorated);
  const textSearch = { ...decorated, search_input_analysis: { applied: false, sources: {} } };
  const on = { PHOTO_CANDIDATE_VERIFY_ENABLED: 'true', GEMINI_API_KEY: KEY };
  assert.equal(await verifyPhotoSearchResult(textSearch, { image: PHOTO, env: on, fetchImpl: fakeFetch([], calls) }), textSearch);
  assert.equal(calls.length, 0);
});

test('スイッチ true の写真検索: 同じ商品が先頭へ。失敗時は並びを変えず状態だけ残す', async () => {
  const decorated = {
    search_input_analysis: { applied: true, sources: { image: true } },
    unified_results: { items: [item(1), item(2), item(3)], price_order: [3, 2, 1] }
  };
  const on = { PHOTO_CANDIDATE_VERIFY_ENABLED: 'true', GEMINI_API_KEY: KEY };
  const out = await verifyPhotoSearchResult(decorated, { image: PHOTO, env: on, fetchImpl: fakeFetch([{ i: 3, v: 'same' }, { i: 1, v: 'different' }]) });
  assert.deepEqual(out.unified_results.items.map((row) => row.product_name), ['商品3', '商品2', '商品1']);
  const failed = await verifyPhotoSearchResult(decorated, { image: PHOTO, env: on, fetchImpl: async () => { throw new Error('x'); } });
  assert.deepEqual(failed.unified_results.items, decorated.unified_results.items);
  assert.deepEqual(failed.unified_results.photo_verify, { applied: false, status: 'NO_IMAGES' });
});
