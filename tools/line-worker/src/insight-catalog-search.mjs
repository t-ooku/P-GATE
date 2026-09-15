// HOSHILU INSIGHT 通知仕様変更指示書 v1.0: 保存した検索条件の新着商品検出は、
// 通常検索(index.mjs handleKnowledgeApi)が使っているのと同じ品質基盤
// (D1インデックス済みカタログ検索・カテゴリ不一致除去・ランキング)を再利用
// する。section 16の「単純な部分文字列一致を使ってはいけない」「Teacher
// Dataset・カテゴリマッチング・属性マッチング・ランキング基盤をできる限り
// 再利用する」を満たすため、これらの実関数をそのまま呼び出す。
//
// 2026-09-16 大隆さん決定「見つかるまで探します、を実現する」（2026-09-15 指示書
// §17/§19）: これまで巡回は D1 索引済みカタログだけを見ていたため、索引に新しい
// 商品が入らない限り「見つかりました」が一度も出なかった（本番で 0 回）。
// ここから、巡回のたびに 楽天市場 API と Yahoo!ショッピング API も実際に呼び、
// 同じ品質基盤（カテゴリ不一致除去・ランキング）を通した候補を索引結果に足す。
// ライブ候補は record_key（RAKUTEN:<itemCode> / YAHOO:<code> / JAN:<jan>）から
// 商品識別子を作り、既存の重複除外（product_identity_key）でそのまま扱える形にする。
// 保存直後の初回巡回で基準集合（INSIGHT_BASELINE）にライブ候補も入るので、
// 通知は「その後にモールへ新しく出た商品」だけに出る。
// INSIGHT_LIVE_MARKETPLACES='0' でライブ呼び出しを止められる（索引のみに戻る）。

import { applyIndexedSearchPolicy, filterCategoryMismatches, rankMerchantCandidates } from './knowledge-search.mjs';
import { rakutenApiConfigured, searchRakutenMarketplace } from './rakuten-marketplace-api.mjs';
import { yahooShoppingApiConfigured, searchYahooShopping } from './yahoo-shopping-api.mjs';

const CANDIDATE_LIMIT = 60;
// ライブ候補は各 API の 1 ページ（30 件）をそのまま基準集合に入れる。上位だけに絞ると
// モール側の並び替えで毎回「新着」が漏れ出て通知が続く（2026-09-16 本番で確認）。
// 1条件あたり最大 2 API 呼び出し。
export const INSIGHT_LIVE_CANDIDATE_LIMIT = 60;

export function liveMarketplacesEnabled(env = {}) {
  return String(env?.INSIGHT_LIVE_MARKETPLACES ?? '').trim() !== '0';
}

// ライブ候補に商品識別子を付ける。record_key の形は各 API モジュールが保証する
// （RAKUTEN:<itemCode> / YAHOO:<code> / JAN:<jan>）。識別子を作れない候補は
// 安全側に倒して除外する（通知対象にしない）。
export function withLiveIdentity(candidate = {}) {
  const offer = Array.isArray(candidate.offers) ? candidate.offers[0] : null;
  const key = String(candidate.record_key || '').trim();
  const separator = key.indexOf(':');
  if (!offer?.marketplace || separator <= 0) return null;
  const external = key.slice(separator + 1).trim();
  if (!external || /^https?:\/\//i.test(external)) return null;
  return {
    ...candidate,
    marketplace: String(candidate.marketplace || offer.marketplace),
    product_id: String(candidate.product_id || external),
    external_product_id: external,
    insight_source: 'LIVE'
  };
}

export async function searchLiveCandidatesForInsight(env, query, fetcher = fetch) {
  const trimmed = String(query || '').trim();
  if (!trimmed || !liveMarketplacesEnabled(env)) return [];
  const calls = [];
  if (rakutenApiConfigured(env)) calls.push(searchRakutenMarketplace(env, trimmed, fetcher, 'insight-scan'));
  if (yahooShoppingApiConfigured(env)) calls.push(searchYahooShopping(env, trimmed, fetcher));
  if (!calls.length) return [];
  const outcomes = await Promise.allSettled(calls);
  const raw = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' && Array.isArray(outcome.value) ? outcome.value : []));
  const identified = raw.map(withLiveIdentity).filter(Boolean);
  const filtered = filterCategoryMismatches(trimmed, identified);
  return rankMerchantCandidates([], filtered, trimmed).slice(0, INSIGHT_LIVE_CANDIDATE_LIMIT);
}

export async function searchCandidatesForInsight(env, query, language = 'JA', fetcher = fetch) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const policyResult = await applyIndexedSearchPolicy({ candidates: [] }, env, trimmed, language, {
    force_product_presentation: true
  });
  const candidates = filterCategoryMismatches(trimmed, policyResult?.candidates || []);
  const indexed = rankMerchantCandidates([], candidates, trimmed).slice(0, CANDIDATE_LIMIT);
  let live = [];
  try {
    live = await searchLiveCandidatesForInsight(env, trimmed, fetcher);
  } catch {
    live = [];
  }
  if (!live.length) return indexed;
  const seen = new Set(indexed.map((candidate) => String(candidate.record_key || '')).filter(Boolean));
  const merged = [...indexed];
  for (const candidate of live) {
    const key = String(candidate.record_key || '');
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(candidate);
  }
  return merged;
}
