import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessoryClassifierEnabled,
  classifyBodyAccessory,
  filterAccessoryOnlyCandidates,
  maybeFilterAccessoryOnlyCandidates
} from '../src/search-quality/body-accessory-classifier.mjs';

const CASES = [
  ['ja', 'CAMERA', 'ミラーレスカメラ本体', 'カメラバッグ'],
  ['en', 'CAMERA', 'mirrorless camera body', 'protective camera bag'],
  ['ko', 'MOUSE', '마우스 본체', '마우스 패드'],
  ['zh', 'SHOES', '轻便鞋子', '鞋架'],
  ['ja', 'TABLET', 'タブレット本体 10インチ', 'タブレット保護フィルム']
];

test('Phase 4 accessory classifier is OFF by default', () => {
  assert.equal(accessoryClassifierEnabled({}), false);
  const candidates = [{ title: 'camera bag' }];
  assert.deepEqual(maybeFilterAccessoryOnlyCandidates({}, candidates, 'en', {}).accepted, candidates);
});

test('body/accessory rules classify the supplied multilingual confusion patterns', () => {
  for (const [locale, productType, body, accessory] of CASES) {
    assert.equal(classifyBodyAccessory({ product_type: productType, title: body }, locale).classification, 'BODY');
    assert.equal(classifyBodyAccessory({ product_type: productType, title: accessory }, locale).classification, 'ACCESSORY');
  }
});

test('an accessory-only candidate cannot survive a body request', () => {
  for (const [locale, productType, body, accessory] of CASES) {
    const result = filterAccessoryOnlyCandidates(
      { product_type: productType, required_attributes: [] },
      [{ id: 'body', product_type: productType, title: body }, { id: 'accessory', product_type: productType, title: accessory }],
      locale
    );
    assert.deepEqual(result.accepted.map(({ id }) => id), ['body']);
    assert.equal(result.rejected[0].decision.reason_code, 'ACCESSORY_ONLY');
  }
});

test('explicit structured is_accessory evidence takes precedence over title wording', () => {
  assert.equal(classifyBodyAccessory({ title: 'camera', is_accessory: true }, 'en').classification, 'ACCESSORY');
  assert.equal(classifyBodyAccessory({ title: 'camera bag', is_accessory: false }, 'en').classification, 'BODY');
});
