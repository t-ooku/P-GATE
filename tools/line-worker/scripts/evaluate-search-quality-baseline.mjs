import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SEARCH_QUALITY_CASES } from '../evaluation/search-quality-cases.mjs';
import { scoreSearchQualityBaseline, validateSearchQualityCases } from '../evaluation/search-quality-baseline.mjs';
import { filterCategoryMismatches } from '../src/knowledge-search.mjs';
import { isMarketplaceProductUrl } from '../src/marketplace-product-url-policy.mjs';

const errors = validateSearchQualityCases(SEARCH_QUALITY_CASES);
if (errors.length) throw new Error(errors.join('\n'));

const observations = SEARCH_QUALITY_CASES.map((item) => {
  const candidates = [
    { asin: `${item.case_id}-OK`, product_name: item.display_ok || 'expected matching product' },
    { asin: `${item.case_id}-NG`, product_name: item.display_ng || 'unrelated product' }
  ];
  const accepted = new Set(filterCategoryMismatches(item.query, candidates).map((value) => value.asin));
  const okAccepted = accepted.has(`${item.case_id}-OK`);
  const ngAccepted = accepted.has(`${item.case_id}-NG`);
  const observation = { case_id: item.case_id, measured: false };

  if (item.reason_code === 'PRODUCT_TYPE_MISMATCH') {
    Object.assign(observation, { measured: true, product_type_match: okAccepted && !ngAccepted });
  }
  if (['REQUIRED_ATTRIBUTE_MISSING','EVIDENCE_INSUFFICIENT'].includes(item.reason_code)) {
    Object.assign(observation, { measured: true, required_attributes_satisfied: okAccepted && !ngAccepted });
  }
  if (item.reason_code === 'EXCLUDED_ATTRIBUTE_MATCHED') {
    Object.assign(observation, { measured: true, exclusion_violation: ngAccepted });
  }
  if (item.reason_code === 'ACCESSORY_ONLY') {
    Object.assign(observation, { measured: true, accessory_confusion: ngAccepted });
  }
  if (['COMPATIBILITY_MISMATCH','VOLTAGE_MISMATCH'].includes(item.reason_code)) {
    Object.assign(observation, { measured: true, compatibility_match: okAccepted && !ngAccepted });
  }
  if (['AMBIGUOUS_QUERY','CONTRADICTORY_QUERY','ZERO_CANDIDATE_AFTER_FILTER'].includes(item.reason_code)) {
    Object.assign(observation, { measured: true, zero_result_honest: accepted.size === 0 });
  }
  if (item.reason_code === 'PRODUCT_URL_UNVERIFIED') {
    Object.assign(observation, {
      measured: true,
      marketplace_urls_verified:
        isMarketplaceProductUrl('RAKUTEN_JP', 'https://item.rakuten.co.jp/shop/confirmed-product/') &&
        !isMarketplaceProductUrl('RAKUTEN_JP', 'https://search.rakuten.co.jp/search/mall/product/')
    });
  }
  return observation;
});

const report = {
  generated_at: new Date().toISOString(),
  implementation: 'legacy-filter-baseline',
  notes: [
    'Candidate-level checks use deterministic positive and negative fixtures.',
    'Top-1, Top-3, nDCG and MRR require confirmed catalog product IDs and remain unmeasured for this supplied dataset.',
    'Unmeasured metrics are null, never coerced to zero.'
  ],
  ...scoreSearchQualityBaseline(SEARCH_QUALITY_CASES, observations)
};

if (process.argv.includes('--check')) {
  const baseline = JSON.parse(await readFile(resolve('evaluation/search-quality-phase1-baseline.json'), 'utf8'));
  const regressions = [];
  const lowerIsBetter = new Set(['exclusion_violation_rate', 'accessory_confusion_rate']);
  for (const [name, expected] of Object.entries(baseline.metrics || {})) {
    const actual = report.metrics[name];
    if (expected === null || actual === null) continue;
    const regressed = lowerIsBetter.has(name) ? actual > expected : actual < expected;
    if (regressed) regressions.push(`${name}: ${expected} -> ${actual}`);
  }
  if (report.cases < baseline.cases || report.measured_cases < baseline.measured_cases) {
    regressions.push(`coverage: ${baseline.measured_cases}/${baseline.cases} -> ${report.measured_cases}/${report.cases}`);
  }
  if (regressions.length) throw new Error(`SEARCH_QUALITY_REGRESSION\n${regressions.join('\n')}`);
  console.log(JSON.stringify({ ok: true, cases: report.cases, measured_cases: report.measured_cases, metrics: report.metrics }));
  process.exit(0);
}

const outputPath = resolve(process.argv[2] || 'evaluation/search-quality-phase1-baseline.json');
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: outputPath, cases: report.cases, measured_cases: report.measured_cases, metrics: report.metrics }));
