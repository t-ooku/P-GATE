// 2026-09-20 GPT 指示書 §6/§9/§42（大隆さん承認）: Seller Dashboard の「◯人が探しています」を
// 「アクティブな探し中」だけから数える。
//
// これまで Seller Dashboard の需要は shop_demand_requests（HOSHILU SHOP 内検索、9/17 指示書）だけを見ており、
// member_wishes の「探し中」（HOSHILU が探し続けている条件）は Seller にまったく届いていなかった。
// ここはその欠けていた側を足す。
//
// 絶対に守ること:
// - 数えるのは active な探し中だけ。notify_new_match=1 かつ insight_enabled_at あり かつ MUTED でないもの。
//   「あとで見る」（notify_new_match=0）・アーカイブ・解決済み・90 日無反応で自動停止した条件は含めない（§6）。
// - 内部会員（INTERNAL_MEMBER_IDS）は除外する。実績を水増ししない。
// - Seller に個人情報を渡さない。member_id・wish_id・検索文そのものは返さない。返すのは正規化した条件
//   （色・素材・サイズ・名詞）と人数だけ（§9）。
// - 5 人以上集まった需要だけ見せる。5 人未満は「件数」だけ（既存 Seller ページと同じ基準）。
// - 人数は「条件を保存した会員の実数」。推測で増やさない。0 なら 0 を返す（KPI を作らない）。
import { demandConditions, SELLER_DEMAND_MIN_PEOPLE } from './shop-demand.mjs';
import { internalMemberIds } from './growth-events.mjs';

const FETCH_LIMIT = 2000;
const GROUP_LIMIT = 30;

// 条件の並びから、表示順に依存しないグループ鍵を作る（「黒 綿 M」と「M 綿 黒」は同じ需要）。
export function demandGroupKey(conditions = []) {
  return [...new Set(conditions.map((condition) => String(condition?.label || '').toLowerCase()).filter(Boolean))]
    .sort()
    .join('|');
}

// active な探し中だけを取る。ここが §6 の本体。
const ACTIVE_WISH_SQL = `SELECT member_id, query_text, created_at, updated_at
  FROM member_wishes
  WHERE notify_new_match=1
    AND insight_enabled_at IS NOT NULL AND insight_enabled_at<>''
    AND UPPER(COALESCE(watch_frequency,'INSTANT'))<>'MUTED'
  ORDER BY updated_at DESC
  LIMIT ${FETCH_LIMIT}`;

// 戻り値: { items, min_people, below_threshold, active_total, active_members }
// items[] = { conditions, query（条件を並べた表示用文字列）, people, last_at }
export async function searchingDemandOverview(env = {}, options = {}) {
  const minPeople = Number(options.minPeople) > 0
    ? Number(options.minPeople)
    : Number(env?.SHOP_DEMAND_SELLER_MIN_PEOPLE) || SELLER_DEMAND_MIN_PEOPLE;
  const empty = {
    items: [], min_people: minPeople,
    below_threshold: { groups: 0, people: 0 },
    active_total: 0, active_members: 0
  };
  if (!env?.PRODUCT_DB?.prepare) return empty;
  let rows = [];
  try {
    const result = await env.PRODUCT_DB.prepare(ACTIVE_WISH_SQL).all();
    rows = result?.results || [];
  } catch {
    return empty;
  }
  const internal = internalMemberIds(env);
  const groups = new Map();
  const activeMembers = new Set();
  let activeTotal = 0;
  for (const row of rows) {
    const memberId = String(row?.member_id || '');
    if (!memberId || internal.has(memberId)) continue;
    activeTotal += 1;
    activeMembers.add(memberId);
    const conditions = demandConditions(row?.query_text);
    const key = demandGroupKey(conditions);
    if (!key) continue;
    const group = groups.get(key) || { conditions, members: new Set(), lastAt: '' };
    group.members.add(memberId);
    const at = String(row?.updated_at || row?.created_at || '');
    if (at > group.lastAt) group.lastAt = at;
    groups.set(key, group);
  }
  const ranked = [...groups.values()]
    .map((group) => ({
      conditions: group.conditions.map((condition) => String(condition?.label || '')).filter(Boolean),
      people: group.members.size,
      last_at: group.lastAt
    }))
    .sort((a, b) => b.people - a.people || (a.last_at < b.last_at ? 1 : -1));
  const visible = ranked.filter((group) => group.people >= minPeople).slice(0, GROUP_LIMIT);
  const below = ranked.filter((group) => group.people < minPeople);
  return {
    items: visible.map((group) => ({ ...group, query: group.conditions.join('・') })),
    min_people: minPeople,
    below_threshold: { groups: below.length, people: below.reduce((sum, group) => sum + group.people, 0) },
    active_total: activeTotal,
    active_members: activeMembers.size
  };
}
