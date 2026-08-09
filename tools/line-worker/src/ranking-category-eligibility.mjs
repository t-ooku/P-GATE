const VERIFIED_TERMS = Object.freeze({
  handheld_fan: ['ハンディファン', '携帯扇風機', '手持ち扇風機', 'ポータブルファン', 'handheld fan'],
  wireless_earphones: ['ワイヤレスイヤホン', '完全ワイヤレス', 'bluetoothイヤホン', 'earbuds', 'earphones'],
  womens_sneakers: ['レディーススニーカー', '女性用スニーカー', 'ウィメンズスニーカー', "women's sneakers", 'womens sneakers'],
  mobile_battery: ['モバイルバッテリー', '携帯充電器', 'power bank'],
  face_lotion: ['化粧水', 'フェイスローション', 'スキンローション', 'toner']
});

const ACCESSORY_NOUNS = /(?:ケース|カバー|フィルター|替え|交換|部品|パーツ|アクセサリー|スタンド|ホルダー|ストラップ|充電器|ケーブル|アダプター|内釜|ふた|蓋|プレート|保護シート|収納袋|掃除用品|replacement|accessor(?:y|ies)|case|cover|filter|holder|strap|charger|cable|adapter)/iu;

function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function leafCategoryLabel(category = {}) {
  return normalized(String(category.label || '').split('›').pop());
}

function categoryIsAccessory(category = {}) {
  return ACCESSORY_NOUNS.test(leafCategoryLabel(category));
}

function categoryTerms(category = {}) {
  const registered = VERIFIED_TERMS[String(category.id || '')] || [];
  const leaf = leafCategoryLabel(category);
  const usable = (term) => term.length >= 2 || /^[\p{Script=Han}\p{Script=Katakana}]$/u.test(term);
  const leafTerms = leaf.split(/[・･／/()（）,、]/u).map((term) => term.trim()).filter(usable);
  return [...new Set([...registered.map(normalized), ...leafTerms, leaf].filter(usable))];
}

function titleWithoutHashtags(candidate = {}) {
  return normalized(candidate.product_name || candidate.display_name || '').replace(/[#＃][^\s　]+/gu, ' ');
}

function isRelatedRecommendation(candidate = {}) {
  const type = normalized(candidate.result_type);
  return Boolean(candidate.related_category || candidate.recommendation_reason
    || ['recommendation', 'related_recommendation', 'recommended'].includes(type));
}

function isAccessoryForTarget(title, terms, category) {
  if (categoryIsAccessory(category) || !ACCESSORY_NOUNS.test(title)) return false;
  return terms.some((term) => {
    const index = title.indexOf(term); if (index < 0) return false;
    // 「スマホストラップ ハンディファンと一緒におすすめ」のように、
    // 商品本体名より前に周辺商品の種別が明示される候補も除外する。
    // 検索語・SEO文言として後段に小ジャンル名が入っても本体とは限らない。
    if (ACCESSORY_NOUNS.test(title.slice(0, index))) return true;
    const near = title.slice(Math.max(0, index - 24), index + term.length + 24);
    return ACCESSORY_NOUNS.test(near) && /(?:用|対応|専用|向け|for\s+)/iu.test(near);
  });
}

// 最安値より先に「選択した小ジャンルの商品本体か」を判定する。
// 説明文・ハッシュタグは一致根拠にせず、公式カテゴリ確認済み、または
// 商品名そのものに小ジャンルの商品語がある候補だけをランキングへ渡す。
export function isRankingCategoryEligible(candidate = {}, category = {}) {
  if (isRelatedRecommendation(candidate)) return false;
  if (candidate.ranking_category_verified === true) return true;
  const title = titleWithoutHashtags(candidate); if (!title) return false;
  const terms = categoryTerms(category);
  if (!terms.some((term) => title.includes(term))) return false;
  return !isAccessoryForTarget(title, terms, category);
}

export function filterRankingCategoryCandidates(candidates = [], category = {}) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => isRankingCategoryEligible(candidate, category));
}
