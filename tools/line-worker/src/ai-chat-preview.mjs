// 2026-09-04 大隆さん指示: AI確認チャットで商品名だけ出しても正しいか分からない。
// 候補名で楽天市場を軽く引き、上位3件の「画像・商品名・価格」を参考として同じ吹き出しに出す。
// 検索本体（/api/knowledge）とは別の軽い補助で、失敗しても候補の提示は止めない。
import { searchRakutenMarketplace } from './rakuten-marketplace-api.mjs';

export const AI_CHAT_PREVIEW_LIMIT = 3;
const PREVIEW_TIMEOUT_MS = 3500;

export async function aiChatCandidatePreviews(env, query, { fetcher = fetch, requestId = '', createTrackToken = null, origin = '', sessionHash = '', seed = '' } = {}) {
  const text = String(query || '').trim();
  if (!text) return [];
  let items = [];
  try {
    items = await searchRakutenMarketplace(env, text, fetcher, requestId, { requestTimeoutMs: PREVIEW_TIMEOUT_MS });
  } catch {
    return [];
  }
  const previews = [];
  for (const item of (items || []).filter((row) => row?.image && row?.product_name && row?.offers?.[0]?.product_url).slice(0, AI_CHAT_PREVIEW_LIMIT)) {
    const offer = item.offers[0];
    let trackingUrl = '';
    if (typeof createTrackToken === 'function' && env.LINK_SIGNING_SECRET && origin) {
      try {
        const token = await createTrackToken({
          u: sessionHash, r: seed, a: String(item.record_key || '').slice(0, 64), d: offer.product_url,
          exp: Math.floor(Date.now() / 1000) + 86400 * 7,
          j: `${seed}:${previews.length}:AI_PREVIEW`, c: 'PWA', m: 'RAKUTEN_JP', so: 'HOSHILU', t: 'AI_PREVIEW'
        }, env.LINK_SIGNING_SECRET);
        trackingUrl = `${origin}/go?token=${encodeURIComponent(token)}`;
      } catch {}
    }
    previews.push({
      name: String(item.product_name).slice(0, 120),
      image: String(item.image),
      price: Number(offer.price || 0) > 0 ? Number(offer.price) : 0,
      marketplace: 'RAKUTEN_JP',
      tracking_url: trackingUrl
    });
  }
  return previews;
}
