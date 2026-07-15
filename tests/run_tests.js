'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const gasDir = path.join(root, 'gas');
const bridgePath = path.join(root, 'tools', 'windows-bridge', 'Project_GATE_Bridge.ps1');
const files = [
  'Utility.gs', 'Config.gs', 'Logger.gs', 'DriveService.gs', 'ImportLog.gs',
  'ZipEngine.gs', 'ImportEngine.gs', 'MappingEngine.gs', 'NormalizeEngine.gs',
  'ValidationEngine.gs', 'HashEngine.gs', 'DatabaseEngine.gs',
  'OpportunityEngine.gs', 'MeasurementEngine.gs', 'MarketplaceMeasurementEngine.gs', 'ContractPolicyEngine.gs',
  'BenchmarkEngine.gs', 'MarketplaceEngine.gs',
  'MultilingualSeoEngine.gs', 'ProductIdentifierEngine.gs', 'KnowledgeEngine.gs', 'LineIntegration.gs', 'PreflightEngine.gs', 'Main.gs'
];

function simpleParseCsv(text) {
  const row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  return [row];
}

const context = {
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, text) => Array.from(crypto.createHash('sha256').update(String(text)).digest())
      .map((value) => (value > 127 ? value - 256 : value)),
    getUuid: () => '00000000-0000-4000-8000-000000000000',
    parseCsv: simpleParseCsv,
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map((value) => (value < 0 ? value + 256 : value))).toString('utf8') })
  }
};
vm.createContext(context);
for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(gasDir, file), 'utf8'), context, { filename: file });
}

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}: ${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('tenant extraction', () => {
  assert.strictEqual(context.ZipEngine.extractTenant('listing-AP0147_customer_support-itg@mc2-ltd.jp-csv.zip'), 'itg');
  assert.strictEqual(context.ZipEngine.extractTenant('listing-AP0147_customer_support-itt@mc2-ltd.jp-csv.zip'), 'itt');
  assert.strictEqual(context.ZipEngine.extractTenant('listing-AP0147_customer_support-mc2@mc2-ltd.jp-csv.zip'), 'mc2');
  assert.throws(() => context.ZipEngine.extractTenant('unknown.zip'));
});

test('CSV quoted record completeness', () => {
  assert.strictEqual(context.ImportEngine.isCompleteCsvRecord('A,"B,C",D'), true);
  assert.strictEqual(context.ImportEngine.isCompleteCsvRecord('A,"B\n'), false);
  assert.strictEqual(context.ImportEngine.isCompleteCsvRecord('A,"B\nC",D'), true);
});

const sampleHeader = [
  'ASIN', '画像', '商品名', '利益', '売値/最安値', 'FBA出荷', '送料', '諸経費',
  '幅インチ、長さインチ、高さインチ', '在庫数', '登録日時', 'SKU', 'メーカー',
  '日本最安値', '販売価格', '更新日時', '販売手数料', '米国最安値', '関税', '州税',
  'ツール外出品', '日本Amazon', '米国Amazon'
];

test('mapping exact sample headers', () => {
  const index = context.MappingEngine.buildIndex(sampleHeader);
  assert.strictEqual(index.asin, 0);
  assert.strictEqual(index.product_name, 2);
  assert.strictEqual(index.amazon_fee, 16);
  assert.strictEqual(index.amazon_us_url, 22);
});

test('normalize and validate', () => {
  const row = ['B012345678', 'https://img', '長い商品タイトルです。検索に必要な情報を含みます。', '1,200', '', '', '', '', '', '5', '', 'sku-1', 'Maker', '', '3,000', '', '300', '', '100', '0', '', 'https://jp', ''];
  const mapped = context.MappingEngine.mapRow(row, context.MappingEngine.buildIndex(sampleHeader), 2);
  const normalized = context.NormalizeEngine.normalize(mapped, 'itt', 'batch');
  assert.strictEqual(normalized.profit, 1200);
  assert.strictEqual(normalized.stock, 5);
  assert.strictEqual(normalized.record_key, 'itt|SKU-1');
  const result = context.ValidationEngine.validate([normalized]);
  assert.strictEqual(result.validRecords.length, 1);
  assert.strictEqual(result.errors.length, 0);
});

test('validation rejects malformed ASIN', () => {
  const result = context.ValidationEngine.validate([{ asin: 'BAD', product_name: 'x', record_key: 'itt|BAD', source_row: 2 }]);
  assert.strictEqual(result.validRecords.length, 0);
  assert.strictEqual(result.errors[0].codes[0], 'ASIN_FORMAT_INVALID');
});

test('hash stable and sensitive to business changes', () => {
  const base = { tenant: 'itt', asin: 'B012345678', sku: 'S1', product_name: 'A', profit: 100 };
  const first = context.HashEngine.calculate(base);
  const second = context.HashEngine.calculate({ ...base, imported_at: 'later' });
  const changed = context.HashEngine.calculate({ ...base, profit: 101 });
  assert.strictEqual(first, second);
  assert.notStrictEqual(first, changed);
});

test('profit percentile score', () => {
  assert.deepStrictEqual(
    Array.from(context.OpportunityEngine.calculateProfitScores([{ profit: -1 }, { profit: 100 }, { profit: 200 }])),
    [0, 50, 100]
  );
});

test('SEO score formula', () => {
  const score = context.OpportunityEngine.calculateSeoScore({
    product_name: '12345678901234567890',
    manufacturer: 'Maker',
    image: 'https://image',
    amazon_jp_url: 'https://amazon.jp'
  });
  assert.strictEqual(score, 100);
});

test('contiguous update grouping', () => {
  const groups = context.DatabaseEngine.groupContiguous([
    { rowNumber: 2, row: ['a'] },
    { rowNumber: 3, row: ['b'] },
    { rowNumber: 5, row: ['c'] }
  ]);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].rows.length, 2);
});

test('forbidden appendRow is absent', () => {
  const all = files.map((file) => fs.readFileSync(path.join(gasDir, file), 'utf8')).join('\n');
  assert.strictEqual(/\.appendRow\s*\(/.test(all), false);
});

test('Opportunity output is limited to the current validated batch', () => {
  const main = fs.readFileSync(path.join(gasDir, 'Main.gs'), 'utf8');
  assert.strictEqual(/OpportunityEngine\.refresh\(validation\.validRecords\)/.test(main), true);
  assert.strictEqual(/OpportunityEngine\.refresh\(DatabaseEngine\.getAllRecords\(\)\)/.test(main), false);
});

test('stale STARTED import logs are detected for recovery', () => {
  const now = Date.parse('2026-07-14T05:00:00.000Z');
  const rows = [
    ['b1', 'f1', 'a.zip', '', 'STARTED', 0, 0, 0, 0, 0, 0, 0, '2026-07-14T04:00:00.000Z'],
    ['b2', 'f2', 'b.zip', '', 'STARTED', 0, 0, 0, 0, 0, 0, 0, '2026-07-14T04:50:00.000Z'],
    ['b3', 'f3', 'c.zip', '', 'SUCCESS', 0, 0, 0, 0, 0, 0, 0, '2026-07-14T03:00:00.000Z']
  ];
  assert.deepStrictEqual(
    Array.from(context.ImportLog.findStaleStartedIndexes(rows, now, 30)),
    [0]
  );
});

test('idle trigger does not persist a log every five minutes', () => {
  const main = fs.readFileSync(path.join(gasDir, 'Main.gs'), 'utf8');
  assert.strictEqual(/AppLogger\.info\('NO_INPUT'/.test(main), false);
});

test('one ZIP is processed per GAS execution to avoid timeout', () => {
  const main = fs.readFileSync(path.join(gasDir, 'Main.gs'), 'utf8');
  assert.strictEqual(/PROJECT_GATE_MAX_FILES_PER_RUN\s*=\s*1/.test(main), true);
  assert.strictEqual(/Math\.min\(files\.length, PROJECT_GATE_MAX_FILES_PER_RUN\)/.test(main), true);
});

test('KPI event requires consent and validates account boundary', () => {
  const base = {
    event_id: 'event-1', occurred_at: '2026-07-14T15:30:00.000Z',
    tenant: 'ITG', account_type: 'seller', account_id: 'seller-a',
    session_id: 'anonymous-session-hash', recommendation_id: 'rec-1',
    campaign_id: 'campaign-1', experiment_variant: 'P_GATE',
    asin: 'B012345678', event_type: 'impression', consent: true
  };
  const event = context.MeasurementEngine.normalizeEvent(base, '2026-07-14T15:31:00.000Z');
  assert.strictEqual(event.date_jst, '2026-07-15');
  assert.strictEqual(event.tenant, 'itg');
  assert.strictEqual(event.account_type, 'SELLER');
  assert.strictEqual(event.event_key, 'itg|SELLER|seller-a|event-1');
  assert.strictEqual(event.revenue, 0);
  assert.throws(() => context.MeasurementEngine.normalizeEvent({ ...base, consent: false }));
  assert.throws(() => context.MeasurementEngine.normalizeEvent({ ...base, account_type: 'other' }));
  assert.throws(() => context.MeasurementEngine.normalizeEvent({ ...base, session_id: 'person@example.com' }));
});

test('KPI summary separates seller and manufacturer accounts', () => {
  const events = [
    { date_jst: '2026-07-14', tenant: 'itg', account_type: 'SELLER', account_id: 's1', campaign_id: 'c1', experiment_variant: 'P_GATE', event_type: 'IMPRESSION' },
    { date_jst: '2026-07-14', tenant: 'itg', account_type: 'SELLER', account_id: 's1', campaign_id: 'c1', experiment_variant: 'P_GATE', event_type: 'IMPRESSION' },
    { date_jst: '2026-07-14', tenant: 'itg', account_type: 'SELLER', account_id: 's1', campaign_id: 'c1', experiment_variant: 'P_GATE', event_type: 'CLICK' },
    { date_jst: '2026-07-14', tenant: 'itg', account_type: 'SELLER', account_id: 's1', campaign_id: 'c1', experiment_variant: 'P_GATE', event_type: 'OUTBOUND' },
    { date_jst: '2026-07-14', tenant: 'itg', account_type: 'SELLER', account_id: 's1', campaign_id: 'c1', experiment_variant: 'P_GATE', event_type: 'PURCHASE', revenue: 5000, gross_profit: 500 },
    { date_jst: '2026-07-14', tenant: 'itg', account_type: 'MANUFACTURER', account_id: 'm1', campaign_id: 'c1', experiment_variant: 'P_GATE', event_type: 'IMPRESSION' }
  ];
  const rows = Array.from(context.MeasurementEngine.summarize(events, 'now'), row => Array.from(row));
  assert.strictEqual(rows.length, 2);
  const seller = rows.find((row) => row[2] === 'SELLER');
  const manufacturer = rows.find((row) => row[2] === 'MANUFACTURER');
  assert.deepStrictEqual(seller.slice(6, 15), [2, 1, 1, 1, 0.5, 0.5, 1, 5000, 500]);
  assert.deepStrictEqual(manufacturer.slice(6, 10), [1, 0, 0, 0]);
});

test('KPI event type controls revenue attribution', () => {
  const base = {
    event_id: 'event-2', occurred_at: '2026-07-14T01:00:00.000Z',
    tenant: 'itg', account_type: 'SELLER', account_id: 'seller-a',
    session_id: 'session', recommendation_id: 'rec-1', asin: 'B012345678',
    campaign_id: 'campaign-1', experiment_variant: 'P_GATE',
    consent: true, revenue: 5000, gross_profit: 500
  };
  const click = context.MeasurementEngine.normalizeEvent({ ...base, event_type: 'CLICK' }, 'now');
  const purchase = context.MeasurementEngine.normalizeEvent({ ...base, event_id: 'event-3', event_type: 'PURCHASE' }, 'now');
  assert.strictEqual(click.revenue, 0);
  assert.strictEqual(click.gross_profit, 0);
  assert.strictEqual(purchase.revenue, 5000);
  assert.strictEqual(purchase.gross_profit, 500);
});

test('KPI uplift compares CONTROL and P_GATE without mixing accounts', () => {
  const summaryRows = [
    ['2026-07-14', 'itg', 'SELLER', 's1', 'c1', 'CONTROL', 1000, 100, 80, 8, 0.1, 0.08, 0.1, 80000, 8000, 'now'],
    ['2026-07-14', 'itg', 'SELLER', 's1', 'c1', 'P_GATE', 1000, 120, 100, 12, 0.12, 0.1, 0.12, 120000, 12000, 'now'],
    ['2026-07-14', 'itg', 'SELLER', 's2', 'c1', 'P_GATE', 1000, 130, 110, 13, 0.13, 0.11, 0.1182, 130000, 13000, 'now']
  ];
  const uplift = Array.from(context.MeasurementEngine.calculateUplift(summaryRows, 'updated'), row => Array.from(row));
  assert.strictEqual(uplift.length, 5);
  const ctr = uplift.find((row) => row[5] === 'CTR');
  assert.strictEqual(ctr[6], 0.1);
  assert.strictEqual(ctr[7], 0.12);
  assert.ok(Math.abs(ctr[9] - 0.2) < 1e-10);
  assert.strictEqual(uplift.some((row) => row[3] === 's2'), false);
});

test('Marketplace KPI validates destination and pseudonymous session', () => {
  const event = context.MarketplaceMeasurementEngine.normalizeEvent({
    event_id: 'market-event-1', occurred_at: '2026-07-14T01:00:00.000Z',
    tenant: 'itg', account_type: 'SELLER', account_id: 'seller-a', session_id: 'hashed-session',
    recommendation_id: 'rec-1', asin: 'B000000001', marketplace: 'RAKUTEN_JP',
    event_type: 'CLICK', channel: 'PWA', consent: true
  }, 'recorded');
  assert.strictEqual(event.marketplace, 'RAKUTEN_JP');
  assert.throws(() => context.MarketplaceMeasurementEngine.normalizeEvent({ ...event, marketplace: 'EVIL' }, 'recorded'));
  assert.throws(() => context.MarketplaceMeasurementEngine.normalizeEvent({ ...event, session_id: 'person@example.com' }, 'recorded'));
});

test('Marketplace KPI calculates click selection share by channel', () => {
  const base = { date_jst: '2026-07-14', tenant: 'itg', account_type: 'SELLER', account_id: 'seller-a', channel: 'PWA' };
  const events = [
    { ...base, marketplace: 'AMAZON_JP', event_type: 'CLICK', session_id: 's1', asin: 'B000000001' },
    { ...base, marketplace: 'AMAZON_JP', event_type: 'OUTBOUND', session_id: 's1', asin: 'B000000001' },
    { ...base, marketplace: 'RAKUTEN_JP', event_type: 'CLICK', session_id: 's2', asin: 'B000000002' },
    { ...base, marketplace: 'RAKUTEN_JP', event_type: 'CLICK', session_id: 's3', asin: 'B000000003' }
  ];
  const rows = Array.from(context.MarketplaceMeasurementEngine.summarize(events, 'updated'), row => Array.from(row));
  const amazon = rows.find((row) => row[5] === 'AMAZON_JP');
  const rakuten = rows.find((row) => row[5] === 'RAKUTEN_JP');
  assert.deepStrictEqual(amazon.slice(6, 11), [1, 1, 1, 1, 0.3333]);
  assert.deepStrictEqual(rakuten.slice(6, 11), [2, 0, 2, 2, 0.6667]);
});

function makeContract(overrides = {}) {
  return context.ContractPolicyEngine.normalizeContract({
    contract_id: 'contract-a', tenant: 'itg', account_type: 'SELLER', account_id: 'seller-a',
    status: 'ACTIVE', start_date: '2026-07-01', end_date: '2026-12-31',
    category_scope: 'FOOD,BEAUTY', competitor_group: 'CEREAL', exclusivity_mode: 'NONE',
    competitor_acceptance: false, benchmark_consent: false, ...overrides
  });
}

test('contract policy validates dates, scope, and active status', () => {
  const contract = makeContract();
  assert.strictEqual(context.ContractPolicyEngine.isActive(contract, '2026-07-14'), true);
  assert.strictEqual(context.ContractPolicyEngine.isActive(contract, '2027-01-01'), false);
  assert.strictEqual(context.ContractPolicyEngine.includesCategory(contract, 'food'), true);
  assert.strictEqual(context.ContractPolicyEngine.includesCategory(contract, 'toys'), false);
  assert.throws(() => makeContract({ start_date: '2026-02-31' }));
  const result = context.ContractPolicyEngine.evaluate(
    { date_jst: '2026-07-14', category: 'TOYS', answer_payload: { asin: 'B012345678' } },
    contract, [], [contract]
  );
  assert.strictEqual(result.reason, 'CATEGORY_OUT_OF_SCOPE');
});

test('same answer is blocked between competitors without mutual acceptance', () => {
  const target = makeContract();
  const existing = makeContract({ contract_id: 'contract-b', account_id: 'seller-b' });
  const signature = context.ContractPolicyEngine.answerSignature({ products: ['B012345678'] });
  const result = context.ContractPolicyEngine.evaluate(
    { date_jst: '2026-07-14', category: 'FOOD', answer_signature: signature },
    target,
    [{ contract_id: 'contract-b', category: 'FOOD', answer_signature: signature, allowed: true }],
    [target, existing]
  );
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.reason, 'COMPETITOR_ACCEPTANCE_REQUIRED');
});

test('same answer requires disclosure when both competitors accept', () => {
  const target = makeContract({ competitor_acceptance: true });
  const existing = makeContract({ contract_id: 'contract-b', account_id: 'seller-b', competitor_acceptance: true });
  const payloadA = { reason: 'best', products: ['B012345678'], score: 90 };
  const payloadB = { score: 90, products: ['B012345678'], reason: 'best' };
  const signature = context.ContractPolicyEngine.answerSignature(payloadA);
  assert.strictEqual(signature, context.ContractPolicyEngine.answerSignature(payloadB));
  const result = context.ContractPolicyEngine.evaluate(
    { date_jst: '2026-07-14', category: 'FOOD', answer_payload: payloadB },
    target,
    [{ contract_id: 'contract-b', category: 'FOOD', answer_signature: signature, allowed: true }],
    [target, existing]
  );
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.disclosure_required, true);
});

test('answer and category exclusivity block competing assignments', () => {
  const other = makeContract({ contract_id: 'contract-b', account_id: 'seller-b', competitor_acceptance: true });
  const signature = context.ContractPolicyEngine.answerSignature({ products: ['B012345678'] });
  const assignment = [{ contract_id: 'contract-b', category: 'FOOD', answer_signature: signature, allowed: true }];
  const answerExclusive = makeContract({ exclusivity_mode: 'ANSWER', competitor_acceptance: true });
  const categoryExclusive = makeContract({ exclusivity_mode: 'CATEGORY', competitor_acceptance: true });
  const answerResult = context.ContractPolicyEngine.evaluate(
    { date_jst: '2026-07-14', category: 'FOOD', answer_signature: signature },
    answerExclusive, assignment, [answerExclusive, other]
  );
  const categoryResult = context.ContractPolicyEngine.evaluate(
    { date_jst: '2026-07-14', category: 'FOOD', answer_payload: { products: ['DIFFERENT'] } },
    categoryExclusive, assignment, [categoryExclusive, other]
  );
  assert.strictEqual(answerResult.reason, 'ANSWER_EXCLUSIVITY_CONFLICT');
  assert.strictEqual(categoryResult.reason, 'CATEGORY_EXCLUSIVITY_CONFLICT');
});

test('different competitor groups do not block each other', () => {
  const target = makeContract({ exclusivity_mode: 'CATEGORY' });
  const existing = makeContract({ contract_id: 'contract-b', account_id: 'seller-b', competitor_group: 'COSMETICS', exclusivity_mode: 'CATEGORY' });
  const result = context.ContractPolicyEngine.evaluate(
    { date_jst: '2026-07-14', category: 'FOOD', answer_payload: { products: ['B012345678'] } },
    target,
    [{ contract_id: 'contract-b', category: 'FOOD', answer_signature: 'other', allowed: true }],
    [target, existing]
  );
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.disclosure_required, false);
});

test('recommendation decisions store only answer signature, not answer payload', () => {
  const source = fs.readFileSync(path.join(gasDir, 'ContractPolicyEngine.gs'), 'utf8');
  assert.strictEqual(/function evaluateProjectGateRecommendation\(request\)/.test(source), true);
  const decisionRow = source.slice(source.indexOf('var row = ['), source.indexOf('sheets.decisions.getRange'));
  assert.strictEqual(/answer_payload/.test(decisionRow), false);
  assert.strictEqual(/result\.answer_signature/.test(decisionRow), true);
});

test('anonymous benchmark requires consent and at least five distinct accounts', () => {
  const contracts = Array.from({ length: 6 }, (_, index) => makeContract({
    contract_id: `contract-${index}`,
    account_id: `seller-${index}`,
    competitor_group: `group-${index}`,
    benchmark_consent: index < 5
  }));
  const rows = Array.from({ length: 6 }, (_, index) => [
    '2026-07-14', 'itg', 'SELLER', `seller-${index}`, 'campaign-1', 'P_GATE',
    1000, 100 + index * 10, 80, 8, 0.1 + index * 0.01, 0.08, 0.1,
    100000 + index * 10000, 10000 + index * 1000, 'now'
  ]);
  const result = Array.from(context.BenchmarkEngine.generate(rows, contracts, 5, 'generated'), row => Array.from(row));
  assert.strictEqual(result.length, 5);
  const ctr = result.find((row) => row[3] === 'CTR');
  assert.deepStrictEqual(ctr.slice(0, 4), ['2026-07-14', 'SELLER', 'campaign-1', 'CTR']);
  assert.strictEqual(ctr[4], 0.12);
  assert.strictEqual(ctr[7], 5);
  assert.strictEqual(result.some((row) => row.includes('seller-0')), false);
  assert.strictEqual(result.some((row) => row.includes('itg')), false);
});

test('anonymous benchmark suppresses small cohorts and conflicting consent', () => {
  const contracts = Array.from({ length: 5 }, (_, index) => makeContract({
    contract_id: `contract-${index}`,
    account_id: `seller-${index}`,
    benchmark_consent: true
  }));
  contracts.push(makeContract({
    contract_id: 'contract-refusal', account_id: 'seller-0', benchmark_consent: false
  }));
  const rows = Array.from({ length: 5 }, (_, index) => [
    '2026-07-14', 'itg', 'SELLER', `seller-${index}`, 'campaign-1', 'P_GATE',
    1000, 100, 80, 8, 0.1, 0.08, 0.1, 100000, 10000, 'now'
  ]);
  assert.strictEqual(context.BenchmarkEngine.generate(rows, contracts, 5, 'generated').length, 0);
});

test('multi-EC offer validates marketplace domains and rejects lookalikes', () => {
  assert.strictEqual(context.MarketplaceEngine.validateUrl('AMAZON_JP', 'https://www.amazon.co.jp/dp/B000000001'), true);
  assert.strictEqual(context.MarketplaceEngine.validateUrl('RAKUTEN_JP', 'https://item.rakuten.co.jp/shop/item-1'), true);
  assert.strictEqual(context.MarketplaceEngine.validateUrl('YAHOO_JP', 'https://store.shopping.yahoo.co.jp/shop/item-1.html'), true);
  assert.strictEqual(context.MarketplaceEngine.validateUrl('RAKUTEN_JP', 'https://rakuten.co.jp.evil.example/item'), false);
  assert.strictEqual(context.MarketplaceEngine.validateUrl('AMAZON_JP', 'http://amazon.co.jp/item'), false);
  assert.throws(() => context.MarketplaceEngine.normalizeOffer({
    offer_id: 'offer-zero', tenant: 'itg', asin: 'B000000001', marketplace: 'AMAZON_JP',
    product_url: 'https://amazon.co.jp/dp/B000000001', price: 0,
    shipping_fee: 0, stock_status: 'IN_STOCK', approved: true
  }), /PRICE/);
});

test('multi-EC offer ranking uses availability, customer total cost, and delivery only', () => {
  const base = {
    tenant: 'itg', asin: 'B000000001', currency: 'JPY', approved: true,
    stock_status: 'IN_STOCK', delivery_days: 3
  };
  const offers = [
    context.MarketplaceEngine.normalizeOffer({ ...base, offer_id: 'high-profit', marketplace: 'AMAZON_JP', product_url: 'https://amazon.co.jp/dp/B000000001', price: 1500, shipping_fee: 0, seller_profit: 999999 }),
    context.MarketplaceEngine.normalizeOffer({ ...base, offer_id: 'customer-low', marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item', price: 1000, shipping_fee: 200, seller_profit: 1 }),
    context.MarketplaceEngine.normalizeOffer({ ...base, offer_id: 'out', marketplace: 'YAHOO_JP', product_url: 'https://shopping.yahoo.co.jp/products/item', price: 500, shipping_fee: 0, stock_status: 'OUT_OF_STOCK' })
  ];
  const ranked = Array.from(context.MarketplaceEngine.rankOffers(offers));
  assert.strictEqual(ranked[0].offer_id, 'customer-low');
  assert.strictEqual(ranked[2].offer_id, 'out');
  const source = fs.readFileSync(path.join(gasDir, 'MarketplaceEngine.gs'), 'utf8');
  const rankingSource = source.slice(source.indexOf('function rankOffers'), source.indexOf('function loadApprovedOffers'));
  assert.strictEqual(/profit/i.test(rankingSource), false);
});

test('multi-EC offers are isolated by tenant and attached without seller internals', () => {
  const normalized = context.MarketplaceEngine.normalizeOffer({
    offer_id: 'offer-1', tenant: 'itg', asin: 'B000000001', marketplace: 'RAKUTEN_JP',
    product_url: 'https://item.rakuten.co.jp/shop/item', price: 1000, shipping_fee: 100,
    currency: 'JPY', stock_status: 'IN_STOCK', delivery_days: 2,
    seller_name: 'Internal Seller', external_product_id: 'secret-id', approved: true
  });
  const map = { 'itg|B000000001': [normalized] };
  const records = [
    { tenant: 'itg', asin: 'B000000001' },
    { tenant: 'mc2', asin: 'B000000001' }
  ];
  const attached = Array.from(context.MarketplaceEngine.attachOffers(records, map));
  assert.strictEqual(attached[0].marketplace_offers.length, 1);
  assert.strictEqual(attached[1].marketplace_offers.length, 0);
  assert.strictEqual(attached[0].marketplace_offers[0].total_cost, 1100);
  assert.strictEqual('seller_name' in attached[0].marketplace_offers[0], false);
  assert.strictEqual('external_product_id' in attached[0].marketplace_offers[0], false);
});

test('legacy Amazon URLs become unapproved drafts without duplicating existing offers', () => {
  const records = [
    { tenant: 'itg', asin: 'B000000001', amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000001', sale_price: 1980, shipping: 500, stock: 3, updated_at: 'now' },
    { tenant: 'itg', asin: 'B000000002', amazon_jp_url: 'https://www.amazon.co.jp/dp/B000000002', sale_price: 1200, stock: 0 },
    { tenant: 'itg', asin: 'B000000003', amazon_jp_url: 'https://evil.example/item', sale_price: 1000 }
  ];
  const existing = [['existing', 'itg', 'B000000002', 'AMAZON_JP']];
  const drafts = Array.from(context.MarketplaceEngine.buildLegacyAmazonDraftRows(records, existing, 'generated'));
  assert.strictEqual(drafts.length, 1);
  assert.deepStrictEqual(Array.from(drafts[0].slice(1, 10)), ['itg', 'B000000001', 'AMAZON_JP', 'B000000001', 'https://www.amazon.co.jp/dp/B000000001', 1980, 500, 'JPY', 'IN_STOCK']);
  assert.strictEqual(drafts[0][12], false);
});

test('offer validation separates invalid approved rows from incomplete drafts', () => {
  const valid = ['offer-1', 'itg', 'B000000001', 'AMAZON_JP', 'B000000001', 'https://amazon.co.jp/dp/B000000001', 1000, 0, 'JPY', 'IN_STOCK', 2, '', true, 'now'];
  const invalidApproved = ['offer-2', 'itg', 'B000000002', 'RAKUTEN_JP', '', 'https://evil.example/item', 1000, 0, 'JPY', 'IN_STOCK', 2, '', true, 'now'];
  const incompleteDraft = ['offer-3', 'itg', 'B000000003', 'YAHOO_JP', '', 'https://shopping.yahoo.co.jp/products/item', '', 0, 'JPY', 'UNKNOWN', '', '', false, 'now'];
  const result = context.MarketplaceEngine.validateRows([valid, invalidApproved, incompleteDraft], 'checked');
  assert.strictEqual(result.summary.approved_valid, 1);
  assert.strictEqual(result.summary.approved_invalid, 1);
  assert.strictEqual(result.summary.draft_valid, 0);
  assert.strictEqual(result.summary.draft_incomplete, 1);
  assert.strictEqual(result.rows[1][6], 'FAIL');
  assert.strictEqual(result.rows[2][6], 'DRAFT_INCOMPLETE');
});

test('Marketplace offer sheet configuration prevents common manual input mistakes', () => {
  const source = fs.readFileSync(path.join(gasDir, 'MarketplaceEngine.gs'), 'utf8');
  const configuration = source.slice(source.indexOf('function configureSheet'), source.indexOf('function isTrue'));
  assert.match(configuration, /requireValueInList\(Object\.keys\(MARKETPLACES\)/);
  assert.match(configuration, /requireNumberGreaterThan\(0\)/);
  assert.match(configuration, /requireNumberGreaterThanOrEqualTo\(0\)/);
  assert.match(configuration, /requireCheckbox\(\)/);
  assert.match(configuration, /setFrozenRows\(1\)/);
  assert.match(configuration, /setNotes/);
});

test('Knowledge search returns evidence-backed Japanese matches only', () => {
  const records = [
    { tenant: 'itg', asin: 'B000000001', sku: 'S1', product_name: 'アメリカで人気の朝食シリアル チョコ味', manufacturer: 'Maker A', stock: 10, image: 'img', amazon_jp_url: 'url', marketplace_offers: [{ marketplace: 'RAKUTEN_JP', product_url: 'https://item.rakuten.co.jp/shop/item', total_cost: 1200 }], row_hash: 'hash-1', imported_at: '2026-07-14' },
    { tenant: 'itg', asin: 'B000000002', sku: 'S2', product_name: '敏感肌向け化粧水', manufacturer: 'Maker B', stock: 10, image: 'img', amazon_jp_url: 'url', row_hash: 'hash-2', imported_at: '2026-07-14' }
  ];
  const result = Array.from(context.KnowledgeEngine.search('アメリカのシリアルが食べたい', records), item => item);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].asin, 'B000000001');
  assert.ok(result[0].evidence.matched_terms.length > 0);
  assert.strictEqual(result[0].evidence.source_hash, 'hash-1');
  assert.strictEqual(result[0].offers[0].marketplace, 'RAKUTEN_JP');
});

test('Knowledge ranking never uses seller profit', () => {
  const base = { tenant: 'itg', product_name: 'オーガニック シリアル', manufacturer: 'Maker', stock: 10, image: 'img', amazon_jp_url: 'url' };
  const records = [
    { ...base, asin: 'B000000001', sku: 'LOW', profit: 1 },
    { ...base, asin: 'B000000009', sku: 'HIGH', profit: 999999 }
  ];
  const result = Array.from(context.KnowledgeEngine.search('オーガニック シリアル', records), item => item);
  assert.strictEqual(result[0].asin, 'B000000001');
  const source = fs.readFileSync(path.join(gasDir, 'KnowledgeEngine.gs'), 'utf8');
  const scoringSource = source.slice(source.indexOf('function scoreRecord'), source.indexOf('function search'));
  assert.strictEqual(/profit/i.test(scoringSource), false);
});

test('Knowledge search refuses unsupported answers and limits results to three', () => {
  const unrelated = [{ asin: 'B000000001', product_name: '化粧水', manufacturer: 'Maker', stock: 1 }];
  assert.strictEqual(context.KnowledgeEngine.search('シリアル', unrelated).length, 0);
  const many = [1, 2, 3, 4, 5].map((number) => ({
    asin: `B00000000${number}`, product_name: 'シリアル 朝食', manufacturer: 'Maker', stock: 1
  }));
  assert.strictEqual(context.KnowledgeEngine.search('シリアル', many).length, 3);
});

test('Knowledge data is isolated by tenant and raw query is not logged', () => {
  const records = [
    { tenant: 'itg', asin: 'B000000001' },
    { tenant: 'mc2', asin: 'B000000002' }
  ];
  const filtered = Array.from(context.KnowledgeEngine.filterRecordsByTenant(records, 'ITG'));
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].asin, 'B000000001');
  assert.strictEqual(Array.from(context.KnowledgeEngine.QUERY_LOG_HEADERS).includes('Query_Text'), false);
});

test('romaji input matches Japanese kana product names', () => {
  assert.strictEqual(context.MultilingualSeoEngine.romanizeText('アメリカのシリアル'), 'amerikanoshiriaru');
  const records = [{
    tenant: 'itg', asin: 'B000000001', product_name: 'アメリカのシリアル',
    manufacturer: 'Maker', stock: 1
  }];
  const result = Array.from(context.KnowledgeEngine.search('amerika no shiriaru', records));
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].asin, 'B000000001');
});

test('Knowledge detects Japanese, English, Chinese, and Korean', () => {
  assert.strictEqual(context.MultilingualSeoEngine.detectLanguage('シリアルが欲しい'), 'JA');
  assert.strictEqual(context.MultilingualSeoEngine.detectLanguage('breakfast cereal'), 'EN');
  assert.strictEqual(context.MultilingualSeoEngine.detectLanguage('早餐麦片'), 'ZH');
  assert.strictEqual(context.MultilingualSeoEngine.detectLanguage('아침 시리얼'), 'KO');
});

test('approved multilingual aliases connect four-language searches to one ASIN', () => {
  const record = {
    tenant: 'itg', asin: 'B000000001', product_name: '朝食シリアル', manufacturer: 'Maker', stock: 1,
    search_aliases: ['breakfast cereal', '早餐 麦片', '아침 시리얼', 'choushoku shiriaru']
  };
  ['breakfast cereal', '早餐 麦片', '아침 시리얼', 'choushoku shiriaru'].forEach((query) => {
    const result = context.KnowledgeEngine.search(query, [record]);
    assert.strictEqual(result.length, 1, query);
    assert.strictEqual(result[0].asin, 'B000000001', query);
  });
});

test('localized content changes display language without replacing source title', () => {
  const records = [{ asin: 'B000000001', product_name: '朝食シリアル', search_aliases: [] }];
  const attached = Array.from(context.MultilingualSeoEngine.attachLocalizedContent(records, {
    B000000001: {
      language: 'EN', display_name: 'Breakfast Cereal',
      description: 'A crunchy breakfast option.', keywords: 'cereal breakfast'
    }
  }, 'EN'));
  const result = Array.from(context.KnowledgeEngine.search('breakfast cereal', attached));
  assert.strictEqual(result[0].product_name, '朝食シリアル');
  assert.strictEqual(result[0].display_name, 'Breakfast Cereal');
  assert.strictEqual(result[0].language, 'EN');
});

test('multilingual SEO score identifies missing English, Chinese, and Korean coverage', () => {
  const result = context.MultilingualSeoEngine.scoreRecord(
    { product_name: 'シリアル', manufacturer: 'Maker' },
    [{ language: 'ROMAJI' }, { language: 'EN' }]
  );
  assert.strictEqual(result.romaji_count, 1);
  assert.strictEqual(result.english_count, 1);
  assert.strictEqual(result.chinese_count, 0);
  assert.strictEqual(result.korean_count, 0);
  assert.ok(result.missing.some((item) => item.includes('中国語')));
  assert.ok(result.missing.some((item) => item.includes('韓国語')));
});

test('JAN, EAN, and UPC identifiers require valid check digits', () => {
  assert.strictEqual(context.ProductIdentifierEngine.validateType('JAN', '4901234567894'), '4901234567894');
  assert.strictEqual(context.ProductIdentifierEngine.validateType('EAN', '4006381333931'), '4006381333931');
  assert.strictEqual(context.ProductIdentifierEngine.validateType('EAN', '96385074'), '96385074');
  assert.strictEqual(context.ProductIdentifierEngine.validateType('UPC', '036000291452'), '036000291452');
  assert.throws(() => context.ProductIdentifierEngine.validateType('JAN', '4901234567890'), /チェックディジット/);
  assert.throws(() => context.ProductIdentifierEngine.validateType('UPC', '4901234567894'), /UPCは12桁/);
});

test('product identifier lookup is isolated by tenant', () => {
  const mappings = [
    { tenant: 'itg', asin: 'B000000001', value: '4901234567894' },
    { tenant: 'mc2', asin: 'B000000002', value: '4901234567894' }
  ];
  const records = [
    { tenant: 'itg', asin: 'B000000001', product_name: 'ITG商品' },
    { tenant: 'mc2', asin: 'B000000002', product_name: 'MC2商品' }
  ];
  const result = context.ProductIdentifierEngine.lookup(records, mappings, 'ITG', '4901234567894');
  assert.strictEqual(result.status, 'FOUND');
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.records[0].product_name, 'ITG商品');
});

test('one product code mapped to multiple ASINs is stopped as ambiguous', () => {
  const mappings = [
    { tenant: 'itg', asin: 'B000000001', value: '4901234567894' },
    { tenant: 'itg', asin: 'B000000002', value: '4901234567894' }
  ];
  const records = [
    { tenant: 'itg', asin: 'B000000001' },
    { tenant: 'itg', asin: 'B000000002' }
  ];
  const result = context.ProductIdentifierEngine.lookup(records, mappings, 'itg', '4901234567894');
  assert.strictEqual(result.status, 'AMBIGUOUS');
  assert.strictEqual(result.records.length, 0);
  assert.deepStrictEqual(Array.from(result.asins), ['B000000001', 'B000000002']);
  const conflicts = context.ProductIdentifierEngine.findConflicts(mappings);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].tenant, 'itg');
  assert.deepStrictEqual(Array.from(conflicts[0].asins), ['B000000001', 'B000000002']);
});

test('identifier mapping never replaces the Japanese source product name', () => {
  const source = { tenant: 'itg', asin: 'B000000001', product_name: '日本語の商品名' };
  const result = context.ProductIdentifierEngine.lookup(
    [source], [{ tenant: 'itg', asin: 'B000000001', value: '4901234567894' }],
    'itg', '4901234567894'
  );
  assert.strictEqual(result.records[0].product_name, '日本語の商品名');
  assert.strictEqual(source.product_name, '日本語の商品名');
});

test('LINE bridge comparison and help copy do not expose secrets', () => {
  assert.strictEqual(context.LineIntegration.secureEquals('same-value', 'same-value'), true);
  assert.strictEqual(context.LineIntegration.secureEquals('same-value', 'different'), false);
  assert.match(context.LineIntegration.localizedHelp('EN', true), /Japanese.*English.*Chinese.*Korean.*romaji/i);
  const source = fs.readFileSync(path.join(gasDir, 'LineIntegration.gs'), 'utf8');
  assert.strictEqual(/LINE_CHANNEL_SECRET|LINE_CHANNEL_ACCESS_TOKEN/.test(source), false);
  assert.strictEqual(context.LineIntegration.EVENT_HEADERS.includes('Message_Text'), false);
});

test('LINE non-text events receive safe help without calling Knowledge', () => {
  const response = context.LineIntegration.responseForEvent({
    type: 'message', message: { type: 'image' }, source: { userId: 'U123' }
  });
  assert.strictEqual(response.status, 'HELP');
  assert.strictEqual(response.candidates.length, 0);
});

test('PWA Knowledge requires consent and a bounded question before configuration access', () => {
  assert.throws(() => context.LineIntegration.answerPublic({ query: 'シリアル', consent: false }), /利用同意/);
  assert.throws(() => context.LineIntegration.answerPublic({ query: 'x', consent: true }), /2〜200文字/);
  assert.strictEqual(context.LineIntegration.PROPERTY_PWA_CONTRACT_ID, 'PWA_CONTRACT_ID');
  assert.strictEqual(context.LineIntegration.PROPERTY_PWA_DEFAULT_CATEGORY, 'PWA_DEFAULT_CATEGORY');
});

test('preflight summary blocks release only when FAIL exists', () => {
  const ready = context.PreflightEngine.summarize([
    ['CORE', 'Config', 'PASS'], ['PWA', 'Web App', 'WARN']
  ]);
  assert.strictEqual(ready.ready, true);
  assert.strictEqual(ready.pass, 1);
  assert.strictEqual(ready.warn, 1);
  const blocked = context.PreflightEngine.summarize([
    ['CORE', 'Config', 'PASS'], ['CONTRACT', '契約', 'FAIL']
  ]);
  assert.strictEqual(blocked.ready, false);
  assert.strictEqual(blocked.fail, 1);
});

test('preflight property checks reveal presence but never secret values', () => {
  const present = context.PreflightEngine.propertyStatus({ LINE_BRIDGE_SECRET: 'super-secret-value' }, 'LINE_BRIDGE_SECRET', true);
  const missing = context.PreflightEngine.propertyStatus({}, 'PWA_CONTRACT_ID', true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(present)), { status: 'PASS', details: '設定済み' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(missing)), { status: 'FAIL', details: '未設定' });
  assert.strictEqual(JSON.stringify(present).includes('super-secret-value'), false);
});

test('Windows bridge uses safe ZIP handoff and hash idempotency', () => {
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  assert.strictEqual(/Get-ChildItem[^\n]+-Filter '\*\.zip'/.test(bridge), true);
  assert.strictEqual(/Get-FileHash[^\n]+SHA256/.test(bridge), true);
  assert.strictEqual(/New-InitialState/.test(bridge), true);
  assert.strictEqual(/\.projectgate-uploading-/.test(bridge), true);
  assert.strictEqual(/Start-Sleep -Seconds 300/.test(bridge), true);
  assert.strictEqual(/password|client_secret|access_token/i.test(bridge), false);
});

if (process.env.PROJECT_GATE_SAMPLE_CSV) {
  test('provided CP932 sample first 100 rows after UTF-8 conversion', () => {
    const lines = fs.readFileSync(process.env.PROJECT_GATE_SAMPLE_CSV, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    const header = simpleParseCsv(lines[0])[0];
    const index = context.MappingEngine.buildIndex(header);
    const normalized = lines.slice(1, 101).map((line, offset) => {
      const source = simpleParseCsv(line)[0];
      const mapped = context.MappingEngine.mapRow(source, index, offset + 2);
      return context.NormalizeEngine.normalize(mapped, 'itt', 'sample-batch');
    });
    const result = context.ValidationEngine.validate(normalized);
    assert.strictEqual(header.length, 23);
    assert.strictEqual(result.validRecords.length, 100);
    assert.strictEqual(result.errors.length, 0);
  });
}

if (!process.exitCode) {
  process.stdout.write('ALL TESTS PASSED\n');
}
