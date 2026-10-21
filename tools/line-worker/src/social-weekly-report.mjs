const EXCLUDED_TRAFFIC = new Set(['QA', 'INTERNAL']);

export function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function nullableRate(numerator, denominator) {
  const top = nullableNumber(numerator);
  const base = nullableNumber(denominator);
  return top === null || base === null || base === 0 ? null : top / base;
}

function completeSum(values) {
  const normalized = values.map(nullableNumber);
  return normalized.some(value => value === null)
    ? null
    : normalized.reduce((sum, value) => sum + value, 0);
}

function latestPerPost(rows) {
  const latest = new Map();
  for (const row of rows) {
    if (!row?.post_id || EXCLUDED_TRAFFIC.has(String(row.traffic_class || '').toUpperCase())) continue;
    const previous = latest.get(row.post_id);
    if (!previous || String(row.snapshot_at || '') > String(previous.snapshot_at || '')) {
      latest.set(row.post_id, row);
    }
  }
  return [...latest.values()];
}

export function postPerformance(row) {
  const reactions = completeSum([row.saves, row.shares, row.comments]);
  return {
    ...row,
    reactions,
    reaction_rate: nullableRate(reactions, row.impressions),
    ctr: nullableRate(row.link_clicks, row.impressions),
    registration_cvr: nullableRate(row.free_registrations, row.link_clicks),
    outbound_cvr: nullableRate(row.marketplace_clicks, row.search_starts)
  };
}

function aggregate(rows, field) {
  return completeSum(rows.map(row => row[field]));
}

function weekMetrics(rows) {
  const posts = latestPerPost(rows).map(postPerformance);
  const reactions = completeSum(posts.map(post => post.reactions));
  return {
    post_count: posts.length,
    reactions_per_post: posts.length && reactions !== null ? reactions / posts.length : null,
    ctr: nullableRate(aggregate(posts, 'link_clicks'), aggregate(posts, 'impressions')),
    registration_cvr: nullableRate(
      aggregate(posts, 'free_registrations'),
      aggregate(posts, 'link_clicks')
    ),
    outbound_cvr: nullableRate(
      aggregate(posts, 'marketplace_clicks'),
      aggregate(posts, 'search_starts')
    )
  };
}

function weekOverWeek(current, previous) {
  const result = {};
  for (const key of ['post_count', 'reactions_per_post', 'ctr', 'registration_cvr', 'outbound_cvr']) {
    const now = nullableNumber(current[key]);
    const before = nullableNumber(previous[key]);
    result[key] = now === null || before === null || before === 0 ? null : (now - before) / before;
  }
  return result;
}

function rankedPosts(rows) {
  return latestPerPost(rows).map(postPerformance)
    .filter(post => post.reaction_rate !== null)
    .sort((left, right) => right.reaction_rate - left.reaction_rate);
}

function pattern(post) {
  return {
    post_id: post?.post_id || null,
    platform: post?.platform || null,
    concept: post?.concept || null,
    cta: post?.cta || null,
    reaction_rate: post?.reaction_rate ?? null
  };
}

export function buildSocialWeeklyReport(currentRows, previousRows = []) {
  const ranked = rankedPosts(currentRows);
  const current = weekMetrics(currentRows);
  const previous = weekMetrics(previousRows);
  const top = ranked.slice(0, 3);
  const bottom = ranked.length > 3 ? [...ranked].reverse().slice(0, 3) : [];
  return {
    current,
    previous,
    week_over_week: weekOverWeek(current, previous),
    top_3: top,
    bottom_3: bottom,
    hypotheses: [
      ...top.map(post => `${post.post_id}: 高反応の要因候補は企画「${post.concept || '未設定'}」とCTA「${post.cta || '未設定'}」`),
      ...bottom.map(post => `${post.post_id}: 低反応の要因候補は企画・冒頭・CTA・投稿時刻の再検証が必要`)
    ],
    next_week: {
      keep: top.length ? pattern(top[0]) : null,
      stop: bottom.length ? pattern(bottom[0]) : null,
      try: { recommendation: '上位企画の冒頭を維持し、CTAまたは形式を1要素だけ変更して比較する' }
    },
    missing_note: 'NULLは未取得として保持し、0へ変換しない。QA・INTERNALは集計対象外。'
  };
}

export function displayMetric(value, { percent = false } = {}) {
  const numeric = nullableNumber(value);
  if (numeric === null) return '未取得';
  return percent ? `${(numeric * 100).toFixed(2)}%` : String(numeric);
}
