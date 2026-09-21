// 2026-09-21 指示書 P2「同等品提案」。
//
// いつものが買えない・高いときに、代わりになりそうな商品を出す。
//
// ここで一番大事なのは **「同じ商品です」と言わないこと**。
// 同一性を判定する材料（JAN・型番の突き合わせ）を HOSHILU は持っていない。
// 持っていない判断を出せば、それは推測になる。
//
// そこで、既にある条件判定（judgeTitle: 商品名に明記された語だけで見る）をそのまま使い、
//   ・何が一致したか
//   ・**何が一致していないか**
// の両方を必ず添えて「近い商品」として出す。違いを隠して勧めない。
//
// 元の商品そのものは候補から外す（同じものを「代わり」として出さない）。

import { readMemberSession } from './member-auth.mjs';
import { searchAcrossShops } from './shop-demand.mjs';

export const ALTERNATIVE_LIMIT = 6;

const jsonResponse = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const sameProduct = (card, item) => {
  const asin = String(item?.product_key || '').trim().toUpperCase();
  if (asin && String(card?.asin || '').trim().toUpperCase() === asin) return true;
  const url = String(item?.product_url || '').trim();
  return Boolean(url) && String(card?.url || '').trim() === url;
};

// 候補を「近い商品」として整える。同一とは言わない。
// 一致しなかった条件が分からない候補は出さない（違いを言えないため）。
export function alternativesFrom(result, item, { limit = ALTERNATIVE_LIMIT } = {}) {
  const cards = [...(result?.exact || []), ...(result?.near || [])];
  const out = [];
  const seen = new Set();
  for (const card of cards) {
    if (!card?.url || seen.has(card.url)) continue;
    if (sameProduct(card, item)) continue;
    if (!Array.isArray(card.matched) || !Array.isArray(card.unmatched)) continue;
    // 一致した条件が1つも無いものは「近い」とも言えない。
    if (!card.matched.length) continue;
    seen.add(card.url);
    out.push({
      product_name: String(card.name || ''),
      image_url: String(card.image || ''),
      url: String(card.url || ''),
      shop: card.shop || null,
      marketplace: String(card.marketplace || ''),
      // 一致と「ちがい」を必ず一緒に返す。片方だけで出さない。
      matched: card.matched.map(String),
      unmatched: card.unmatched.map(String)
    });
    if (out.length >= limit) break;
  }
  return out;
}

// GET /api/member/usual/<id>/alternatives — いつものの代わりになりそうな商品。
// 読み取りだけ。ここで いつもの を作り替えない。
export async function handleUsualAlternativesRoute(request, env, { search = searchAcrossShops } = {}) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/member\/usual\/([a-f0-9]{32})\/alternatives$/u);
  if (!match) return null;
  if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!env?.PRODUCT_DB) return jsonResponse({ ok: false, error: 'MEMBER_STORE_NOT_CONFIGURED' }, 503);
  const member = await readMemberSession(request, env);
  if (!member) return jsonResponse({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, 401);

  let item = null;
  try {
    item = await env.PRODUCT_DB.prepare(
      'SELECT usual_id,product_key,product_name,product_url FROM member_usual_items WHERE member_id=?1 AND usual_id=?2'
    ).bind(member.id, match[1]).first();
  } catch { item = null; }
  if (!item) return jsonResponse({ ok: false, error: 'USUAL_NOT_FOUND' }, 404);

  let result = null;
  try {
    result = await search(env, item.product_name, { limitPerTenant: 20 });
  } catch { result = null; }
  if (!result) {
    // 探せなかっただけ。「近い商品が無い」とは言わない。
    return jsonResponse({ ok: true, measurable: false, alternatives: [] });
  }

  const alternatives = alternativesFrom(result, item);
  return jsonResponse({
    ok: true,
    measurable: true,
    // 画面が「同じ商品」と書けないよう、見出しもここで決めて渡す。
    title: '近い商品',
    note: '商品名に書かれている条件だけで見ています。同じ商品とは限りません。ちがいを確かめてから選んでください。',
    alternatives
  });
}
