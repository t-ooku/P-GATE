import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEnglishChineseStressCorpus,
  buildMarketplaceQueryCorpus,
  evaluateMarketplaceQueryCorpus,
  MARKETPLACE_QUERY_NEGATIVE_CASES,
  scoreMarketplaceQueryCase,
} from "../evaluation/marketplace-query-quality.mjs";
import {
  buildQoo10SearchKeywords,
} from "../public/marketplace-search-keywords-v2.mjs";

test("日英中韓640件の検索語コーパスを決定論的に生成する", () => {
  const corpus = buildMarketplaceQueryCorpus();
  assert.equal(corpus.length, 640);
  assert.deepEqual(new Set(corpus.map((item) => item.locale)), new Set(["ja", "en", "zh", "ko"]));
  assert.equal(new Set(corpus.map((item) => item.case_id)).size, corpus.length);
});

test("英語200件・中国語400件の重点コーパスを追加する", () => {
  const corpus = buildEnglishChineseStressCorpus();
  assert.equal(corpus.length, 600);
  assert.equal(corpus.filter((item) => item.locale === "en").length, 200);
  assert.equal(corpus.filter((item) => item.locale === "zh").length, 400);
  assert.equal(new Set(corpus.map((item) => item.case_id)).size, corpus.length);
});

test("検索語評価は必須条件の欠落・禁止条件・空・長すぎる語を分ける", () => {
  const score = scoreMarketplaceQueryCase(
    {
      case_id: "sample",
      locale: "ja",
      category: "earphones",
      required_tokens: ["透明", "イヤホン"],
      forbidden_tokens: ["有線"],
      max_length: 20,
    },
    "透明 有線 イヤホン",
  );
  assert.equal(score.passed, false);
  assert.deepEqual(score.missing_required, []);
  assert.deepEqual(score.leaked_forbidden, ["有線"]);
});

test("Qoo10向け検索語は640件と重要な負例で必須条件を保持する", () => {
  const cases = [
    ...buildMarketplaceQueryCorpus(),
    ...buildEnglishChineseStressCorpus(),
    ...MARKETPLACE_QUERY_NEGATIVE_CASES,
  ];
  const report = evaluateMarketplaceQueryCorpus(
    cases,
    (input) => buildQoo10SearchKeywords(input),
  );
  assert.equal(report.overall.cases, 1249);
  assert.equal(report.overall.pass_rate, 1, JSON.stringify(report.failures.slice(0, 10), null, 2));
  assert.equal(report.overall.empty_rate, 0);
  assert.equal(report.overall.required_token_violation_rate, 0);
  assert.equal(report.overall.forbidden_token_leak_rate, 0);
  for (const locale of ["ja", "en", "zh", "ko"]) {
    assert.equal(report.by_locale[locale].pass_rate, 1);
  }
});
