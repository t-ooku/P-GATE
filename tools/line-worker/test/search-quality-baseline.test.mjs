import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_QUALITY_CASES } from '../evaluation/search-quality-cases.mjs';
import {
  scoreSearchQualityBaseline,
  searchQualityGateFailures,
  validateSearchQualityCases
} from '../evaluation/search-quality-baseline.mjs';

test('Phase 1 fixture contains exactly 50 valid multilingual cases', () => {
  assert.deepEqual(validateSearchQualityCases(SEARCH_QUALITY_CASES), []);
  assert.equal(SEARCH_QUALITY_CASES.length, 50);
  assert.deepEqual(new Set(SEARCH_QUALITY_CASES.map((item) => item.locale)), new Set(['ja','en','ko','zh']));
});

test('unmeasured metrics remain null instead of being reported as zero', () => {
  const report = scoreSearchQualityBaseline(SEARCH_QUALITY_CASES);
  assert.equal(report.cases, 50);
  assert.equal(report.measured_cases, 0);
  assert.equal(report.metrics.product_type_accuracy, null);
  assert.equal(report.metrics.exclusion_violation_rate, null);
  assert.equal(report.metrics.marketplace_url_precision, null);
});

test('baseline scorer separates accuracy metrics from violation rates', () => {
  const report = scoreSearchQualityBaseline(SEARCH_QUALITY_CASES, [{
    case_id: 'SQ-01', measured: true,
    product_type_match: true,
    required_attributes_satisfied: true,
    exclusion_violation: false,
    accessory_confusion: false,
    marketplace_urls_verified: true
  }]);
  assert.equal(report.measured_cases, 1);
  assert.equal(report.metrics.product_type_accuracy, 1);
  assert.equal(report.metrics.exclusion_violation_rate, 0);
  assert.equal(report.metrics.accessory_confusion_rate, 0);
  assert.equal(report.metrics.marketplace_url_precision, 1);
});

test('absolute quality gate rejects a non-regressing but unsafe baseline', () => {
  const unsafe = {
    cases: 50,
    measured_cases: 50,
    metrics: {
      product_type_accuracy: 0.5,
      required_attribute_satisfaction: 0.5,
      exclusion_violation_rate: 0.5,
      accessory_confusion_rate: 0.5,
      compatibility_accuracy: 0.5,
      zero_result_honesty: 0.5,
      marketplace_url_precision: 1
    }
  };
  assert.match(searchQualityGateFailures(unsafe).join('\n'), /product_type_accuracy/);
  assert.match(searchQualityGateFailures(unsafe).join('\n'), /accessory_confusion_rate/);
});

test('absolute quality gate accepts all 50 deterministic evidence checks at target', () => {
  const report = {
    cases: 50,
    measured_cases: 50,
    metrics: {
      product_type_accuracy: 1,
      required_attribute_satisfaction: 1,
      exclusion_violation_rate: 0,
      accessory_confusion_rate: 0,
      compatibility_accuracy: 1,
      zero_result_honesty: 1,
      marketplace_url_precision: 1
    }
  };
  assert.deepEqual(searchQualityGateFailures(report), []);
});
