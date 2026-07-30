import {
  buildEnglishChineseStressCorpus,
  buildMarketplaceQueryCorpus,
  evaluateMarketplaceQueryCorpus,
  MARKETPLACE_QUERY_NEGATIVE_CASES,
} from "../evaluation/marketplace-query-quality.mjs";
import {
  buildQoo10SearchKeywords,
} from "../public/marketplace-search-keywords-v2.mjs";

const cases = [
  ...buildMarketplaceQueryCorpus(),
  ...buildEnglishChineseStressCorpus(),
  ...MARKETPLACE_QUERY_NEGATIVE_CASES,
];
const report = evaluateMarketplaceQueryCorpus(
  cases,
  (input) => buildQoo10SearchKeywords(input),
);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.overall.pass_rate < 1) process.exitCode = 1;
