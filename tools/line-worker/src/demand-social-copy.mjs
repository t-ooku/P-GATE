// 2026-09-21 指示書 §32〜§34「SNS・Web の販促を実需要から作る」（P1）。
//
// 「機能の紹介」ではなく、実際に不足している需要を素材にする。
// ただし **人数は実データのみ**（§30 架空件数は禁止）。
//   ・公開できる needs（5人以上・内部会員除外）が無ければ、文面そのものを作らない
//   ・数えられない系統からは文を作らない。0 人と書かない
//   ・商品名・条件はサーバーの匿名集計が返したものだけを載せる。こちらで足さない
//
// 自動投稿はしない。作るのは下書きだけで、出すかどうかは人が決める
// （2026-09-19 §54: 不可逆な操作は大隆さんの承認が要る。SNS への公開もそれに当たる）。

import { authorizeAdminRequest } from './admin-auth.mjs';
import { searchingDemandOverview } from './searching-demand.mjs';
import { targetPriceDemand, usualDemandForecast } from './usual-demand.mjs';

// X は 280 字。Instagram・Threads はもっと長いが、読み切れる長さに揃える。
export const COPY_LIMITS = Object.freeze({ X: 280, INSTAGRAM: 400, THREADS: 400 });
const LP_URL = 'https://hoshilu.app/for-sellers';

const clean = (value, max = 60) => String(value ?? '')
  .normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);

function publishable(lane) {
  if (!lane || lane.measurable === false) return [];
  return Array.isArray(lane.items) ? lane.items : [];
}

// 🔎 今日HOSHILUで探されています
export function searchingCopy(searching, { limit = 3 } = {}) {
  const items = publishable(searching)
    .filter((item) => Number(item?.people) > 0 && clean(item?.query))
    .slice(0, limit);
  if (!items.length) return null;
  const lines = items.map((item) => `・${clean(item.query)}（${Number(item.people)}人）`);
  return {
    kind: 'SEARCHING',
    body: ['🔎 今日HOSHILUで探されています', ...lines,
      'この条件の商品を出せる方は、HOSHILUが探している本人にお知らせします。', LP_URL].join('\n')
  };
}

// 🧺 来週HOSHILUで必要になりそうなもの
export function usualCopy(usual, { limit = 3 } = {}) {
  const items = publishable(usual)
    .filter((item) => Number(item?.within_7_days) > 0 && clean(item?.product_name))
    .slice(0, limit);
  if (!items.length) return null;
  const lines = items.map((item) => `・${clean(item.product_name)}（7日以内に${Number(item.within_7_days)}人）`);
  return {
    kind: 'USUAL',
    body: ['🧺 来週HOSHILUで必要になりそうなもの', ...lines,
      '「いつものホシル」に登録された補充の予定です。在庫を合わせられる方はぜひ。', LP_URL].join('\n')
  };
}

// 💰 この価格まで下がったら買う、という人がいます
export function priceWatchCopy(priceWatch, { limit = 3 } = {}) {
  const items = publishable(priceWatch)
    .filter((item) => Number(item?.people) > 0 && Number(item?.median_target_jpy) > 0 && clean(item?.product_name))
    .slice(0, limit);
  if (!items.length) return null;
  const lines = items.map((item) =>
    `・${clean(item.product_name)}（${Number(item.people)}人／中央値 ¥${Number(item.median_target_jpy).toLocaleString('ja-JP')}）`);
  return {
    kind: 'PRICE_WATCH',
    body: ['💰 値下がりを待っている人がいます', ...lines,
      '中央値まで下げると、待っている人の半数に届きます。', LP_URL].join('\n')
  };
}

// 文字数に収まらない下書きは出さない（途中で切って意味が変わるのを避ける）。
export function fitsPlatform(body, platform) {
  const limit = COPY_LIMITS[String(platform || '').toUpperCase()];
  return Number.isFinite(limit) ? [...String(body || '')].length <= limit : false;
}

export function buildDemandSocialCopy({ searching, priceWatch, usual } = {}, { platforms = ['X', 'INSTAGRAM'] } = {}) {
  const drafts = [searchingCopy(searching), usualCopy(usual), priceWatchCopy(priceWatch)].filter(Boolean);
  const out = [];
  for (const draft of drafts) {
    const fits = platforms.filter((platform) => fitsPlatform(draft.body, platform));
    // どの媒体にも収まらない下書きは返さない
    if (fits.length) out.push({ ...draft, platforms: fits, length: [...draft.body].length });
  }
  return out;
}

const jsonResponse = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

// GET /api/admin/demand-social-copy — 実需要から作った投稿の下書き。
// 読み取り専用。ここから自動で投稿はしない（人が見てから出す）。
export async function handleDemandSocialCopyRoute(request, env, authorize = authorizeAdminRequest) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/admin/demand-social-copy') return null;
  if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!await authorize(request, env)) return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const [searching, priceWatch, usual] = await Promise.all([
    searchingDemandOverview(env).catch(() => null),
    targetPriceDemand(env).catch(() => null),
    usualDemandForecast(env).catch(() => null)
  ]);
  const drafts = buildDemandSocialCopy({ searching, priceWatch, usual });
  return jsonResponse({
    ok: true,
    drafts,
    // 下書きが0件なのは「需要が0」ではなく「まだ公開できる需要が無い」という意味。
    note: drafts.length
      ? '人数はすべて匿名集計の実データです。出す前に内容を確認してください。自動投稿はしません。'
      : 'いま公開できる需要がありません（5人以上集まった需要だけを使います）。需要が0件という意味ではありません。'
  });
}
