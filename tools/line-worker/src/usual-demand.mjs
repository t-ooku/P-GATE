// 2026-09-21 指示書 §21〜§24: Seller に見せる 3 種類の需要のうち、
//   ・継続需要 =「いつものホシル」→ §23 需要予報（7/14/30 日以内に必要になる人数）
//   ・条件需要 =「値下がり待ち」→ §24 希望価格需要（どこまで下げれば需要に届くか）
// を匿名で集計する。新規需要（探し中）は既存の searching-demand.mjs。
//
// 絶対に守ること（searching-demand.mjs と同じ規則を継承する）:
// - 内部会員（INTERNAL_MEMBER_IDS）は除外する。実績を水増ししない。
// - 5 人以上集まった需要だけ見せる。5 人未満は件数だけ。
// - Seller に個人情報を渡さない。member_id・usual_id・wish_id は返さない。
// - 人数は実数。推測で増やさない。数えられない場合は 0 ではなく「計測不能」として扱えるよう、
//   テーブルが無い・照会に失敗したときは items を空にしたうえで measurable:false を返す。
import { SELLER_DEMAND_MIN_PEOPLE } from './shop-demand.mjs';
import { internalMemberIds } from './growth-events.mjs';

const FETCH_LIMIT = 4000;
const GROUP_LIMIT = 30;
export const FORECAST_WINDOWS_DAYS = Object.freeze([7, 14, 30]);
const DAY_MS = 86_400_000;

function minPeopleFor(env = {}, options = {}) {
  return Number(options.minPeople) > 0
    ? Number(options.minPeople)
    : Number(env?.SHOP_DEMAND_SELLER_MIN_PEOPLE) || SELLER_DEMAND_MIN_PEOPLE;
}

// 同じ商品をまとめる鍵。product_key があればそれ、無ければ商品名を正規化したもの。
// 表示名は最初に出会った実際の商品名を使う（こちらで作らない）。
export function usualDemandKey(row = {}) {
  const key = String(row.product_key || '').trim();
  if (key) return `key:${key.toLowerCase()}`;
  const name = String(row.product_name || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
  return name ? `name:${name}` : '';
}

// §23 需要予報。ACTIVE な「いつものホシル」を、次回の補充予定日で 7/14/30 日以内に振り分ける。
// 30 日以内には 7 日・14 日以内の人も含む（「30日以内に必要になる人数」なので入れ子でよい）。
export function summarizeUsualForecast(rows = [], { now = Date.now(), minPeople = SELLER_DEMAND_MIN_PEOPLE, internal = new Set() } = {}) {
  const groups = new Map();
  for (const row of rows) {
    if (String(row?.status || 'ACTIVE') !== 'ACTIVE') continue;
    const memberId = String(row?.member_id || '');
    if (!memberId || internal.has(memberId)) continue;
    const key = usualDemandKey(row);
    if (!key) continue;
    const due = Date.parse(String(row?.next_due_at || ''));
    if (!Number.isFinite(due)) continue;
    const daysLeft = Math.ceil((due - now) / DAY_MS);
    const group = groups.get(key) || {
      product_name: String(row.product_name || '').trim(),
      marketplace: String(row.marketplace || ''),
      members: new Set(),
      within: { 7: new Set(), 14: new Set(), 30: new Set() }
    };
    group.members.add(memberId);
    for (const window of FORECAST_WINDOWS_DAYS) {
      if (daysLeft <= window) group.within[window].add(memberId);
    }
    groups.set(key, group);
  }
  const items = [];
  const below = { groups: 0, people: 0 };
  for (const group of groups.values()) {
    const people = group.members.size;
    if (people < minPeople) { below.groups += 1; below.people += people; continue; }
    items.push({
      product_name: group.product_name,
      marketplace: group.marketplace,
      people,
      within_7_days: group.within[7].size,
      within_14_days: group.within[14].size,
      within_30_days: group.within[30].size
    });
  }
  // 近い需要が多い順。同数なら総人数が多い順。
  items.sort((a, b) => b.within_7_days - a.within_7_days || b.within_30_days - a.within_30_days || b.people - a.people);
  return { items: items.slice(0, GROUP_LIMIT), below_threshold: below };
}

const USUAL_SQL = `SELECT member_id, product_key, product_name, marketplace, next_due_at, status
  FROM member_usual_items
  WHERE status='ACTIVE'
  ORDER BY next_due_at ASC
  LIMIT ${FETCH_LIMIT}`;

export async function usualDemandForecast(env = {}, options = {}) {
  const minPeople = minPeopleFor(env, options);
  const empty = { items: [], min_people: minPeople, below_threshold: { groups: 0, people: 0 }, windows_days: FORECAST_WINDOWS_DAYS, measurable: false };
  if (!env?.PRODUCT_DB?.prepare) return empty;
  let rows = [];
  try {
    const result = await env.PRODUCT_DB.prepare(USUAL_SQL).all();
    rows = result?.results || [];
  } catch {
    // テーブルがまだ無い等。0 人と断定せず「計測不能」で返す。
    return empty;
  }
  const summary = summarizeUsualForecast(rows, {
    now: options.now ?? Date.now(), minPeople, internal: internalMemberIds(env)
  });
  return { ...summary, min_people: minPeople, windows_days: FORECAST_WINDOWS_DAYS, measurable: true };
}

// §24 希望価格需要。「ホシっている 38 人／うち 1,200 円以下を希望 18 人」。
// 値下がり待ち（member_wishes の price_condition）を商品ごとにまとめ、希望価格の分布を返す。
// 返すのは商品名と人数と価格帯だけ。誰がいくらを希望したかは返さない。
export function summarizeTargetPriceDemand(rows = [], { minPeople = SELLER_DEMAND_MIN_PEOPLE, internal = new Set() } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const memberId = String(row?.member_id || '');
    if (!memberId || internal.has(memberId)) continue;
    const price = Math.round(Number(row?.target_price_jpy));
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = usualDemandKey({ product_key: row?.target_product_key, product_name: row?.target_product_name });
    if (!key) continue;
    const group = groups.get(key) || {
      product_name: String(row.target_product_name || '').trim(),
      members: new Set(),
      prices: []
    };
    if (!group.members.has(memberId)) group.prices.push(price);
    group.members.add(memberId);
    groups.set(key, group);
  }
  const items = [];
  const below = { groups: 0, people: 0 };
  for (const group of groups.values()) {
    const people = group.members.size;
    if (people < minPeople) { below.groups += 1; below.people += people; continue; }
    const sorted = [...group.prices].sort((a, b) => a - b);
    // Seller が「どこまで下げれば需要に届くか」を読めるよう、価格帯ごとの人数を返す。
    const steps = [...new Set(sorted)].slice(0, 12).map((price) => ({
      price_jpy: price,
      people: sorted.filter((value) => value >= price).length
    }));
    items.push({
      product_name: group.product_name,
      people,
      highest_target_jpy: sorted[sorted.length - 1],
      lowest_target_jpy: sorted[0],
      // 中央値まで下げれば半数に届く、という読み方ができる
      median_target_jpy: sorted.length % 2
        ? sorted[Math.floor(sorted.length / 2)]
        : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2),
      steps
    });
  }
  items.sort((a, b) => b.people - a.people);
  return { items: items.slice(0, GROUP_LIMIT), below_threshold: below };
}

const TARGET_PRICE_SQL = `SELECT member_id,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_key'),'') AS target_product_key,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_name'),'') AS target_product_name,
    CAST(COALESCE(json_extract(condition_snapshot,'$.price_condition.target_price_jpy'),0) AS INTEGER) AS target_price_jpy,
    COALESCE(json_extract(condition_snapshot,'$.price_condition.kind'),'TARGET_PRICE') AS kind
  FROM member_wishes
  WHERE archived_at IS NULL
    AND json_extract(condition_snapshot,'$.price_condition.target_price_jpy') > 0
  LIMIT ${FETCH_LIMIT}`;

export async function targetPriceDemand(env = {}, options = {}) {
  const minPeople = minPeopleFor(env, options);
  const empty = { items: [], min_people: minPeople, below_threshold: { groups: 0, people: 0 }, measurable: false };
  if (!env?.PRODUCT_DB?.prepare) return empty;
  let rows = [];
  try {
    const result = await env.PRODUCT_DB.prepare(TARGET_PRICE_SQL).all();
    rows = result?.results || [];
  } catch {
    return empty;
  }
  // 「買った後の値下がり待ち」（POST_PURCHASE）は §5 の逆ウォッチで、Seller 向けの
  // 公開集計からは除く（指示書 2026-09-05 の決定を継続）。
  const open = rows.filter((row) => String(row?.kind || 'TARGET_PRICE') !== 'POST_PURCHASE');
  const summary = summarizeTargetPriceDemand(open, { minPeople, internal: internalMemberIds(env) });
  return { ...summary, min_people: minPeople, measurable: true };
}
