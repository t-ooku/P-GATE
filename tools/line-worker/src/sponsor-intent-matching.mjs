// v4.2 項目21・22: MATCHESとSPONSORED/PRの分離。
//
// 現状このリポジトリにはスポンサー入札を扱うライブなデータソースが存在しない
// （src/public/testを "sponsor" "SPONSORED" "promoted" "ad_slot" 等で全文検索
// しても本ファイル追加以前はヒットゼロだった）。したがって、この判定関数を
// handleKnowledgeApi / rankMerchantCandidates の実行パスへ配線することはせず、
// src/seller-pricing-policy.mjs の rankWithoutPaidPlacement / rankEligibleSellerProducts
// と同じ「テスト済みだが本番未接続」の待機用インフラとして追加する。将来
// スポンサー入札データが追加された時に、この判定を通過した候補だけを
// SPONSORED枠の候補にできるようにする。
//
// 絶対ルール（項目21）：Sellerが課金したという理由だけで、この判定が
// 自然検索結果（MATCHES / rankMerchantCandidates）の並び順に影響することは
// 一切ない。classifySponsoredCandidate はここで完結し、rankMerchantCandidates
// へは何も書き戻さない。
//
// 絶対ルール（項目22）：完全一致キーワードではなく、カテゴリ・対象者・色・
// 用途・特徴・予算という「検索意図」との一致で判定する。カテゴリ不一致は
// 課金の有無に関わらず無条件でeligible=falseにする（自然検索結果と全く同じ
// filterCategoryMismatchesゲートを再利用し、判定基準が分岐しないようにする）。

import { filterCategoryMismatches } from './knowledge-search.mjs';
import { requestedColorPatterns } from './search-intelligence.mjs';
import { scoreApparelAttributeMatch } from './apparel-query-attributes.mjs';

// 「3000円以下」「¥5,000まで」「1万円くらい」等から予算上限(円)を取り出す。
// stripSearchBudget（search-intelligence.mjs）は同じ表現を検索語から除去する
// だけで数値を返さないため、この用途には使えない。
const BUDGET_PATTERN_YEN_UNIT = /([\d,]{2,7})\s*円\s*(?:以下|未満|以内|まで|くらい|程度|前後)?/u;
const BUDGET_PATTERN_YEN_SIGN = /(?:¥|￥)\s*([\d,]{2,7})\s*(?:以下|未満|以内|まで|くらい|程度|前後)?/u;

export function extractBudgetCeilingJpy(query) {
  const text = String(query || '').normalize('NFKC');
  const match = text.match(BUDGET_PATTERN_YEN_UNIT) || text.match(BUDGET_PATTERN_YEN_SIGN);
  if (!match) return null;
  const value = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function candidateMinPriceJpy(candidate) {
  const prices = (candidate?.offers || [])
    .map((offer) => Number(offer?.total_cost || offer?.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function candidateText(candidate) {
  return `${candidate?.product_name || ''} ${candidate?.manufacturer || ''}`;
}

// スポンサー候補として表示してよいか判定する。eligible=false の理由は reason
// で返し、価格やビッド額で判定を上書きできる項目は一切受け取らない
// （引数に "bid" 相当の値を持たないのはこの節の意図的な設計）。
export function classifySponsoredCandidate(candidate, query = '') {
  // ①カテゴリ不一致は無条件除外。自然検索結果(filterCategoryMismatches)と
  // 同一のゲートを再利用することで、スポンサー枠だけ緩い基準になることを防ぐ。
  const categoryOk = filterCategoryMismatches(query, [candidate]).length === 1;
  if (!categoryOk) {
    return { eligible: false, reason: 'CATEGORY_MISMATCH', result_type: 'SPONSORED', intent_score: 0, matched_facets: [] };
  }

  const budgetCeiling = extractBudgetCeilingJpy(query);
  const price = candidateMinPriceJpy(candidate);
  const overBudget = budgetCeiling !== null && price !== null && price > budgetCeiling;

  const colorPatterns = query ? requestedColorPatterns(query) : [];
  const attributes = scoreApparelAttributeMatch(query, candidateText(candidate), { colorPatterns });
  const matchedFacets = [];
  if (attributes.breakdown.audience > 0) matchedFacets.push('audience');
  if (attributes.breakdown.color > 0) matchedFacets.push('color');
  if (attributes.breakdown.use_case > 0) matchedFacets.push('use_case');
  if (attributes.breakdown.feature > 0) matchedFacets.push('feature');
  if (attributes.breakdown.product_type > 0) matchedFacets.push('product_type');
  if (budgetCeiling !== null && !overBudget) matchedFacets.push('budget');

  if (overBudget) {
    return { eligible: false, reason: 'OVER_BUDGET', result_type: 'SPONSORED', intent_score: attributes.total, matched_facets: matchedFacets };
  }

  // TPO(利用シーン)の逆一致は自然検索と同じくマイナススコアなので、
  // ここでも意図不一致として除外する（例: 「フォーマル」希望に「カジュアル」
  // を明示した商品を出さない）。
  if (attributes.breakdown.tpo_mismatch < 0) {
    return { eligible: false, reason: 'SCENE_MISMATCH', result_type: 'SPONSORED', intent_score: attributes.total, matched_facets: matchedFacets };
  }

  return {
    eligible: true,
    reason: 'INTENT_MATCH',
    result_type: 'SPONSORED',
    intent_score: attributes.total,
    matched_facets: matchedFacets
  };
}
