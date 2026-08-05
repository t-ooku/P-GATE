import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeContract, isActive, includesCategory, answerSignature, evaluateContractPolicy,
  findContractInD1, decideContractPolicy, jstDateKey, knowledgeKeyForQuery, loadAllContractsFromD1
} from '../src/contract-policy.mjs';
import {
  handleContractPolicySyncRoutes, validateContractSyncPayload
} from '../src/contract-policy-routes.mjs';

const SECRET = 'x'.repeat(32);

function baseContract(overrides = {}) {
  return {
    contract_id: 'C1', tenant: 'itg', account_type: 'SELLER', account_id: 'A1',
    status: 'ACTIVE', start_date: '2026-01-01', end_date: '', category_scope: 'ELECTRONICS',
    competitor_group: '', exclusivity_mode: 'NONE', competitor_acceptance: false,
    benchmark_consent: false, updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

test('normalizeContractはgas/ContractPolicyEngine.gsと同じ必須項目・列挙値を検証する', () => {
  const contract = normalizeContract(baseContract());
  assert.deepEqual(contract.categories, ['ELECTRONICS']);
  assert.equal(contract.tenant, 'itg');

  assert.throws(() => normalizeContract(baseContract({ account_type: 'RESELLER' })), /CONTRACT_ACCOUNT_TYPE_INVALID/);
  assert.throws(() => normalizeContract(baseContract({ status: 'DRAFT' })), /CONTRACT_STATUS_INVALID/);
  assert.throws(() => normalizeContract(baseContract({ exclusivity_mode: 'ALL' })), /CONTRACT_EXCLUSIVITY_INVALID/);
  assert.throws(() => normalizeContract(baseContract({ start_date: '2026/01/01' })), /CONTRACT_DATE_INVALID/);
  assert.throws(() => normalizeContract(baseContract({ start_date: '2026-02-01', end_date: '2026-01-01' })), /CONTRACT_DATE_RANGE_INVALID/);
  assert.throws(() => normalizeContract(baseContract({ contract_id: '' })), /CONTRACT_FIELD_REQUIRED/);
});

test('normalizeContractはGAS由来のcategory_scope文字列とWorker側のcategories配列の両方を受け付ける', () => {
  assert.deepEqual(normalizeContract(baseContract({ category_scope: 'a, b ,c' })).categories, ['A', 'B', 'C']);
  assert.deepEqual(normalizeContract({ ...baseContract(), category_scope: undefined, categories: ['x', 'y'] }).categories, ['X', 'Y']);
  assert.deepEqual(normalizeContract(baseContract({ category_scope: '' })).categories, ['*']);
});

test('isActiveは開始日・終了日・statusで判定する', () => {
  const contract = normalizeContract(baseContract({ start_date: '2026-01-01', end_date: '2026-12-31' }));
  assert.equal(isActive(contract, '2026-06-01'), true);
  assert.equal(isActive(contract, '2025-12-31'), false);
  assert.equal(isActive(contract, '2027-01-01'), false);
  assert.equal(isActive(normalizeContract(baseContract({ status: 'PAUSED' })), '2026-06-01'), false);
});

test('includesCategoryはワイルドカードと大文字小文字を吸収する', () => {
  const wildcard = normalizeContract(baseContract({ category_scope: '*' }));
  assert.equal(includesCategory(wildcard, 'anything'), true);
  const scoped = normalizeContract(baseContract({ category_scope: 'electronics' }));
  assert.equal(includesCategory(scoped, 'ELECTRONICS'), true);
  assert.equal(includesCategory(scoped, 'beauty'), false);
});

test('answerSignatureはキー順に依存せず決定的である', async () => {
  const a = await answerSignature({ b: 1, a: 2 });
  const b = await answerSignature({ a: 2, b: 1 });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('knowledgeKeyForQueryは空白正規化後にハッシュ化する', async () => {
  const a = await knowledgeKeyForQuery('  ワイヤレス　イヤホン  ');
  const b = await knowledgeKeyForQuery('ワイヤレス イヤホン');
  assert.equal(a, b);
});

test('jstDateKeyはUTC日時をJST日付キーへ変換する', () => {
  assert.equal(jstDateKey(new Date('2026-08-05T16:00:00.000Z')), '2026-08-06');
  assert.equal(jstDateKey(new Date('2026-08-05T10:00:00.000Z')), '2026-08-05');
});

test('evaluateContractPolicyは対象契約が非アクティブなら即ブロックする', () => {
  const target = normalizeContract(baseContract({ status: 'ENDED' }));
  const result = evaluateContractPolicy({ dateKey: '2026-06-01', category: 'ELECTRONICS', signature: 'sig', targetContract: target });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'TARGET_CONTRACT_INACTIVE');
});

test('evaluateContractPolicyはカテゴリ対象外ならブロックする', () => {
  const target = normalizeContract(baseContract({ category_scope: 'BEAUTY' }));
  const result = evaluateContractPolicy({ dateKey: '2026-06-01', category: 'ELECTRONICS', signature: 'sig', targetContract: target });
  assert.equal(result.reason, 'CATEGORY_OUT_OF_SCOPE');
});

test('evaluateContractPolicyはcompetitor_groupが無ければ他決定を無視して許可する', () => {
  const target = normalizeContract(baseContract());
  const result = evaluateContractPolicy({
    dateKey: '2026-06-01', category: 'ELECTRONICS', signature: 'sig', targetContract: target,
    conflictingDecisions: [{ answer_signature: 'sig', category: 'ELECTRONICS', exclusivity_mode: 'CATEGORY', competitor_acceptance: true, status: 'ACTIVE', start_date: '2026-01-01', end_date: '' }]
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'ALLOWED');
});

test('evaluateContractPolicyはCATEGORY排他の競合をブロックする', () => {
  const target = normalizeContract(baseContract({ competitor_group: 'GROUP1', exclusivity_mode: 'CATEGORY' }));
  const result = evaluateContractPolicy({
    dateKey: '2026-06-01', category: 'ELECTRONICS', signature: 'sig-a', targetContract: target,
    conflictingDecisions: [{
      answer_signature: 'sig-b', category: 'ELECTRONICS', competitor_group: 'GROUP1', exclusivity_mode: 'NONE',
      competitor_acceptance: true, status: 'ACTIVE', start_date: '2026-01-01', end_date: ''
    }]
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'CATEGORY_EXCLUSIVITY_CONFLICT');
});

test('evaluateContractPolicyはANSWER排他の競合をブロックする', () => {
  const target = normalizeContract(baseContract({ competitor_group: 'GROUP1', exclusivity_mode: 'ANSWER' }));
  const result = evaluateContractPolicy({
    dateKey: '2026-06-01', category: 'ELECTRONICS', signature: 'sig-shared', targetContract: target,
    conflictingDecisions: [{
      answer_signature: 'sig-shared', category: 'BEAUTY', competitor_group: 'GROUP1', exclusivity_mode: 'NONE',
      competitor_acceptance: true, status: 'ACTIVE', start_date: '2026-01-01', end_date: ''
    }]
  });
  assert.equal(result.reason, 'ANSWER_EXCLUSIVITY_CONFLICT');
});

test('evaluateContractPolicyは同一回答の競合で片方が競合受入れ不可ならブロックする', () => {
  const target = normalizeContract(baseContract({ competitor_group: 'GROUP1', competitor_acceptance: true }));
  const result = evaluateContractPolicy({
    dateKey: '2026-06-01', category: 'ELECTRONICS', signature: 'sig-shared', targetContract: target,
    conflictingDecisions: [{
      answer_signature: 'sig-shared', category: 'ELECTRONICS', competitor_group: 'GROUP1', exclusivity_mode: 'NONE',
      competitor_acceptance: false, status: 'ACTIVE', start_date: '2026-01-01', end_date: ''
    }]
  });
  assert.equal(result.reason, 'COMPETITOR_ACCEPTANCE_REQUIRED');
});

test('evaluateContractPolicyは双方が競合受入れ済みなら開示付きで許可する', () => {
  const target = normalizeContract(baseContract({ competitor_group: 'GROUP1', competitor_acceptance: true }));
  const result = evaluateContractPolicy({
    dateKey: '2026-06-01', category: 'ELECTRONICS', signature: 'sig-shared', targetContract: target,
    conflictingDecisions: [{
      answer_signature: 'sig-shared', category: 'ELECTRONICS', competitor_group: 'GROUP1', exclusivity_mode: 'NONE',
      competitor_acceptance: true, status: 'ACTIVE', start_date: '2026-01-01', end_date: ''
    }]
  });
  assert.equal(result.allowed, true);
  assert.equal(result.disclosure_required, true);
  assert.equal(result.reason, 'ALLOWED_WITH_COMPETITOR_DISCLOSURE');
});

function createFakeD1({ contracts = [], decisions = [] } = {}) {
  const inserted = [];
  return {
    contracts, decisions, inserted,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (/FROM contracts WHERE contract_id/.test(sql)) {
                return contracts.find((row) => row.contract_id === values[0]) || null;
              }
              return null;
            },
            async all() {
              if (/FROM contract_decisions d\s+JOIN contracts c/.test(sql)) {
                const [group, excludeId] = values;
                const results = decisions
                  .filter((decision) => decision.allowed === 1 && decision.contract_id !== excludeId)
                  .map((decision) => {
                    const contract = contracts.find((row) => row.contract_id === decision.contract_id);
                    if (!contract || contract.competitor_group !== group) return null;
                    return {
                      answer_signature: decision.answer_signature, category: decision.category,
                      competitor_group: contract.competitor_group, exclusivity_mode: contract.exclusivity_mode,
                      competitor_acceptance: contract.competitor_acceptance,
                      status: contract.status, start_date: contract.start_date, end_date: contract.end_date
                    };
                  })
                  .filter(Boolean);
                return { results };
              }
              return { results: [] };
            },
            async run() {
              if (/INSERT INTO contract_decisions/.test(sql)) {
                inserted.push(values);
                decisions.push({
                  decision_id: values[0], contract_id: values[2], answer_signature: values[7],
                  category: values[8], allowed: values[9]
                });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            }
          };
        }
      };
    }
  };
}

test('findContractInD1はcategory_scopeのJSONをcategories配列へ復元する', async () => {
  const env = { PRODUCT_DB: createFakeD1({
    contracts: [{
      contract_id: 'C1', tenant: 'itg', account_type: 'SELLER', account_id: 'A1', status: 'ACTIVE',
      start_date: '2026-01-01', end_date: '', category_scope: '["ELECTRONICS"]', competitor_group: '',
      exclusivity_mode: 'NONE', competitor_acceptance: 0, benchmark_consent: 0, updated_at: '2026-08-01T00:00:00.000Z'
    }]
  }) };
  const contract = await findContractInD1(env, 'C1');
  assert.deepEqual(contract.categories, ['ELECTRONICS']);
  assert.equal(await findContractInD1(env, 'MISSING'), null);
});

test('loadAllContractsFromD1は全契約を復元し、D1未設定なら空配列を返す', async () => {
  assert.deepEqual(await loadAllContractsFromD1({}), []);
  const rows = [{
    contract_id: 'C1', tenant: 'itg', account_type: 'SELLER', account_id: 'A1', status: 'ACTIVE',
    start_date: '2026-01-01', end_date: '', category_scope: '["*"]', competitor_group: '',
    exclusivity_mode: 'NONE', competitor_acceptance: 0, benchmark_consent: 1, updated_at: '2026-08-01T00:00:00.000Z'
  }];
  const env = { PRODUCT_DB: { prepare: () => ({ all: async () => ({ results: rows }) }) } };
  const contracts = await loadAllContractsFromD1(env);
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].benchmark_consent, true);
});

test('decideContractPolicyはD1未同期の契約に対しCONTRACT_NOT_FOUNDを投げる(GASフォールバックの起点)', async () => {
  const env = { PRODUCT_DB: createFakeD1() };
  await assert.rejects(
    () => decideContractPolicy(env, { contract_id: 'MISSING', category: 'ELECTRONICS', date_jst: '2026-08-05', knowledge_key: 'k' }),
    /CONTRACT_NOT_FOUND/
  );
});

test('decideContractPolicyはD1上で競合排他を判定し決定ログを書き込む', async () => {
  const env = { PRODUCT_DB: createFakeD1({
    contracts: [
      {
        contract_id: 'TARGET', tenant: 'itg', account_type: 'SELLER', account_id: 'A1', status: 'ACTIVE',
        start_date: '2026-01-01', end_date: '', category_scope: '["ELECTRONICS"]', competitor_group: 'GROUP1',
        exclusivity_mode: 'CATEGORY', competitor_acceptance: 0, benchmark_consent: 0, updated_at: '2026-08-01T00:00:00.000Z'
      },
      {
        contract_id: 'OTHER', tenant: 'itg', account_type: 'SELLER', account_id: 'A2', status: 'ACTIVE',
        start_date: '2026-01-01', end_date: '', category_scope: '["ELECTRONICS"]', competitor_group: 'GROUP1',
        exclusivity_mode: 'NONE', competitor_acceptance: 1, benchmark_consent: 0, updated_at: '2026-08-01T00:00:00.000Z'
      }
    ],
    decisions: [
      { decision_id: 'D0', contract_id: 'OTHER', answer_signature: 'sig', category: 'ELECTRONICS', allowed: 1 }
    ]
  }) };
  const result = await decideContractPolicy(env, {
    contract_id: 'TARGET', category: 'ELECTRONICS', date_jst: '2026-08-05',
    knowledge_key: 'k', answer_signature: 'sig'
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'CATEGORY_EXCLUSIVITY_CONFLICT');
  assert.equal(env.PRODUCT_DB.inserted.length, 1);
  assert.equal(env.PRODUCT_DB.inserted[0][9], 0);
});

test('契約同期APIは専用Secretなしで拒否する', async () => {
  const response = await handleContractPolicySyncRoutes(new Request(
    'https://hoshilu.app/api/internal/contracts/sync',
    { method: 'POST', body: '{}' }
  ), { PRODUCT_DB: {}, CONTRACT_SYNC_SECRET: SECRET });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});

test('契約同期APIはD1未設定なら503を返す', async () => {
  const response = await handleContractPolicySyncRoutes(new Request(
    'https://hoshilu.app/api/internal/contracts/sync',
    { method: 'POST', body: '{}', headers: { authorization: `Bearer ${SECRET}` } }
  ), { CONTRACT_SYNC_SECRET: SECRET });
  assert.equal(response.status, 503);
});

test('validateContractSyncPayloadはバッチID形式と最大件数を検証する', () => {
  assert.throws(() => validateContractSyncPayload({ batch_id: 'short', contracts: [baseContract()] }), /CONTRACT_SYNC_BATCH_INVALID/);
  assert.throws(() => validateContractSyncPayload({ batch_id: 'valid-batch-0001', contracts: [] }), /CONTRACT_SYNC_RECORD_COUNT_INVALID/);
  const payload = validateContractSyncPayload({ batch_id: 'valid-batch-0001', contracts: [baseContract()] });
  assert.equal(payload.contracts[0].contract_id, 'C1');
});

