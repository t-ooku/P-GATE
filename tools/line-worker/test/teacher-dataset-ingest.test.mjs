import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTeacherDatasetBatch,
  contentHashFor,
  ingestTeacherDatasetBatch,
  recordRegressionResult
} from '../src/search-quality/teacher-dataset-ingest.mjs';

function makeFakeD1() {
  const teacherQueries = [];
  const teacherValidation = [];
  return {
    tables: { teacherQueries, teacherValidation },
    prepare(sql) {
      const text = sql.trim();
      return {
        bind(...args) {
          return {
            all: async () => {
              if (text.startsWith('SELECT content_hash FROM teacher_queries')) {
                const hashes = new Set(args);
                return { results: teacherQueries.filter((row) => hashes.has(row.content_hash)).map((row) => ({ content_hash: row.content_hash })) };
              }
              return { results: [] };
            },
            run: async () => {
              if (text.startsWith('INSERT INTO teacher_queries')) {
                const [entry_id, content_hash, query_text, locale, persona, user_intent, ideal_answer, reason, category,
                  search_terms_ja, search_terms_en, search_terms_ko, search_terms_zh, excluded_conditions, confidence,
                  source, status, batch_id, authored_date, authored_updated_date, created_at, updated_at] = args;
                teacherQueries.push({
                  entry_id, content_hash, query_text, locale, persona, user_intent, ideal_answer, reason, category,
                  search_terms_ja, search_terms_en, search_terms_ko, search_terms_zh, excluded_conditions, confidence,
                  source, status, batch_id, authored_date, authored_updated_date, created_at, updated_at
                });
              } else if (text.startsWith('INSERT INTO teacher_validation')) {
                const [validation_id, batch_id, batch_source, validated_at, total_records, new_records,
                  duplicate_records_skipped, invalid_records_skipped, regression_test_status, applied, created_at] = args;
                teacherValidation.push({
                  validation_id, batch_id, batch_source, validated_at, total_records, new_records,
                  duplicate_records_skipped, invalid_records_skipped, regression_test_status, applied, created_at
                });
              } else if (text.startsWith('UPDATE teacher_validation SET regression_test_status')) {
                const [status, summary, batch_id] = args;
                const row = teacherValidation.find((v) => v.batch_id === batch_id);
                if (row) { row.regression_test_status = status; row.regression_test_summary = summary; }
              } else if (text.startsWith("UPDATE teacher_queries SET status = 'ACTIVE'")) {
                const [updated_at, batch_id] = args;
                teacherQueries.filter((row) => row.batch_id === batch_id && row.status === 'PENDING')
                  .forEach((row) => { row.status = 'ACTIVE'; row.updated_at = updated_at; });
              } else if (text.startsWith('UPDATE teacher_validation SET applied = 1')) {
                const [batch_id] = args;
                const row = teacherValidation.find((v) => v.batch_id === batch_id);
                if (row) row.applied = 1;
              }
              return { meta: { changes: 1 } };
            },
            first: async () => undefined
          };
        },
        all: async () => ({ results: [] })
      };
    }
  };
}

function baseRecord(overrides = {}) {
  return {
    query_text: 'ぴかぴかするイヤホン',
    locale: 'ja',
    persona: 'child',
    user_intent: '光る完全ワイヤレスイヤホンを探している',
    ideal_answer: 'LED発光する完全ワイヤレスイヤホン',
    reason: '「ぴかぴか」はLED_LIGHT_UP属性への言い換え',
    category: 'earbuds',
    search_terms: { ja: ['光る イヤホン', 'led ワイヤレスイヤホン'], en: ['light up earbuds'], ko: [], zh: [] },
    excluded_conditions: [],
    confidence: 0.7,
    authored_date: '2026-08-05',
    authored_updated_date: '2026-08-05',
    ...overrides
  };
}

test('必須項目が欠けたレコードは無効として除外される', () => {
  const { valid, errors } = validateTeacherDatasetBatch([
    baseRecord(),
    baseRecord({ category: '' }),
    { query_text: 'x' }
  ]);
  assert.equal(valid.length, 1);
  assert.equal(errors.length, 2);
  assert.match(errors[0].errors.join(','), /category: required/);
});

test('confidenceが範囲外なら無効になる', () => {
  const { valid, errors } = validateTeacherDatasetBatch([baseRecord({ confidence: 1.5 })]);
  assert.equal(valid.length, 0);
  assert.match(errors[0].errors.join(','), /confidence/);
});

test('search_termsが配列でない場合は無効になる', () => {
  const { valid, errors } = validateTeacherDatasetBatch([baseRecord({ search_terms: { ja: 'not-an-array' } })]);
  assert.equal(valid.length, 0);
  assert.match(errors[0].errors.join(','), /search_terms\.ja/);
});

test('同一query_text+category+localeは同じcontent_hashになる（大小文字・空白の揺れを吸収）', async () => {
  const a = await contentHashFor(baseRecord());
  const b = await contentHashFor(baseRecord({ query_text: '  ぴかぴかするイヤホン  ' }));
  assert.equal(a, b);
});

test('新規バッチはPENDINGとして登録され、teacher_validationに件数が記録される', async () => {
  const db = makeFakeD1();
  const result = await ingestTeacherDatasetBatch(db, {
    batchId: 'batch-2026-08-05-001',
    records: [baseRecord(), baseRecord({ query_text: 'テレビに映すやつ', persona: 'elderly', category: 'streaming-device' })]
  });
  assert.equal(result.inserted, 2);
  assert.equal(result.duplicatesSkipped, 0);
  assert.equal(result.invalidSkipped, 0);
  assert.equal(db.tables.teacherQueries.length, 2);
  assert.ok(db.tables.teacherQueries.every((row) => row.status === 'PENDING'));
  assert.equal(db.tables.teacherValidation[0].new_records, 2);
});

test('同じ内容のバッチを再取り込みすると全件が重複として除外される（全件更新禁止・追加分のみ）', async () => {
  const db = makeFakeD1();
  await ingestTeacherDatasetBatch(db, { batchId: 'batch-001', records: [baseRecord()] });
  const second = await ingestTeacherDatasetBatch(db, { batchId: 'batch-002', records: [baseRecord()] });
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicatesSkipped, 1);
  assert.equal(db.tables.teacherQueries.length, 1);
});

test('バッチ内の重複も1件だけ登録する', async () => {
  const db = makeFakeD1();
  const result = await ingestTeacherDatasetBatch(db, { batchId: 'batch-003', records: [baseRecord(), baseRecord()] });
  assert.equal(result.inserted, 1);
  assert.equal(result.duplicatesSkipped, 1);
});

test('無効レコードはスキップされるが、同バッチ内の有効レコードは登録される', async () => {
  const db = makeFakeD1();
  const result = await ingestTeacherDatasetBatch(db, {
    batchId: 'batch-004',
    records: [baseRecord(), { query_text: 'incomplete' }]
  });
  assert.equal(result.inserted, 1);
  assert.equal(result.invalidSkipped, 1);
});

test('子ども・高齢者・外国人ペルソナが同一バッチで取り込める', async () => {
  const db = makeFakeD1();
  const result = await ingestTeacherDatasetBatch(db, {
    batchId: 'batch-personas',
    records: [
      baseRecord({ persona: 'child', query_text: 'ママが持ってるやつ', category: 'UNCLASSIFIED' }),
      baseRecord({ persona: 'elderly', query_text: '軽い掃除機', category: 'vacuum' }),
      baseRecord({ persona: 'foreign', locale: 'mixed', query_text: 'sumaho keesu iphone 15', category: 'phone-case' })
    ]
  });
  assert.equal(result.inserted, 3);
  const personas = new Set(db.tables.teacherQueries.map((row) => row.persona));
  assert.deepEqual(personas, new Set(['child', 'elderly', 'foreign']));
});

test('回帰テストPASSでPENDING→ACTIVEへ昇格し、FAILは昇格しない', async () => {
  const db = makeFakeD1();
  await ingestTeacherDatasetBatch(db, { batchId: 'batch-pass', records: [baseRecord()] });
  await ingestTeacherDatasetBatch(db, { batchId: 'batch-fail', records: [baseRecord({ query_text: '透明なやつ' })] });

  await recordRegressionResult(db, 'batch-pass', { status: 'PASS' });
  await recordRegressionResult(db, 'batch-fail', { status: 'FAIL', summary: 'search-quality-regression 2 failing' });

  const passRow = db.tables.teacherQueries.find((row) => row.batch_id === 'batch-pass');
  const failRow = db.tables.teacherQueries.find((row) => row.batch_id === 'batch-fail');
  assert.equal(passRow.status, 'ACTIVE');
  assert.equal(failRow.status, 'PENDING');
  assert.equal(db.tables.teacherValidation.find((v) => v.batch_id === 'batch-pass').applied, 1);
  assert.equal(db.tables.teacherValidation.find((v) => v.batch_id === 'batch-fail').applied, 0);
});

test('batchIdが無い場合は例外を投げる', async () => {
  const db = makeFakeD1();
  await assert.rejects(() => ingestTeacherDatasetBatch(db, { records: [baseRecord()] }), /BATCH_ID_REQUIRED/);
});
