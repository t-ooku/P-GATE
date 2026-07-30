import test from "node:test";
import assert from "node:assert/strict";

import {
  compareReports,
  evaluateGoldDataset,
  scoreCase,
  validateGoldCase,
} from "../evaluation/ambiguous-search-evaluator.mjs";

const gold = {
  case_id: "target-01-rich",
  target_id: "target-01",
  query: "白くて手のひらサイズのUSB加湿器",
  information_level: "rich",
  correct_product_ids: ["B000REAL01"],
  acceptable_category_ids: ["humidifier"],
  synonyms: ["卓上加湿器", "USBミスト"],
  query_types: ["shape_function", "usage_scene"],
  expected_behavior: "answer",
  contains_personal_data: false,
  label_source: "itg_catalog",
};

test("valid gold case has no validation errors", () => {
  assert.deepEqual(validateGoldCase(gold), []);
});

test("personal data is rejected", () => {
  assert.match(
    validateGoldCase({ ...gold, contains_personal_data: true }).join(" "),
    /personal data/,
  );
});

test("scores Top-1, Top-3, category, MRR and nDCG", () => {
  const score = scoreCase(gold, {
    results: [
      { product_id: "B000REAL01", category_id: "humidifier" },
      { product_id: "B000OTHER", category_id: "humidifier" },
    ],
  });
  assert.equal(score.top1, true);
  assert.equal(score.top3, true);
  assert.equal(score.top10, true);
  assert.equal(score.category_match, true);
  assert.equal(score.reciprocal_rank, 1);
  assert.equal(score.ndcg_at_10, 1);
  assert.equal(score.wrong_answer, false);
});

test("Top-10と重大な条件違反を検出する", () => {
  const results = Array.from({ length: 10 }, (_, index) => ({
    product_id: index === 8 ? "B000REAL01" : `OTHER-${index}`,
    category_id: "humidifier",
    product_name: index === 0 ? "Wired USB humidifier" : `Candidate ${index}`,
  }));
  const score = scoreCase(
    { ...gold, forbidden_result_patterns: ["\\bwired\\b"] },
    { results },
  );
  assert.equal(score.top3, false);
  assert.equal(score.top10, true);
  assert.equal(score.critical_constraint_violation, true);
  assert.equal(score.critical_violations[0].rank, 1);
});

test("aggregates dimensions and compares reports", async () => {
  const report = await evaluateGoldDataset({
    cases: [gold],
    search: async () => ({
      results: [{ asin: "B000REAL01", category: "humidifier" }],
    }),
  });
  assert.equal(report.overall.top1, 1);
  assert.equal(report.by_information_level.rich.cases, 1);
  assert.equal(report.by_query_type.shape_function.cases, 1);

  const comparison = compareReports(
    { overall: { top1: 0.5, wrong_answer_rate: 0.4 } },
    { overall: { top1: 0.8, wrong_answer_rate: 0.1 } },
  );
  assert.ok(comparison.top1.delta > 0);
  assert.ok(comparison.wrong_answer_rate.delta < 0);
});
