const REQUIRED_REASON_CODES = new Set([
  'PRODUCT_TYPE_MISMATCH', 'REQUIRED_ATTRIBUTE_MISSING', 'EXCLUDED_ATTRIBUTE_MATCHED',
  'ACCESSORY_ONLY', 'COMPATIBILITY_MISMATCH', 'VOLTAGE_MISMATCH',
  'EVIDENCE_INSUFFICIENT', 'PRODUCT_URL_UNVERIFIED', 'AMBIGUOUS_QUERY',
  'CONTRADICTORY_QUERY', 'ZERO_CANDIDATE_AFTER_FILTER'
]);

const ratio = (passed, measured) => measured ? passed / measured : null;

const ABSOLUTE_QUALITY_GATES = Object.freeze({
  product_type_accuracy: { direction: 'min', value: 1 },
  required_attribute_satisfaction: { direction: 'min', value: 1 },
  exclusion_violation_rate: { direction: 'max', value: 0 },
  accessory_confusion_rate: { direction: 'max', value: 0 },
  compatibility_accuracy: { direction: 'min', value: 1 },
  zero_result_honesty: { direction: 'min', value: 1 },
  marketplace_url_precision: { direction: 'min', value: 1 }
});

export function searchQualityGateFailures(report, minimumCases = 50) {
  const failures = [];
  if (Number(report?.cases || 0) < minimumCases || Number(report?.measured_cases || 0) < minimumCases) {
    failures.push(`coverage: ${report?.measured_cases || 0}/${report?.cases || 0}; required ${minimumCases}/${minimumCases}`);
  }
  for (const [name, gate] of Object.entries(ABSOLUTE_QUALITY_GATES)) {
    const actual = report?.metrics?.[name];
    if (typeof actual !== 'number') {
      failures.push(`${name}: unmeasured; required ${gate.direction} ${gate.value}`);
      continue;
    }
    if ((gate.direction === 'min' && actual < gate.value)
      || (gate.direction === 'max' && actual > gate.value)) {
      failures.push(`${name}: ${actual}; required ${gate.direction} ${gate.value}`);
    }
  }
  return failures;
}

export function validateSearchQualityCases(cases) {
  const errors = [];
  const ids = new Set();
  if (!Array.isArray(cases) || cases.length !== 50) errors.push('exactly 50 cases are required');
  for (const item of cases || []) {
    if (!item.case_id || ids.has(item.case_id)) errors.push(`invalid or duplicate case_id: ${item.case_id || ''}`);
    ids.add(item.case_id);
    if (!['ja','en','ko','zh'].includes(item.locale)) errors.push(`${item.case_id}: unsupported locale`);
    if (!item.query || !item.product_type) errors.push(`${item.case_id}: query and product_type are required`);
    if (!Array.isArray(item.required_attributes) || !Array.isArray(item.excluded_attributes)) errors.push(`${item.case_id}: attribute arrays are required`);
    if (!REQUIRED_REASON_CODES.has(item.reason_code)) errors.push(`${item.case_id}: unknown reason_code`);
  }
  return errors;
}

export function scoreSearchQualityBaseline(cases, observations = []) {
  const byId = new Map(observations.map((item) => [item.case_id, item]));
  const metrics = {
    product_type_accuracy: { passed: 0, measured: 0 },
    required_attribute_satisfaction: { passed: 0, measured: 0 },
    exclusion_violation_rate: { violations: 0, measured: 0 },
    accessory_confusion_rate: { violations: 0, measured: 0 },
    compatibility_accuracy: { passed: 0, measured: 0 },
    clarification_appropriateness: { passed: 0, measured: 0 },
    zero_result_honesty: { passed: 0, measured: 0 },
    marketplace_url_precision: { passed: 0, measured: 0 }
  };
  const scoredCases = cases.map((item) => {
    const observation = byId.get(item.case_id) || {};
    const measured = observation.measured === true;
    if (measured) {
      if (typeof observation.product_type_match === 'boolean') {
        metrics.product_type_accuracy.measured++;
        metrics.product_type_accuracy.passed += Number(observation.product_type_match);
      }
      if (typeof observation.required_attributes_satisfied === 'boolean') {
        metrics.required_attribute_satisfaction.measured++;
        metrics.required_attribute_satisfaction.passed += Number(observation.required_attributes_satisfied);
      }
      if (typeof observation.exclusion_violation === 'boolean') {
        metrics.exclusion_violation_rate.measured++;
        metrics.exclusion_violation_rate.violations += Number(observation.exclusion_violation);
      }
      if (typeof observation.accessory_confusion === 'boolean') {
        metrics.accessory_confusion_rate.measured++;
        metrics.accessory_confusion_rate.violations += Number(observation.accessory_confusion);
      }
      if (typeof observation.compatibility_match === 'boolean') {
        metrics.compatibility_accuracy.measured++;
        metrics.compatibility_accuracy.passed += Number(observation.compatibility_match);
      }
      if (typeof observation.clarification_appropriate === 'boolean') {
        metrics.clarification_appropriateness.measured++;
        metrics.clarification_appropriateness.passed += Number(observation.clarification_appropriate);
      }
      if (typeof observation.zero_result_honest === 'boolean') {
        metrics.zero_result_honesty.measured++;
        metrics.zero_result_honesty.passed += Number(observation.zero_result_honest);
      }
      if (typeof observation.marketplace_urls_verified === 'boolean') {
        metrics.marketplace_url_precision.measured++;
        metrics.marketplace_url_precision.passed += Number(observation.marketplace_urls_verified);
      }
    }
    return { case_id: item.case_id, measured, ...observation };
  });
  return {
    schema_version: 1,
    cases: cases.length,
    measured_cases: scoredCases.filter((item) => item.measured).length,
    metrics: {
      product_type_accuracy: ratio(metrics.product_type_accuracy.passed, metrics.product_type_accuracy.measured),
      required_attribute_satisfaction: ratio(metrics.required_attribute_satisfaction.passed, metrics.required_attribute_satisfaction.measured),
      exclusion_violation_rate: ratio(metrics.exclusion_violation_rate.violations, metrics.exclusion_violation_rate.measured),
      accessory_confusion_rate: ratio(metrics.accessory_confusion_rate.violations, metrics.accessory_confusion_rate.measured),
      compatibility_accuracy: ratio(metrics.compatibility_accuracy.passed, metrics.compatibility_accuracy.measured),
      clarification_appropriateness: ratio(metrics.clarification_appropriateness.passed, metrics.clarification_appropriateness.measured),
      zero_result_honesty: ratio(metrics.zero_result_honesty.passed, metrics.zero_result_honesty.measured),
      marketplace_url_precision: ratio(metrics.marketplace_url_precision.passed, metrics.marketplace_url_precision.measured)
    },
    measurement_counts: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, value.measured])),
    case_results: scoredCases
  };
}
