// HOSHILU INSIGHT 通知仕様変更指示書 v1.0: 保存した検索条件の新着商品検出は、
// 通常検索(index.mjs handleKnowledgeApi)が使っているのと同じ品質基盤
// (D1インデックス済みカタログ検索・カテゴリ不一致除去・ランキング)を再利用
// する。section 16の「単純な部分文字列一致を使ってはいけない」「Teacher
// Dataset・カテゴリマッチング・属性マッチング・ランキング基盤をできる限り
// 再利用する」を満たすため、これらの実関数をそのまま呼び出す。
//
// 既知の制約(誠実に明記する。最終報告にも記載する): 今回のスキャン対象は
// D1インデックス済みカタログのみで、Amazon/Rakuten/Yahoo等のライブモール
// APIは呼び出さない。保存済み検索条件×全モールAPIを定期的に呼び出す構成は
// レート制限・コスト面で別途設計が必要なため、今回のスコープには含めない
// (index.mjsのhandleKnowledgeApi自体は無傷のまま、通常検索では引き続き
// 全モールAPIを使う)。

import { applyIndexedSearchPolicy, filterCategoryMismatches, rankMerchantCandidates } from './knowledge-search.mjs';

const CANDIDATE_LIMIT = 60;

export async function searchCandidatesForInsight(env, query, language = 'JA') {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const policyResult = await applyIndexedSearchPolicy({ candidates: [] }, env, trimmed, language, {
    force_product_presentation: true
  });
  const candidates = filterCategoryMismatches(trimmed, policyResult?.candidates || []);
  return rankMerchantCandidates([], candidates, trimmed).slice(0, CANDIDATE_LIMIT);
}
