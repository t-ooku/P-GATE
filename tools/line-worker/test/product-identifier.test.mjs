import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIdentifier, hasValidCheckDigit, validateType, buildIndex, findConflicts, lookup, lookupIdentifier
} from '../src/product-identifier.mjs';
import {
  handleProductIdentifierSyncRoutes, validateProductIdentifierSyncPayload
} from '../src/product-identifier-routes.mjs';

const SECRET = 'z'.repeat(32);

test('normalizeIdentifierは空白・ハイフンを除去し8〜14桁の数字だけを許可する', () => {
  assert.equal(normalizeIdentifier(' 4006-381-333931 '), '4006381333931');
  assert.throws(() => normalizeIdentifier('123'), /IDENTIFIER_FORMAT_INVALID/);
  assert.throws(() => normalizeIdentifier('abcdefgh'), /IDENTIFIER_FORMAT_INVALID/);
});

test('hasValidCheckDigitは実在するEAN-13/UPC-Aのチェックディジットを検証する', () => {
  assert.equal(hasValidCheckDigit('4006381333931'), true);
  assert.equal(hasValidCheckDigit('036000291452'), true);
  assert.equal(hasValidCheckDigit('4006381333930'), false);
  assert.equal(hasValidCheckDigit('12345'), false);
});

test('validateTypeはJAN(45/49始まり13桁)・UPC(12桁)・EAN(8/13/14桁)の形式を検証する', () => {
  assert.equal(validateType('jan', '4901234567894'), '4901234567894');
  assert.equal(validateType('UPC', '036000291452'), '036000291452');
  assert.equal(validateType('EAN', '4006381333931'), '4006381333931');
  assert.throws(() => validateType('JAN', '036000291452'), /JAN_FORMAT_INVALID/);
  assert.throws(() => validateType('UPC', '4006381333931'), /UPC_FORMAT_INVALID/);
  assert.throws(() => validateType('FOO', '4006381333931'), /IDENTIFIER_TYPE_INVALID/);
  assert.throws(() => validateType('EAN', '4006381333930'), /IDENTIFIER_CHECK_DIGIT_INVALID/);
});

test('buildIndex/findConflictsは同一コードに複数ASINが紐付く場合を検出する', () => {
  const mappings = [
    { tenant: 'itg', asin: 'B000000001', value: '4901234567894' },
    { tenant: 'itg', asin: 'B000000002', value: '4901234567894' },
    { tenant: 'itg', asin: 'B000000003', value: '4006381333931' }
  ];
  const conflicts = findConflicts(mappings);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].asins, ['B000000001', 'B000000002']);
  assert.equal(conflicts[0].identifier, '4901234567894');
});

test('lookupはNOT_FOUND/AMBIGUOUS/MASTER_MISMATCH/FOUNDを区別する', () => {
  const mappings = [
    { tenant: 'itg', asin: 'B000000001', value: '4901234567894' },
    { tenant: 'itg', asin: 'B000000002', value: '4901234567894' },
    { tenant: 'itg', asin: 'B000000003', value: '4006381333931' }
  ];
  const records = [{ tenant: 'itg', asin: 'B000000003', product_name: 'X' }];
  assert.equal(lookup(records, mappings, 'itg', '5901234123457').status, 'NOT_FOUND');
  assert.equal(lookup(records, mappings, 'itg', '4901234567894').status, 'AMBIGUOUS');
  assert.equal(lookup(records, mappings, 'itg', '4006381333931').status, 'FOUND');
  const noMasterMatch = lookup([], mappings, 'itg', '4006381333931');
  assert.equal(noMasterMatch.status, 'MASTER_MISMATCH');
});

function createFakeD1({ identifiers = [], products = [] } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              if (/FROM product_identifiers/.test(sql)) {
                const [tenant, value] = values;
                return { results: identifiers.filter((row) => row.tenant === tenant && row.identifier_value === value && row.approved === 1) };
              }
              return { results: [] };
            },
            async first() {
              if (/FROM products WHERE tenant/.test(sql)) {
                const [tenant, asin] = values;
                return products.find((row) => row.tenant === tenant && row.asin === asin) || null;
              }
              return null;
            }
          };
        }
      };
    }
  };
}

test('lookupIdentifierはD1未設定ならnullを返す(GASフォールバックの起点)', async () => {
  assert.equal(await lookupIdentifier({}, 'itg', '4006381333931'), null);
});

test('lookupIdentifierはD1上でNOT_FOUND/AMBIGUOUS/FOUNDを判定する', async () => {
  const env = { PRODUCT_DB: createFakeD1({
    identifiers: [
      { tenant: 'itg', asin: 'B000000001', identifier_value: '4901234567894', approved: 1 },
      { tenant: 'itg', asin: 'B000000002', identifier_value: '4901234567894', approved: 1 },
      { tenant: 'itg', asin: 'B000000003', identifier_value: '4006381333931', approved: 1 }
    ],
    products: [{ tenant: 'itg', asin: 'B000000003', product_name: 'X' }]
  }) };
  assert.equal((await lookupIdentifier(env, 'itg', '5901234123457')).status, 'NOT_FOUND');
  assert.equal((await lookupIdentifier(env, 'itg', '4901234567894')).status, 'AMBIGUOUS');
  const found = await lookupIdentifier(env, 'itg', '4006381333931');
  assert.equal(found.status, 'FOUND');
  assert.equal(found.records[0].asin, 'B000000003');
});

test('lookupIdentifierはチェックディジット不正な値を拒否する', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  await assert.rejects(() => lookupIdentifier(env, 'itg', '4006381333930'), /IDENTIFIER_CHECK_DIGIT_INVALID/);
});

test('商品コード同期APIは専用Secretなしで拒否する', async () => {
  const response = await handleProductIdentifierSyncRoutes(new Request(
    'https://hoshilu.app/api/internal/product-identifiers/sync',
    { method: 'POST', body: '{}' }
  ), { PRODUCT_DB: {}, PRODUCT_IDENTIFIER_SYNC_SECRET: SECRET });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});

test('商品コード同期APIはD1未設定なら503を返す', async () => {
  const response = await handleProductIdentifierSyncRoutes(new Request(
    'https://hoshilu.app/api/internal/product-identifiers/sync',
    { method: 'POST', body: '{}', headers: { authorization: `Bearer ${SECRET}` } }
  ), { PRODUCT_IDENTIFIER_SYNC_SECRET: SECRET });
  assert.equal(response.status, 503);
});

test('validateProductIdentifierSyncPayloadは承認済み行のみ厳密な形式検証をする', () => {
  assert.throws(() => validateProductIdentifierSyncPayload({ batch_id: 'short', identifiers: [] }), /IDENTIFIER_SYNC_BATCH_INVALID/);
  assert.throws(() => validateProductIdentifierSyncPayload({ batch_id: 'valid-batch-0001', identifiers: [] }), /IDENTIFIER_SYNC_RECORD_COUNT_INVALID/);
  const payload = validateProductIdentifierSyncPayload({
    batch_id: 'valid-batch-0001',
    identifiers: [{ tenant: 'itg', asin: 'B000000001', identifier_type: 'jan', identifier_value: '4901234567894', approved: true }]
  });
  assert.equal(payload.identifiers[0].identifier_value, '4901234567894');
  assert.throws(() => validateProductIdentifierSyncPayload({
    batch_id: 'valid-batch-0001',
    identifiers: [{ tenant: 'itg', asin: 'B000000001', identifier_type: 'JAN', identifier_value: '036000291452', approved: true }]
  }), /JAN_FORMAT_INVALID/);
  // 未承認行は緩い形式検証(数字8〜14桁)だけを通す
  const unapproved = validateProductIdentifierSyncPayload({
    batch_id: 'valid-batch-0001',
    identifiers: [{ tenant: 'itg', asin: 'B000000001', identifier_type: 'JAN', identifier_value: '036000291452', approved: false }]
  });
  assert.equal(unapproved.identifiers[0].approved, false);
});
