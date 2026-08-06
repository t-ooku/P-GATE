import test from 'node:test';
import assert from 'node:assert/strict';
import {
  romanizeText, detectLanguage, scoreRecord, normalizeAliasEntry, normalizeContentEntry,
  attachAliases, attachLocalizedContent, attachMultilingualContent
} from '../src/multilingual-seo.mjs';
import {
  handleMultilingualSyncRoutes, validateMultilingualSyncPayload
} from '../src/multilingual-seo-routes.mjs';

const SECRET = 'y'.repeat(32);

test('romanizeTextは促音・長音・拗音を含めてgas/MultilingualSeoEngine.gsと同じ変換をする', () => {
  assert.equal(romanizeText('がっこう'), 'gakkou');
  assert.equal(romanizeText('とうきょう'), 'toukyou');
  assert.equal(romanizeText('きゃっしゅ'), 'kyasshu');
  assert.equal(romanizeText('スーパー'), 'suupaa');
  assert.equal(romanizeText(''), '');
});

test('detectLanguageは韓国語・日本語・中国語・英語を判定する', () => {
  assert.equal(detectLanguage('안녕하세요'), 'KO');
  assert.equal(detectLanguage('こんにちは'), 'JA');
  assert.equal(detectLanguage('カタカナ'), 'JA');
  assert.equal(detectLanguage('你好世界'), 'ZH');
  assert.equal(detectLanguage('hello world'), 'EN');
  assert.equal(detectLanguage(''), 'JA');
});

test('scoreRecordは承認済み別名の言語別件数からスコアと不足項目を計算する', () => {
  const record = { product_name: 'がっこうバッグ', manufacturer: 'HOSHILU' };
  const noAliases = scoreRecord(record, []);
  // autoRomaji(10) + manufacturerに英字あり(5)
  assert.equal(noAliases.score, 15);
  assert.deepEqual(noAliases.missing, [
    '承認済みローマ字別名を追加', '承認済み英語別名を追加', '承認済み中国語別名を追加', '承認済み韓国語別名を追加'
  ]);
  const full = scoreRecord(record, [
    { language: 'ROMAJI' }, { language: 'EN' }, { language: 'ZH' }, { language: 'KO' }
  ]);
  assert.equal(full.score, 100);
  assert.deepEqual(full.missing, []);
});

test('normalizeAliasEntryは必須項目・対応言語を検証する', () => {
  const entry = normalizeAliasEntry({ tenant: 'ITG', asin: 'b000000001', alias: 'gakkou bag', language: 'romaji', approved: 'TRUE' });
  assert.equal(entry.tenant, 'itg');
  assert.equal(entry.asin, 'B000000001');
  assert.equal(entry.approved, true);
  assert.throws(() => normalizeAliasEntry({ tenant: 'itg', asin: 'B1', alias: 'x', language: 'FR' }), /ALIAS_LANGUAGE_INVALID/);
  assert.throws(() => normalizeAliasEntry({ tenant: 'itg', asin: 'B1', language: 'EN' }), /ALIAS_TEXT_REQUIRED/);
  assert.throws(() => normalizeAliasEntry({ asin: 'B1', alias: 'x', language: 'EN' }), /ALIAS_TENANT_REQUIRED/);
});

test('normalizeContentEntryは必須項目・対応言語を検証する', () => {
  const entry = normalizeContentEntry({
    tenant: 'itg', asin: 'b000000001', language: 'en', display_name: 'School Bag', approved: true
  });
  assert.equal(entry.display_name, 'School Bag');
  assert.equal(entry.approved, true);
  assert.throws(() => normalizeContentEntry({ tenant: 'itg', asin: 'B1', language: 'FR' }), /CONTENT_LANGUAGE_INVALID/);
  assert.throws(() => normalizeContentEntry({ tenant: 'itg', language: 'EN' }), /CONTENT_ASIN_REQUIRED/);
});

test('attachAliasesはASIN一致の承認済み別名だけをsearch_aliasesへ付与する', () => {
  const candidates = [{ asin: 'B000000001' }, { asin: 'B000000002' }];
  const result = attachAliases(candidates, {
    B000000001: [{ alias: 'school bag' }, { alias: 'gakkou bag' }]
  });
  assert.deepEqual(result[0].search_aliases, ['school bag', 'gakkou bag']);
  assert.equal(result[1].search_aliases, undefined);
});

test('attachLocalizedContentは既にdescriptionがある候補を上書きしない(GAS由来候補の保護)', () => {
  const candidates = [
    { asin: 'B000000001', display_name: 'raw' },
    { asin: 'B000000002', display_name: 'raw', description: 'already localized by GAS' }
  ];
  const result = attachLocalizedContent(candidates, {
    B000000001: { display_name: 'School Bag', description: 'A bag for school.' },
    B000000002: { display_name: 'Should Not Apply', description: 'Should not apply' }
  }, 'EN');
  assert.equal(result[0].display_name, 'School Bag');
  assert.equal(result[0].description, 'A bag for school.');
  assert.equal(result[1].description, 'already localized by GAS');
  assert.equal(result[1].display_name, 'raw');
});

function createFakeD1({ aliases = [], content = [] } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              if (/FROM product_aliases/.test(sql)) {
                const [tenant, ...asins] = values;
                return { results: aliases.filter((row) => row.tenant === tenant && row.approved === 1 && asins.includes(row.asin)) };
              }
              if (/FROM localized_product_content/.test(sql)) {
                const [tenant, language, ...asins] = values;
                return { results: content.filter((row) => row.tenant === tenant && row.language === language && row.approved === 1 && asins.includes(row.asin)) };
              }
              return { results: [] };
            }
          };
        }
      };
    }
  };
}

test('attachMultilingualContentはtenant付きD1候補だけを対象にテナント別にD1を引く', async () => {
  const env = { PRODUCT_DB: createFakeD1({
    aliases: [{ tenant: 'itg', asin: 'B000000001', language: 'EN', alias: 'school bag', approved: 1 }],
    content: [{ tenant: 'itg', asin: 'B000000001', language: 'EN', display_name: 'School Bag', description: 'A bag.', approved: 1 }]
  }) };
  const candidates = [
    { asin: 'B000000001', tenant: 'itg', display_name: 'raw' },
    { asin: 'B000000099', display_name: 'no tenant (GAS-origin)' }
  ];
  const result = await attachMultilingualContent(env, candidates, 'EN');
  assert.equal(result[0].description, 'A bag.');
  assert.deepEqual(result[0].search_aliases, ['school bag']);
  assert.equal(result[1].description, undefined);
});

test('attachMultilingualContentはPRODUCT_DB未設定・エラー時はno-opでそのまま返す', async () => {
  const candidates = [{ asin: 'B1', tenant: 'itg' }];
  assert.deepEqual(await attachMultilingualContent({}, candidates, 'EN'), candidates);
  const throwingEnv = { PRODUCT_DB: { prepare() { throw new Error('boom'); } } };
  assert.deepEqual(await attachMultilingualContent(throwingEnv, candidates, 'EN'), candidates);
});

test('多言語同期APIは専用Secretなしで拒否する', async () => {
  const response = await handleMultilingualSyncRoutes(new Request(
    'https://hoshilu.app/api/internal/multilingual/sync',
    { method: 'POST', body: '{}' }
  ), { PRODUCT_DB: {}, MULTILINGUAL_SYNC_SECRET: SECRET });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});

test('多言語同期APIはD1未設定なら503を返す', async () => {
  const response = await handleMultilingualSyncRoutes(new Request(
    'https://hoshilu.app/api/internal/multilingual/sync',
    { method: 'POST', body: '{}', headers: { authorization: `Bearer ${SECRET}` } }
  ), { MULTILINGUAL_SYNC_SECRET: SECRET });
  assert.equal(response.status, 503);
});

test('validateMultilingualSyncPayloadはバッチID形式と空ペイロードを検証する', () => {
  assert.throws(() => validateMultilingualSyncPayload({ batch_id: 'short', aliases: [] }), /MULTILINGUAL_SYNC_BATCH_INVALID/);
  assert.throws(() => validateMultilingualSyncPayload({ batch_id: 'valid-batch-0001', aliases: [], content: [] }), /MULTILINGUAL_SYNC_RECORD_COUNT_INVALID/);
  const payload = validateMultilingualSyncPayload({
    batch_id: 'valid-batch-0001',
    aliases: [{ tenant: 'itg', asin: 'B1', alias: 'x', language: 'EN' }]
  });
  assert.equal(payload.aliases[0].asin, 'B1');
});
