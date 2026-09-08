const SCORE_WEIGHTS = Object.freeze({
  searchCompletionsPerThousandReach: 0.3,
  wishSaveRate: 0.2,
  marketplaceClickRate: 0.2,
  saveRate: 0.1,
  shareRate: 0.1,
  nonFollowerRate: 0.1,
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function safeRate(numerator, denominator) {
  const base = number(denominator);
  return base > 0 ? number(numerator) / base : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + number(row[field]), 0);
}

function metricsFor(rows) {
  const reach = sum(rows, "reach");
  const searchCompletions = sum(rows, "search_completions");
  const wishSaves = sum(rows, "wish_saves");

  return {
    reach,
    searchCompletions,
    searchCompletionsPerThousandReach:
      safeRate(searchCompletions * 1000, reach),
    wishSaveRate: safeRate(wishSaves, searchCompletions),
    marketplaceClickRate: safeRate(
      sum(rows, "marketplace_clicks"),
      searchCompletions,
    ),
    saveRate: safeRate(sum(rows, "saves"), reach),
    shareRate: safeRate(sum(rows, "shares"), reach),
    nonFollowerRate: safeRate(sum(rows, "non_follower_reach"), reach),
  };
}

function scoreGroups(groups) {
  const eligible = groups.filter((group) => group.sampleQualified);
  const medians = {};
  for (const metric of Object.keys(SCORE_WEIGHTS)) {
    medians[metric] = median(
      eligible.map((group) => group.metrics[metric]).filter(Number.isFinite),
    );
  }

  return groups.map((group) => {
    if (!group.sampleQualified) {
      return { ...group, score: null, decision: "COLLECT_MORE_DATA" };
    }

    let weightedScore = 0;
    let usedWeight = 0;
    for (const [metric, weight] of Object.entries(SCORE_WEIGHTS)) {
      const value = group.metrics[metric];
      const baseline = medians[metric];
      if (!Number.isFinite(value) || !Number.isFinite(baseline)) continue;
      const index = baseline > 0 ? Math.min(value / baseline, 3) : value > 0 ? 1 : 0;
      weightedScore += index * weight;
      usedWeight += weight;
    }
    const score = usedWeight > 0 ? weightedScore / usedWeight : 0;
    const decision =
      score >= 1.15 ? "INCREASE_5_POINTS" :
      score < 0.75 ? "DECREASE_5_POINTS" :
      "MAINTAIN";
    return { ...group, score, decision };
  });
}

export function summarizeCategoryPerformance(
  rows,
  { elapsedHours = 168, minimumPosts = 3 } = {},
) {
  const snapshots = rows.filter(
    (row) => number(row.elapsed_hours) === elapsedHours && row.post_id,
  );
  const cohorts = new Map();

  for (const row of snapshots) {
    const key = [row.channel, row.format, row.category].join("|");
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(row);
  }

  const groups = [...cohorts.entries()].map(([key, cohortRows]) => {
    const [channel, format, category] = key.split("|");
    const postCount = new Set(cohortRows.map((row) => row.post_id)).size;
    return {
      channel,
      format,
      category,
      postCount,
      sampleQualified: postCount >= minimumPosts,
      metrics: metricsFor(cohortRows),
    };
  });

  return scoreGroups(groups).sort((a, b) => {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
}

export { SCORE_WEIGHTS };
