import test from 'node:test';
import assert from 'node:assert/strict';
import { isInvalidJanProductKey } from '../src/jan-validity.mjs';
import { targetPriceProductKey } from '../src/target-price-product-key.mjs';
import { latestObservation } from '../src/line-price-watch.mjs';

test('invalid JAN is not saved as an identity or queried for LINE watch', async () => {
  for (const record_key of ['JAN:0000000000000', 'JAN:2980000620539', 'JAN:4582356615598', 'jan:0000000000000']) {
    assert.equal(isInvalidJanProductKey(record_key), true);
    assert.equal(targetPriceProductKey({ record_key, asin: 'B000000000' }), '');
    assert.equal(await latestObservation({ prepare: () => assert.fail('invalid JAN reached D1') }, record_key), null);
  }
  for (const record_key of ['JAN:4582356615597', 'YAHOO:shop_product', 'RAKUTEN:shop:product']) {
    assert.equal(targetPriceProductKey({ record_key }), record_key);
    const db = { prepare: () => ({ bind: key => ({ first: async () => ({ record_key: key, price: 1200 }) }) }) };
    assert.equal((await latestObservation(db, record_key)).record_key, record_key);
  }
});
