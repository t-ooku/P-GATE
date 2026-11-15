// 2026-11-14 Cowork 依頼「写真検索を Google レンズの水準に近づける」第 1 段 3.
// 候補の商品写真と、利用者が撮った写真を、マルチモーダルのモデル 1 回で見比べる。
// - 返すのは候補ごとに same（同じ商品）／similar（似ている）／different だけ。価格・商品名はモデルに作らせない。
// - same を上に、different を下げる（消さない）。見比べるのは上位の最大 6 件のまとまりの中だけ。
// - 時間の上限は 4 秒（画像の取得とモデル呼び出しの合計）。間に合わなければ今の並びのまま（待たせない）。
// - 画像は保存しない（このリクエストの中でだけ使う）。
// - スイッチ PHOTO_CANDIDATE_VERIFY_ENABLED（既定 false）。Cowork が評価セットで確かめてから true にする。
// - モデルは今のもの（GEMINI_PRODUCT_DISCOVERY_MODEL）。上位モデルは段階 2（月 3,000 円上限の仕組み）の後。

import { priceOrder } from './unified-results.mjs';

export const PHOTO_VERIFY_MAX_CANDIDATES = 6;
export const PHOTO_VERIFY_TIMEOUT_MS = 4000;
const MAX_CANDIDATE_IMAGE_BYTES = 600 * 1024;
const VERDICTS = new Set(['same', 'similar', 'different']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// 取りに行くのはモールの商品画像の配信元だけ（Web 検索の結果に入る任意のホストへは取りに行かない）。
const IMAGE_HOST_SUFFIXES = ['rakuten.co.jp', 'yimg.jp', 'media-amazon.com', 'ssl-images-amazon.com'];

export function photoCandidateVerifyEnabled(env = {}) {
  return String(env.PHOTO_CANDIDATE_VERIFY_ENABLED || '') === 'true'
    && String(env.GEMINI_API_KEY || '').length >= 20;
}

export function verifiableImageUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
  const host = url.hostname.toLowerCase();
  return IMAGE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ? url.toString() : '';
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function fetchCandidateImage(url, fetchImpl, signal) {
  try {
    const response = await fetchImpl(url, { signal, redirect: 'error', headers: { accept: 'image/jpeg,image/png,image/webp' } });
    if (!response?.ok) return null;
    const type = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) return null;
    const declared = Number(response.headers?.get?.('content-length') || 0);
    if (declared > MAX_CANDIDATE_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_CANDIDATE_IMAGE_BYTES) return null;
    return { mime_type: type, data: bytesToBase64(bytes) };
  } catch { return null; }
}

const PROMPT = [
  '1枚目は利用者が撮った写真です。2枚目以降は、ネットのお店の商品画像で、それぞれ番号 i が付いています。',
  '各商品画像が、1枚目の写真の商品と比べてどれかだけを答えてください。',
  'same: 同じブランド・同じ商品・同じ種類（味・色・香り）に見える。',
  'similar: 同じブランドや同じ種類の商品だが、味・色・大きさ・入り数などが違う、または画像だけでは決められない。',
  'different: 別の商品。',
  '商品名・価格・説明は書かないでください。JSON だけを返してください。形式: {"results":[{"i":1,"v":"same"}]}'
].join('\n');

function parseVerdicts(payload, indexes) {
  const text = (Array.isArray(payload?.candidates) ? payload.candidates : [])
    .flatMap((candidate) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part) => String(part?.text || '')).join('\n');
  const raw = text.match(/\{[\s\S]*\}/u)?.[0];
  if (!raw) return new Map();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return new Map(); }
  const verdicts = new Map();
  for (const row of Array.isArray(parsed?.results) ? parsed.results : []) {
    const index = Number(row?.i);
    const verdict = String(row?.v || '').toLowerCase();
    if (indexes.has(index) && VERDICTS.has(verdict) && !verdicts.has(index)) verdicts.set(index, verdict);
  }
  return verdicts;
}

// items の上位（最大 6 件）について、i=1.. を items の添字 0.. に対応させた Map を返す。失敗・時間切れは空の Map。
export async function verifyPhotoCandidates({ image, items, env = {}, fetchImpl = fetch, timeoutMs = PHOTO_VERIFY_TIMEOUT_MS } = {}) {
  const result = { verdicts: new Map(), status: 'SKIPPED' };
  if (!image?.data || !image?.mime_type || !Array.isArray(items) || items.length < 2) return result;
  const targets = items.slice(0, PHOTO_VERIFY_MAX_CANDIDATES)
    .map((item, index) => ({ index, url: verifiableImageUrl(item?.image_url) }))
    .filter((target) => target.url);
  if (!targets.length) return { ...result, status: 'NO_IMAGES' };
  const controller = new AbortController();
  let timer = null;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve('TIMEOUT'); }, timeoutMs); });
  const work = (async () => {
    const fetched = await Promise.all(targets.map(async (target) => ({ ...target, image: await fetchCandidateImage(target.url, fetchImpl, controller.signal) })));
    const usable = fetched.filter((target) => target.image);
    if (!usable.length) return { verdicts: new Map(), status: 'NO_IMAGES' };
    const parts = [{ text: PROMPT }, { inline_data: { mime_type: image.mime_type, data: image.data } }];
    for (const target of usable) {
      parts.push({ text: `i=${target.index + 1}` });
      parts.push({ inline_data: { mime_type: target.image.mime_type, data: target.image.data } });
    }
    const model = String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash');
    const thinkingLevel = String(env.GEMINI_PHOTO_THINKING_LEVEL || 'LOW').toUpperCase();
    const generationConfig = { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' };
    if (['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'].includes(thinkingLevel)) generationConfig.thinkingConfig = { thinkingLevel };
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig })
      }
    );
    if (!response?.ok) return { verdicts: new Map(), status: `HTTP_${Number(response?.status) || 0}` };
    const indexes = new Set(usable.map((target) => target.index + 1));
    const byNumber = parseVerdicts(await response.json(), indexes);
    const verdicts = new Map([...byNumber].map(([number, verdict]) => [number - 1, verdict]));
    return { verdicts, status: verdicts.size ? 'OK' : 'NO_VERDICT' };
  })().catch(() => ({ verdicts: new Map(), status: controller.signal.aborted ? 'TIMEOUT' : 'FAILED' }));
  const outcome = await Promise.race([work, deadline]);
  if (timer) clearTimeout(timer);
  if (outcome === 'TIMEOUT') return { verdicts: new Map(), status: 'TIMEOUT' };
  return outcome;
}

// 上位のまとまり（最大 6 件）の中だけで、same → 判定なし/similar → different の順に並べ直す（同じ組の中は今の順）。
// 消さない。7 件目以降は動かさない。position と安い順（price_order）は付け直す。
export function applyPhotoVerdicts(unified, verdicts) {
  const items = Array.isArray(unified?.items) ? unified.items : [];
  if (!(verdicts instanceof Map) || !verdicts.size || !items.length) return unified;
  const block = Math.min(PHOTO_VERIFY_MAX_CANDIDATES, items.length);
  const rank = (verdict) => verdict === 'same' ? 0 : verdict === 'different' ? 2 : 1;
  const head = items.slice(0, block)
    .map((item, index) => ({ item, verdict: verdicts.get(index) || '', index }))
    .sort((a, b) => (rank(a.verdict) - rank(b.verdict)) || (a.index - b.index))
    .map(({ item, verdict }) => (verdict ? { ...item, photo_match: verdict } : { ...item }));
  const reordered = [...head, ...items.slice(block)].map((item, index) => ({ ...item, position: index + 1 }));
  const counts = { same: 0, similar: 0, different: 0 };
  for (const verdict of verdicts.values()) counts[verdict] += 1;
  return {
    ...unified,
    items: reordered,
    price_order: priceOrder(reordered),
    photo_verify: { applied: true, ...counts }
  };
}

// /api/knowledge の写真検索の結果に使う。スイッチが false・写真でない時はそのまま返す。
export async function verifyPhotoSearchResult(decorated, { image, env = {}, fetchImpl = fetch, timeoutMs } = {}) {
  const photoSearch = decorated?.search_input_analysis?.applied === true
    && decorated?.search_input_analysis?.sources?.image === true;
  if (!photoSearch || !image || !photoCandidateVerifyEnabled(env) || !decorated?.unified_results) return decorated;
  const { verdicts, status } = await verifyPhotoCandidates({ image, items: decorated.unified_results.items, env, fetchImpl, timeoutMs });
  if (!verdicts.size) {
    return { ...decorated, unified_results: { ...decorated.unified_results, photo_verify: { applied: false, status } } };
  }
  return { ...decorated, unified_results: applyPhotoVerdicts(decorated.unified_results, verdicts) };
}
