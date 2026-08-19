// HOSHILU BUZZ 棚 (Phase 1 の起点 / 2026-08-19)
//
// 目的: 「検索する場所」に加えて「開けば何か来ているのが分かる場所」への
// 第一歩として、クエリ入力なしで見られる小ジャンル別ランキング棚を返す。
// 指示書v3.0 (claude/hoshilu_buzz_discovery_directive_v3_2026-08-19.md) の
// §6/§9/§26/§29/§36 に従い、順位の根拠はモール公式APIのみに限定する。
//
// 絶対に守ること:
// - 架空のSNS指標・BUZZスコア・「Z世代No.1」等を作らない (§43)。
//   現時点で正規取得できる指標はモール公式ランキングだけなので、
//   棚のラベルもその事実だけを言う (「いま売れてる」=楽天リアルタイム)。
// - 取得できない指標は0点扱いせず、単に使わない (§9 欠損値ルール)。
// - 棚の対象小ジャンルは RAKUTEN_RANKING_CATEGORIES (公式ランキングページで
//   genre_id を照合済みの登録制) のみ。未検証ジャンルを勝手に増やさない。
// - 順位取得は marketplaceRankingResult 経由 (D1の5分キャッシュ内蔵) なので、
//   この棚が増えても楽天APIへの実呼び出しは 5分あたり棚数回に抑えられる。
//
// 派生棚 (追加API呼び出しゼロ):
// - 💰予算別 (§19): 取得済みジャンル棚の商品を価格上限で再集計するだけ。
//   ラベルに「掲載ジャンルの公式ランキング内」と明記し、全モール横断の
//   最安・網羅と誤解させない。
// - 🚀急上昇 (§6/§7): buzz_ranking_snapshots (migration 0057) に蓄積した
//   公式ランキングの過去順位と現在順位の差だけを根拠にする。テーブルが
//   未適用・履歴不足なら棚ごと出さない (架空の急上昇を作らない)。

import { MARKETPLACE_RANKING_CAPABILITIES, RAKUTEN_RANKING_CATEGORIES, marketplaceRankingResult } from './marketplace-ranking.mjs';

export const BUZZ_SHELF_ITEM_LIMIT = 6;

// 棚の並び。若者向け(デュアルペルソナv2ライン)を先頭に置く。
export const BUZZ_SHELF_CATEGORY_IDS = Object.freeze([
  'wireless_earphones', 'face_lotion', 'handheld_fan', 'mobile_battery', 'womens_sneakers'
]);

// 予算別棚 (§19)。上限額は指示書の刻みから、現5ジャンルで商品が集まりやすい2つ。
export const BUZZ_BUDGET_SHELVES = Object.freeze([
  { shelf_id: 'budget_3000', label: '3,000円以下', max_price: 3000 },
  { shelf_id: 'budget_5000', label: '5,000円以下', max_price: 5000 }
]);

const RISING_WINDOW_MIN_MS = 20 * 60 * 60 * 1000;   // 20時間
const RISING_WINDOW_MAX_MS = 96 * 60 * 60 * 1000;   // 96時間
const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;    // 6時間ごと
const SNAPSHOT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000; // 14日

function sanitizeShelfItem(candidate = {}, index) {
  const offer = (candidate.offers || [])[0] || {};
  const price = Number(offer.total_cost || offer.price || 0);
  return {
    rank: Math.max(1, Number(candidate.rank) || index + 1),
    name: String(candidate.display_name || candidate.product_name || '').trim().slice(0, 160),
    image_url: /^https:\/\//i.test(String(candidate.image_url || '')) ? String(candidate.image_url) : '',
    price: price > 0 ? price : 0,
    price_confirmed: price > 0,
    currency: 'JPY',
    product_url: String(offer.product_url || '').trim(),
    marketplace: String(offer.marketplace || 'RAKUTEN_JP'),
    review_average: Number(candidate.review_average) || 0,
    review_count: Math.max(0, Number(candidate.review_count) || 0)
  };
}

async function buildShelf(env, category, fetcher) {
  const result = await marketplaceRankingResult(env, category.label, 'RAKUTEN_JP', fetcher, {
    id: category.id, genre_id: category.genre_id
  });
  if (result.mode === 'clarification') return null;
  const allItems = (result.candidates || [])
    .map(sanitizeShelfItem)
    .filter((item) => item.name && item.product_url);
  if (!allItems.length) return null;
  return {
    shelf_id: category.id,
    label: category.label,
    // 楽天リアルタイムランキングが根拠のときだけ「いま売れてる」。
    // 404で口コミ件数順へ縮退した場合はラベルもそのまま言い換える (§43)。
    headline: result.ranking_type?.includes('リアルタイム') ? 'いま売れてる。' : '口コミが多い。',
    ranking_type: String(result.ranking_type || ''),
    ranking_mode: String(result.mode || ''),
    marketplace: 'RAKUTEN_JP',
    marketplace_label: '楽天市場',
    source: 'RAKUTEN_OFFICIAL_RANKING_API',
    // v3.1 §11-14: PRODUCTの発見(この棚)と購入先の解決は別問題。routeがこの
    // キーワードから「◯◯で探す」検索フォールバックを署名付きで付与する。
    // 長い商品タイトルではなく検証済み小ジャンル名を検索語にする(§13 安全な検索語)。
    search_keyword: category.label,
    items: allItems.slice(0, BUZZ_SHELF_ITEM_LIMIT),
    // 派生棚(予算別・スナップショット)用の全量。公開レスポンスへ出す前に削る。
    all_items: allItems
  };
}

export async function buildGenreShelves(env, fetcher = fetch) {
  const categories = BUZZ_SHELF_CATEGORY_IDS
    .map((id) => RAKUTEN_RANKING_CATEGORIES.find((entry) => entry.id === id))
    .filter(Boolean);
  const outcomes = await Promise.allSettled(categories.map((category) => buildShelf(env, category, fetcher)));
  return outcomes
    .filter((outcome) => outcome.status === 'fulfilled' && outcome.value)
    .map((outcome) => outcome.value);
}

// 💰予算別棚 (§19): 追加API呼び出しなし。取得済み公式ランキングの商品を
// 実価格で絞るだけ。価格未確認の商品は入れない(架空の「以下」判定をしない)。
export function buildBudgetShelves(genreShelves) {
  return BUZZ_BUDGET_SHELVES.map((budget) => {
    const seen = new Set();
    const items = genreShelves.flatMap((shelf) => (shelf.all_items || [])
      .filter((item) => item.price_confirmed && item.price <= budget.max_price)
      .map((item) => ({ ...item, context_label: `${shelf.label} ${item.rank}位` })))
      .sort((a, b) => a.rank - b.rank)
      .filter((item) => { // 同一商品URLの重複掲載を防ぐ(§28 canonical productの簡易版)
        if (seen.has(item.product_url)) return false;
        seen.add(item.product_url); return true;
      })
      .slice(0, BUZZ_SHELF_ITEM_LIMIT);
    if (items.length < 3) return null;
    return {
      shelf_id: budget.shelf_id,
      label: budget.label,
      headline: `${budget.label}で、いま売れてる。`,
      ranking_type: '楽天市場公式ランキング(掲載ジャンル内・価格確認済みのみ)',
      ranking_mode: 'derived_from_official',
      marketplace: 'RAKUTEN_JP',
      marketplace_label: '楽天市場',
      source: 'RAKUTEN_OFFICIAL_RANKING_API',
      items
    };
  }).filter(Boolean);
}

// ---- 🚀急上昇 (順位スナップショット比較) --------------------------------

function snapshotPayload(shelf) {
  return (shelf.all_items || shelf.items || []).map((item) => ({
    rank: item.rank, name: item.name, product_url: item.product_url, price: item.price
  }));
}

// cronから呼ぶ。テーブル未適用(migration 0057前)なら静かに何もしない。
export async function recordBuzzSnapshots(env, fetcher = fetch, now = Date.now()) {
  if (!env.PRODUCT_DB) return { recorded: 0, skipped: 'NO_DB' };
  try {
    const latest = await env.PRODUCT_DB.prepare(
      'SELECT MAX(captured_at) AS captured_at FROM buzz_ranking_snapshots'
    ).first();
    if (latest?.captured_at && now - Date.parse(latest.captured_at) < SNAPSHOT_INTERVAL_MS) {
      return { recorded: 0, skipped: 'FRESH' };
    }
    const shelves = await buildGenreShelves(env, fetcher);
    if (!shelves.length) return { recorded: 0, skipped: 'NO_SHELVES' };
    const capturedAt = new Date(now).toISOString();
    for (const shelf of shelves) {
      await env.PRODUCT_DB.prepare(
        'INSERT OR IGNORE INTO buzz_ranking_snapshots(marketplace_id,shelf_id,captured_at,ranking_type,payload_json) VALUES(?1,?2,?3,?4,?5)'
      ).bind('RAKUTEN_JP', shelf.shelf_id, capturedAt, shelf.ranking_type, JSON.stringify(snapshotPayload(shelf))).run();
    }
    await env.PRODUCT_DB.prepare('DELETE FROM buzz_ranking_snapshots WHERE captured_at < ?1')
      .bind(new Date(now - SNAPSHOT_RETENTION_MS).toISOString()).run();
    return { recorded: shelves.length };
  } catch {
    // テーブル未適用・一時障害。BUZZ表示や他cronを止めない。
    return { recorded: 0, skipped: 'TABLE_UNAVAILABLE' };
  }
}

async function readComparisonSnapshot(env, shelfId, now) {
  const row = await env.PRODUCT_DB.prepare(
    'SELECT captured_at, payload_json FROM buzz_ranking_snapshots WHERE marketplace_id=?1 AND shelf_id=?2 AND captured_at<=?3 AND captured_at>=?4 ORDER BY captured_at DESC LIMIT 1'
  ).bind('RAKUTEN_JP', shelfId,
    new Date(now - RISING_WINDOW_MIN_MS).toISOString(),
    new Date(now - RISING_WINDOW_MAX_MS).toISOString()).first();
  if (!row) return null;
  try {
    const items = JSON.parse(row.payload_json);
    return Array.isArray(items) ? { captured_at: row.captured_at, items } : null;
  } catch { return null; }
}

function hoursBetween(now, iso) {
  return Math.max(1, Math.round((now - Date.parse(iso)) / (60 * 60 * 1000)));
}

// 実測の順位変化だけで「急上昇」を作る。履歴が無ければnull(棚を出さない)。
export async function buildRisingShelf(env, genreShelves, now = Date.now()) {
  if (!env.PRODUCT_DB) return null;
  try {
    const risers = [];
    for (const shelf of genreShelves) {
      const snapshot = await readComparisonSnapshot(env, shelf.shelf_id, now);
      if (!snapshot) continue;
      const previousRankByUrl = new Map(snapshot.items.map((item) => [item.product_url, Number(item.rank)]));
      const hours = hoursBetween(now, snapshot.captured_at);
      for (const item of shelf.all_items || []) {
        const previousRank = previousRankByUrl.get(item.product_url);
        if (previousRank !== undefined && previousRank - item.rank >= 3) {
          risers.push({ ...item, context_label: shelf.label, improvement: previousRank - item.rank,
            movement: `${previousRank}位→${item.rank}位(${hours}時間)` });
        } else if (previousRank === undefined && item.rank <= 10) {
          risers.push({ ...item, context_label: shelf.label, improvement: 30 - item.rank,
            movement: `圏外→${item.rank}位(${hours}時間)` });
        }
      }
    }
    if (!risers.length) return null;
    const items = risers.sort((a, b) => b.improvement - a.improvement).slice(0, BUZZ_SHELF_ITEM_LIMIT)
      .map(({ improvement, ...item }) => item);
    return {
      shelf_id: 'rising',
      label: '急上昇',
      headline: '順位が上がってる。',
      ranking_type: '楽天市場公式ランキングの順位変化(実測)',
      ranking_mode: 'derived_from_official',
      marketplace: 'RAKUTEN_JP',
      marketplace_label: '楽天市場',
      source: 'RAKUTEN_OFFICIAL_RANKING_API',
      items
    };
  } catch { return null; }
}

function publicShelf({ all_items, ...shelf }) { return shelf; }

export async function buzzShelfResult(env, fetcher = fetch, now = Date.now()) {
  const genreShelves = await buildGenreShelves(env, fetcher);
  const risingShelf = await buildRisingShelf(env, genreShelves, now);
  const budgetShelves = buildBudgetShelves(genreShelves);
  const shelves = [
    ...(risingShelf ? [risingShelf] : []),
    ...genreShelves.map(publicShelf),
    ...budgetShelves
  ];
  return {
    generated_for: 'HOSHILU BUZZ',
    methodology: '順位はモール公式ランキングAPI(楽天市場)と、その順位の実測変化のみを根拠にしています。SNS指標や推定値では並べ替えません。',
    disclaimer: '価格・送料・在庫は変動します。購入前に各販売ページで最新の条件を確認してください。',
    marketplace_scope: MARKETPLACE_RANKING_CAPABILITIES.map(({ marketplace_id, label }) => ({ marketplace_id, label })),
    shelf_count: shelves.length,
    shelves
  };
}
