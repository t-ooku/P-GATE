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

import { MARKETPLACE_RANKING_CAPABILITIES, RAKUTEN_RANKING_CATEGORIES, fetchRakutenReviewRanking, marketplaceRankingResult, readRankingCache, writeRankingCache } from './marketplace-ranking.mjs';
import { fetchYahooHighRatingRanking, searchYahooShopping, yahooShoppingApiConfigured } from './yahoo-shopping-api.mjs';

export const BUZZ_SHELF_ITEM_LIMIT = 6;

// 棚の並び。若者向け(デュアルペルソナv2ライン)を先頭に置く。
export const BUZZ_SHELF_CATEGORY_IDS = Object.freeze([
  'wireless_earphones', 'face_lotion', 'handheld_fan', 'mobile_battery', 'womens_sneakers'
]);

export const BUZZ_THEME_ROTATIONS = Object.freeze([
  Object.freeze({ id: 'beauty_and_style', label: '韓国ビューティー＆今っぽコーデ', category_ids: Object.freeze(['face_lotion', 'womens_sneakers', 'wireless_earphones']) }),
  Object.freeze({ id: 'campus_and_oshikatsu', label: '通学・推し活の持ち歩きトレンド', category_ids: Object.freeze(['mobile_battery', 'wireless_earphones', 'handheld_fan']) }),
  Object.freeze({ id: 'korean_pouch_refresh', label: '韓国っぽポーチの中身アップデート', category_ids: Object.freeze(['face_lotion', 'mobile_battery', 'wireless_earphones']) }),
  Object.freeze({ id: 'weekend_style', label: '週末おでかけ＆今っぽ足元', category_ids: Object.freeze(['womens_sneakers', 'wireless_earphones', 'handheld_fan']) }),
  Object.freeze({ id: 'campus_beauty', label: '通学バッグの韓国ビューティー', category_ids: Object.freeze(['face_lotion', 'mobile_battery', 'handheld_fan']) }),
  Object.freeze({ id: 'oshikatsu_ready', label: '推し活・遠征の持ち物アップデート', category_ids: Object.freeze(['mobile_battery', 'wireless_earphones', 'womens_sneakers']) })
]);

const BUZZ_ROTATION_EPOCH_MONDAY_UTC = Date.UTC(2026, 7, 24);

function positiveModulo(value, length) { return ((value % length) + length) % length; }

export function buzzThemeStateFor(now = Date.now()) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  const jst = new Date(timestamp + 9 * 60 * 60 * 1000);
  const day = jst.getUTCDay();
  const localMidnight = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate());
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = localMidnight + mondayOffset * 24 * 60 * 60 * 1000;
  const weekIndex = Math.floor((monday - BUZZ_ROTATION_EPOCH_MONDAY_UTC) / (7 * 24 * 60 * 60 * 1000));
  // 火〜木はその週の火曜枠、金〜日は金曜枠、月曜は前週金曜枠。
  const slotIndex = day === 1 ? weekIndex * 2 - 1 : weekIndex * 2 + (day >= 5 || day === 0 ? 1 : 0);
  const updatedLocalMidnight = day === 1
    ? monday - 3 * 24 * 60 * 60 * 1000
    : monday + (day >= 5 || day === 0 ? 4 : 1) * 24 * 60 * 60 * 1000;
  const updated = new Date(updatedLocalMidnight);
  const updatedKey = `${updated.getUTCFullYear()}-${String(updated.getUTCMonth() + 1).padStart(2, '0')}-${String(updated.getUTCDate()).padStart(2, '0')}`;
  return {
    theme: BUZZ_THEME_ROTATIONS[positiveModulo(slotIndex, BUZZ_THEME_ROTATIONS.length)],
    slot_index: slotIndex,
    updated_key: updatedKey
  };
}

export function buzzThemeFor(now = Date.now()) {
  return buzzThemeStateFor(now).theme;
}

// 予算別棚 (§19)。上限額は指示書の刻みから、現5ジャンルで商品が集まりやすい2つ。
export const BUZZ_BUDGET_SHELVES = Object.freeze([
  { shelf_id: 'budget_3000', label: '3,000円以下', max_price: 3000 },
  { shelf_id: 'budget_5000', label: '5,000円以下', max_price: 5000 }
]);

const RISING_WINDOW_MIN_MS = 20 * 60 * 60 * 1000;   // 20時間
const RISING_WINDOW_MAX_MS = 96 * 60 * 60 * 1000;   // 96時間
const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;    // 6時間ごと
const SNAPSHOT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000; // 14日

// 2026-08-19 大隆さん報告: レディーススニーカー棚にイヤホンが並んだ。
// ジャンルID(206906)自体は正しいことを外部確認済みのため、楽天リアルタイム
// ランキングAPIがジャンル階層によって期待通りに絞らないケースへの防御を置く。
const BUZZ_CATEGORY_SANITY = Object.freeze({
  wireless_earphones: /イヤホン|ヘッドホン|earbuds?|earphones?/iu,
  womens_sneakers: /スニーカー|シューズ|靴|sneakers?/iu,
  handheld_fan: /ファン|扇風機|fan/iu,
  mobile_battery: /バッテリー|充電|power\s*bank/iu,
  face_lotion: /化粧水|ローション|スキンケア|toner|lotion/iu,
  // Yahoo!高評価トレンドAPIは検索語と無関係な総合ランキングを返すことがある。
  // 「韓国コスメ」明記または代表的なK-beautyブランドを商品名で確認できる物だけ通す。
  korean_beauty: /韓国(?:コスメ|化粧品|スキンケア)?|k\s*[-‐‑]?\s*beauty|rom&nd|ロムアンド|clio|クリオ|tirtir|ティルティル|vt(?:\s+cosmetics)?|cosrx|コスアールエックス|anua|アヌア|mediheal|メディヒール|laneige|ラネージュ|etude|エチュード|missha|ミシャ|innisfree|イニスフリー|hince|ヒンス|dasique|デイジーク|jung\s*saem\s*mool|ジョンセンムル|numbuzin|ナンバーズイン/iu
});

export function shelfItemsMatchCategory(categoryId, items = []) {
  const pattern = BUZZ_CATEGORY_SANITY[categoryId];
  if (!pattern || !items.length) return true;
  const matched = items.filter((item) => pattern.test(String(item.name || item.product_name || item.display_name || ''))).length;
  return matched / items.length >= 0.5;
}

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

function byOfficialRank(left, right) {
  return Number(left?.rank || Number.MAX_SAFE_INTEGER) - Number(right?.rank || Number.MAX_SAFE_INTEGER);
}

async function buildShelf(env, category, fetcher) {
  const result = await marketplaceRankingResult(env, category.label, 'RAKUTEN_JP', fetcher, {
    id: category.id, genre_id: category.genre_id
  });
  if (result.mode === 'clarification') return null;
  let allItems = (result.candidates || [])
    .map(sanitizeShelfItem)
    .filter((item) => item.name && item.product_url);
  if (!allItems.length) return null;
  let realtime = Boolean(result.ranking_type?.includes('リアルタイム'));
  // 商品名とジャンルが過半一致しない棚は信用せず、ジャンル厳密な
  // Item Search(口コミ件数順)で作り直す。それでも不一致なら棚を出さない。
  if (!shelfItemsMatchCategory(category.id, allItems)) {
    let reviewItems = [];
    try {
      reviewItems = (await fetchRakutenReviewRanking(env, category, fetcher))
        .map(sanitizeShelfItem)
        .filter((item) => item.name && item.product_url);
    } catch {
      reviewItems = [];
    }
    if (!reviewItems.length || !shelfItemsMatchCategory(category.id, reviewItems)) return null;
    allItems = reviewItems;
    realtime = false;
  }
  allItems.sort(byOfficialRank);
  return {
    shelf_id: category.id,
    label: category.label,
    emoji: realtime ? '👑' : '💬',
    // 楽天リアルタイムランキングが根拠のときだけ「いま売れてる」。
    // 404で口コミ件数順へ縮退した場合はラベルもそのまま言い換える (§43)。
    headline: realtime ? 'いま売れてる。' : '口コミが多い。',
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

export async function buildGenreShelves(env, fetcher = fetch, now = Date.now()) {
  const categories = buzzThemeFor(now).category_ids
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
      emoji: '💰',
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
    const shelves = await buildGenreShelves(env, fetcher, now);
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
    // 「急上昇」もカード左上の公式現在順位で昇順表示する。上昇幅はmovementへ残す。
    const items = risers.sort((a, b) => byOfficialRank(a, b) || b.improvement - a.improvement)
      .slice(0, BUZZ_SHELF_ITEM_LIMIT)
      .map(({ improvement, ...item }) => item);
    return {
      shelf_id: 'rising',
      label: '急上昇',
      emoji: '🚀',
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

// ---- 韓国コスメ棚 (2026-08-19 大隆さん指示: 韓流に繋がる棚を必ず1つ置く) ----
// 順位根拠はYahoo!ショッピング公式の高評価トレンドランキングAPI(検索語「韓国コスメ」)。
// 一時障害時は同公式の商品検索(口コミ件数順)へ縮退し、ラベルも言い換える。
// どちらも取得できない時だけ棚を出さない(架空データ禁止)。
const KOREAN_SHELF = Object.freeze({ shelf_id: 'korean_beauty', label: '韓国コスメ', query: '韓国コスメ' });

function categorySafeKoreanCandidates(candidates = []) {
  const normalized = candidates
    .map((candidate, index) => ({ candidate, item: sanitizeShelfItem(candidate, index) }))
    .filter(({ item }) => item.name && item.product_url);
  if (!normalized.length || !shelfItemsMatchCategory(KOREAN_SHELF.shelf_id, normalized.map(({ item }) => item))) return [];
  return normalized
    .filter(({ item }) => shelfItemsMatchCategory(KOREAN_SHELF.shelf_id, [item]))
    .map(({ candidate }) => candidate);
}

function individuallyVerifiedKoreanCandidates(candidates = []) {
  return candidates.filter((candidate, index) => {
    const item = sanitizeShelfItem(candidate, index);
    return item.name && item.product_url && shelfItemsMatchCategory(KOREAN_SHELF.shelf_id, [item]);
  });
}

export async function buildKoreanShelf(env, fetcher = fetch) {
  if (!yahooShoppingApiConfigured(env)) return null;
  let rankingType = 'HIGH_RATING_TREND';
  let headline = '高評価トレンド。';
  let rankingLabel = 'Yahoo!ショッピング 高評価トレンドランキング(「韓国コスメ」)';
  let candidates = await readRankingCache(env, 'YAHOO_JP', `buzz_${KOREAN_SHELF.shelf_id}`, rankingType);
  let shouldWriteCache = false;
  let fetchedHighRating = false;
  if (!candidates) {
    try {
      candidates = await fetchYahooHighRatingRanking(env, KOREAN_SHELF.query, fetcher);
      shouldWriteCache = true;
      fetchedHighRating = true;
    } catch {
      candidates = null;
    }
  }
  const verifiedHighRatingCandidates = individuallyVerifiedKoreanCandidates(candidates || []);
  // 検索語を無視した総合ランキング(今回の「米」など)は採用しない。
  // 過半が韓国コスメと確認できない場合は、検索語が効く商品検索へ縮退する。
  candidates = categorySafeKoreanCandidates(candidates || []);
  if (!candidates.length) {
    rankingType = 'REVIEW_COUNT';
    headline = '口コミが多い。';
    rankingLabel = 'Yahoo!ショッピング 口コミ件数順(「韓国コスメ」)';
    candidates = await readRankingCache(env, 'YAHOO_JP', `buzz_${KOREAN_SHELF.shelf_id}`, rankingType);
    shouldWriteCache = false;
    if (!candidates) {
      try {
        candidates = await searchYahooShopping(env, KOREAN_SHELF.query, fetcher, { sort: '-review_count' });
        shouldWriteCache = true;
      } catch {
        candidates = [];
      }
    }
    candidates = categorySafeKoreanCandidates(candidates || []);
    // 検索APIもカテゴリ不一致なら、元の公式高評価ランキングに含まれていた
    // 個別確認済み韓国コスメだけを、元順位を変えずに表示する。米などは含めない。
    if (!candidates.length && verifiedHighRatingCandidates.length) {
      rankingType = 'HIGH_RATING_TREND';
      headline = '高評価トレンド。';
      rankingLabel = 'Yahoo!ショッピング 高評価トレンドランキング(「韓国コスメ」)';
      candidates = verifiedHighRatingCandidates;
      shouldWriteCache = fetchedHighRating;
    }
  }
  if (!candidates.length) return null;
  if (shouldWriteCache) {
    await writeRankingCache(env, 'YAHOO_JP', `buzz_${KOREAN_SHELF.shelf_id}`, rankingType, candidates);
  }
  const items = (candidates || [])
    .map(sanitizeShelfItem)
    .filter((item) => item.name && item.product_url)
    .sort(byOfficialRank)
    .slice(0, BUZZ_SHELF_ITEM_LIMIT)
    .map((item) => ({ ...item, marketplace: 'YAHOO_JP' }));
  if (!items.length) return null;
  return {
    shelf_id: KOREAN_SHELF.shelf_id,
    label: KOREAN_SHELF.label,
    emoji: '❤️',
    headline,
    ranking_type: rankingLabel,
    ranking_mode: 'native_api',
    marketplace: 'YAHOO_JP',
    marketplace_label: 'Yahoo!ショッピング',
    source: 'YAHOO_OFFICIAL_RANKING_API',
    search_keyword: KOREAN_SHELF.query,
    items
  };
}

function koreanShelfAvailabilityPlaceholder() {
  return {
    shelf_id: KOREAN_SHELF.shelf_id,
    label: KOREAN_SHELF.label,
    emoji: '❤️',
    headline: '公式ランキングを確認中。',
    ranking_type: 'Yahoo!ショッピング公式ランキング確認中',
    ranking_mode: 'official_data_unavailable',
    marketplace: 'YAHOO_JP',
    marketplace_label: 'Yahoo!ショッピング',
    source: 'YAHOO_OFFICIAL_RANKING_API',
    search_keyword: KOREAN_SHELF.query,
    items: []
  };
}

function publicShelf({ all_items, ...shelf }) { return shelf; }

// カテゴリ不一致商品を除いた後の棚内表示は、若者が直感的に追える
// HOSHILU BUZZ順位として1位から連番にする。根拠のモール公式順位は
// source_rankへ残し、急上昇のmovementも元順位の実測値を維持する。
function withBuzzRanks(shelf) {
  return {
    ...shelf,
    items: (shelf.items || []).map((item, index) => ({
      ...item,
      source_rank: item.rank,
      rank: index + 1
    }))
  };
}

export async function buzzShelfResult(env, fetcher = fetch, now = Date.now()) {
  const themeState = buzzThemeStateFor(now);
  const theme = themeState.theme;
  const genreShelves = await buildGenreShelves(env, fetcher, now);
  const [risingShelf, koreanShelf] = await Promise.all([
    buildRisingShelf(env, genreShelves, now),
    buildKoreanShelf(env, fetcher)
  ]);
  const budgetShelves = buildBudgetShelves(genreShelves);
  // 同一商品が過半重複する棚を2つ並べない(誤ラベルの「同じ中身の棚」防止)。
  const seenUrlSets = [];
  const distinctShelf = (shelf) => {
    const urls = new Set((shelf.items || []).map((item) => item.product_url));
    const duplicated = seenUrlSets.some((prev) => {
      const overlap = [...urls].filter((url) => prev.has(url)).length;
      return urls.size > 0 && overlap / urls.size > 0.5;
    });
    if (duplicated) return false;
    seenUrlSets.push(urls);
    return true;
  };
  const shelves = [
    ...(risingShelf ? [risingShelf] : []),
    // 2026-08-19 大隆さん指示: 韓流に繋がる棚を必ず上位に1つ置く。
    // API一時障害でも韓国関連の入口自体は消さない。商品・順位は作らず、
    // 公式データ確認中の空棚と安全な横断検索リンクだけを表示する。
    ...(koreanShelf ? [koreanShelf] : [koreanShelfAvailabilityPlaceholder()]),
    ...genreShelves.map(publicShelf)
  ].filter(distinctShelf).concat(budgetShelves).map(withBuzzRanks);
  return {
    generated_for: 'HOSHILU BUZZ',
    theme: { id: theme.id, label: theme.label, rotation: '火曜・金曜更新（JST）', updated_key: themeState.updated_key },
    methodology: 'HOSHILU BUZZ順位は、モール公式ランキングAPI(楽天市場・Yahoo!ショッピング)と順位の実測変化を根拠に商品を選び、各棚の掲載順を1位から表示しています。SNS指標や推定値では並べ替えません。',
    disclaimer: '価格・送料・在庫は変動します。購入前に各販売ページで最新の条件を確認してください。',
    marketplace_scope: MARKETPLACE_RANKING_CAPABILITIES.map(({ marketplace_id, label }) => ({ marketplace_id, label })),
    shelf_count: shelves.length,
    shelves
  };
}
