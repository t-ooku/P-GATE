// HOSHILU総合人気ランキング。AIはカテゴリ・同一商品・検索意図を整理するが、
// 取得できない売上・評価・順位を生成しない。API接続の有無そのものは加点せず、
// API/許諾済み公開情報/HOSHILU内行動の「観測できた信号」だけを同じ尺度で扱う。
export const POPULARITY_WEIGHTS = Object.freeze({
  marketplace_popularity: 25,
  review_confidence: 20,
  marketplace_coverage: 15,
  price_competitiveness: 15,
  hoshilu_demand: 15,
  freshness: 10
});

function unit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

export function scoreHoshiluPopularity(candidate = {}) {
  const signals = candidate.popularity_signals || {};
  let earned = 0; let available = 0;
  const breakdown = {};
  for (const [name, weight] of Object.entries(POPULARITY_WEIGHTS)) {
    const value = unit(signals[name]);
    breakdown[name] = value === null ? null : Math.round(value * weight * 10) / 10;
    if (value !== null) { earned += value * weight; available += weight; }
  }
  // 情報が少ない商品を満点換算で上位にしない。観測信号の加重点に加え、
  // 利用可能な根拠の割合をconfidenceとして明示する。
  const confidence = available / 100;
  const normalized = available ? earned / available * 100 : 0;
  return { score: Math.round(normalized * confidence * 10) / 10, confidence: Math.round(confidence * 100), breakdown };
}

export function rankHoshiluPopularity(candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate, position) => ({ candidate, position, result: scoreHoshiluPopularity(candidate) }))
    .filter(({ result }) => result.confidence >= 30)
    .sort((a, b) => b.result.score - a.result.score || b.result.confidence - a.result.confidence || a.position - b.position)
    .map(({ candidate, result }, index) => ({ ...candidate, hoshilu_popularity_rank: index + 1, hoshilu_popularity_score: result.score, hoshilu_popularity_confidence: result.confidence, hoshilu_popularity_breakdown: result.breakdown, result_type: 'ORGANIC_RANKING' }));
}

function rotationValue(value, bucket) {
  const text = `${bucket}:${value}`; let hash = 2166136261;
  for (const character of text) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function selectSponsorSlots(campaigns = [], categoryId = '', now = new Date(), limit = 3) {
  const bucket = Math.floor(now.getTime() / (30 * 60 * 1000));
  const eligible = (Array.isArray(campaigns) ? campaigns : []).filter((campaign) =>
    campaign.active === true && Number(campaign.remaining_budget_jpy) > 0 &&
    (campaign.category_id === categoryId || campaign.category_id === '*') && campaign.intent_eligible === true
  ).sort((a, b) => rotationValue(a.campaign_id, bucket) - rotationValue(b.campaign_id, bucket));
  const advertisers = new Set(); const selected = [];
  for (const campaign of eligible) {
    const advertiser = String(campaign.advertiser_id || campaign.seller_id || campaign.manufacturer || campaign.campaign_id);
    if (advertisers.has(advertiser)) continue;
    advertisers.add(advertiser);
    selected.push({ ...campaign, result_type: 'SPONSORED', disclosure: '広告・PR' });
    if (selected.length >= Math.min(3, Math.max(0, limit))) break;
  }
  return selected;
}
