/**
 * Reproducible evaluator for HOSHILU ambiguous-memory search.
 *
 * Gold cases must reference real ITG product IDs/ASINs. Never invent a target.
 * The evaluator is intentionally independent from the production search engine:
 * callers inject a `search(query, testCase)` function returning ranked results.
 */

const DEFAULT_K = 10;

function asSet(values) {
  return new Set((Array.isArray(values) ? values : []).map(String));
}

function productId(result) {
  return String(
    result?.product_id ||
      result?.productId ||
      result?.asin ||
      result?.id ||
      "",
  );
}

function categoryId(result) {
  return String(
    result?.category_id ||
      result?.categoryId ||
      result?.category ||
      "",
  );
}

function resultText(result) {
  return [
    result?.product_name,
    result?.productName,
    result?.title,
    result?.manufacturer,
  ].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
}

function relevance(result, goldProducts, goldCategories) {
  if (goldProducts.has(productId(result))) return 2;
  if (goldCategories.has(categoryId(result))) return 1;
  return 0;
}

function dcg(relevances) {
  return relevances.reduce(
    (sum, rel, index) => sum + (2 ** rel - 1) / Math.log2(index + 2),
    0,
  );
}

function ndcgAt(results, goldProducts, goldCategories, k) {
  const actual = results
    .slice(0, k)
    .map((result) => relevance(result, goldProducts, goldCategories));
  const ideal = [
    ...Array(Math.min(goldProducts.size, k)).fill(2),
    ...Array(Math.min(goldCategories.size, Math.max(0, k - goldProducts.size))).fill(1),
  ].slice(0, k);
  const denominator = dcg(ideal);
  return denominator ? dcg(actual) / denominator : 0;
}

function reciprocalRank(results, goldProducts) {
  const index = results.findIndex((result) => goldProducts.has(productId(result)));
  return index < 0 ? 0 : 1 / (index + 1);
}

function categoryMatch(results, goldCategories) {
  if (!goldCategories.size) return null;
  return results.some((result) => goldCategories.has(categoryId(result)));
}

function mean(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  return numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : 0;
}

function percent(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

export function validateGoldCase(testCase) {
  const errors = [];
  if (!testCase?.case_id) errors.push("case_id is required");
  if (!testCase?.target_id) errors.push("target_id is required");
  if (!testCase?.query) errors.push("query is required");
  if (!["rich", "ambiguous", "ultra_ambiguous"].includes(testCase?.information_level)) {
    errors.push("information_level must be rich, ambiguous, or ultra_ambiguous");
  }
  if (!Array.isArray(testCase?.correct_product_ids) || !testCase.correct_product_ids.length) {
    errors.push("at least one real correct_product_id/ASIN is required");
  }
  if (!Array.isArray(testCase?.query_types) || !testCase.query_types.length) {
    errors.push("query_types must contain at least one type");
  }
  if (testCase?.contains_personal_data === true) {
    errors.push("personal data is forbidden");
  }
  return errors;
}

export function scoreCase(testCase, searchResponse, k = DEFAULT_K) {
  const validationErrors = validateGoldCase(testCase);
  if (validationErrors.length) {
    throw new Error(`${testCase?.case_id || "unknown"}: ${validationErrors.join("; ")}`);
  }

  const results = Array.isArray(searchResponse?.results)
    ? searchResponse.results.slice(0, k)
    : [];
  const goldProducts = asSet(testCase.correct_product_ids);
  const goldCategories = asSet(testCase.acceptable_category_ids);
  const firstId = results.length ? productId(results[0]) : "";
  const top3 = results.slice(0, 3).some((result) => goldProducts.has(productId(result)));
  const top10 = results.slice(0, 10).some((result) => goldProducts.has(productId(result)));
  const hasCorrect = results.some((result) => goldProducts.has(productId(result)));
  const noAnswer =
    searchResponse?.no_answer === true ||
    (!results.length && !searchResponse?.clarification_question);

  const forbiddenPatterns = (testCase.forbidden_result_patterns || [])
    .map((pattern) => new RegExp(pattern, "iu"));
  const criticalViolations = results.slice(0, 10).flatMap((result, index) => {
    const text = resultText(result);
    return forbiddenPatterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => ({
        rank: index + 1,
        product_id: productId(result),
        pattern: pattern.source,
      }));
  });

  return {
    case_id: testCase.case_id,
    target_id: testCase.target_id,
    information_level: testCase.information_level,
    query_types: [...testCase.query_types],
    top1: goldProducts.has(firstId),
    top3,
    top10,
    category_match: categoryMatch(results, goldCategories),
    reciprocal_rank: reciprocalRank(results, goldProducts),
    ndcg_at_10: ndcgAt(results, goldProducts, goldCategories, k),
    no_answer: noAnswer,
    wrong_answer: Boolean(results.length && !hasCorrect),
    critical_constraint_violation: criticalViolations.length > 0,
    critical_violations: criticalViolations,
    clarification_asked: Boolean(searchResponse?.clarification_question),
    wish_suggested: searchResponse?.wish_suggested === true,
    result_count: results.length,
  };
}

function summarizeScores(scores) {
  const categoryScores = scores
    .map((score) => score.category_match)
    .filter((value) => value !== null);
  return {
    cases: scores.length,
    top1: percent(scores.filter((score) => score.top1).length, scores.length),
    top3: percent(scores.filter((score) => score.top3).length, scores.length),
    top10: percent(scores.filter((score) => score.top10).length, scores.length),
    category_match: percent(
      categoryScores.filter(Boolean).length,
      categoryScores.length,
    ),
    mrr: mean(scores.map((score) => score.reciprocal_rank)),
    ndcg_at_10: mean(scores.map((score) => score.ndcg_at_10)),
    no_answer_rate: percent(
      scores.filter((score) => score.no_answer).length,
      scores.length,
    ),
    wrong_answer_rate: percent(
      scores.filter((score) => score.wrong_answer).length,
      scores.length,
    ),
    critical_constraint_violation_rate: percent(
      scores.filter((score) => score.critical_constraint_violation).length,
      scores.length,
    ),
    clarification_rate: percent(
      scores.filter((score) => score.clarification_asked).length,
      scores.length,
    ),
    wish_suggestion_rate: percent(
      scores.filter((score) => score.wish_suggested).length,
      scores.length,
    ),
  };
}

function breakdown(scores, key, multiValue = false) {
  const groups = new Map();
  for (const score of scores) {
    const values = multiValue ? score[key] : [score[key]];
    for (const value of values || []) {
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(score);
    }
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([name, groupScores]) => [name, summarizeScores(groupScores)]),
  );
}

export async function evaluateGoldDataset({
  cases,
  search,
  concurrency = 4,
  k = DEFAULT_K,
}) {
  if (!Array.isArray(cases) || !cases.length) {
    throw new Error("Gold dataset must contain at least one case");
  }
  if (typeof search !== "function") throw new Error("search function is required");

  const scores = new Array(cases.length);
  let cursor = 0;
  async function worker() {
    while (cursor < cases.length) {
      const index = cursor;
      cursor += 1;
      const testCase = cases[index];
      const response = await search(testCase.query, testCase);
      scores[index] = scoreCase(testCase, response, k);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(Number(concurrency) || 1, cases.length)) },
      worker,
    ),
  );

  return {
    generated_at: new Date().toISOString(),
    k,
    overall: summarizeScores(scores),
    by_information_level: breakdown(scores, "information_level"),
    by_query_type: breakdown(scores, "query_types", true),
    cases: scores,
  };
}

export function compareReports(baseline, candidate) {
  const metrics = [
    "top1",
    "top3",
    "top10",
    "category_match",
    "mrr",
    "ndcg_at_10",
    "no_answer_rate",
    "wrong_answer_rate",
    "critical_constraint_violation_rate",
  ];
  return Object.fromEntries(
    metrics.map((metric) => [
      metric,
      {
        baseline: Number(baseline?.overall?.[metric] || 0),
        candidate: Number(candidate?.overall?.[metric] || 0),
        delta:
          Number(candidate?.overall?.[metric] || 0) -
          Number(baseline?.overall?.[metric] || 0),
      },
    ]),
  );
}
