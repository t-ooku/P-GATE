const REQUIRED_FIELDS = [
  'query_text','locale','persona','user_intent','ideal_answer','reason','category',
  'search_terms','excluded_conditions','confidence','authored_date','authored_updated_date'
];
const LOCALES = new Set(['ja','en','ko','zh','mixed']);
const PERSONAS = new Set(['child','elderly','foreign','general']);
const SEARCH_TERM_LOCALES = ['ja','en','ko','zh'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function normalizedText(value) {
  return String(value || '').normalize('NFKC').trim();
}

export function validateTeacherDatasetRecord(record, index) {
  const errors = [];
  if (!record || typeof record !== 'object') return [`record[${index}]: not an object`];

  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      errors.push(`record[${index}].${field}: required`);
    }
  }
  if (record.locale !== undefined && !LOCALES.has(record.locale)) {
    errors.push(`record[${index}].locale: invalid`);
  }
  if (record.persona !== undefined && !PERSONAS.has(record.persona)) {
    errors.push(`record[${index}].persona: invalid`);
  }
  if (record.confidence !== undefined && (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1)) {
    errors.push(`record[${index}].confidence: must be a number between 0 and 1`);
  }
  if (record.authored_date !== undefined && !DATE_PATTERN.test(String(record.authored_date))) {
    errors.push(`record[${index}].authored_date: must be YYYY-MM-DD`);
  }
  if (record.authored_updated_date !== undefined && !DATE_PATTERN.test(String(record.authored_updated_date))) {
    errors.push(`record[${index}].authored_updated_date: must be YYYY-MM-DD`);
  }
  if (record.excluded_conditions !== undefined && !Array.isArray(record.excluded_conditions)) {
    errors.push(`record[${index}].excluded_conditions: must be an array`);
  }
  if (record.search_terms !== undefined) {
    if (typeof record.search_terms !== 'object' || record.search_terms === null || Array.isArray(record.search_terms)) {
      errors.push(`record[${index}].search_terms: must be an object`);
    } else {
      for (const lang of SEARCH_TERM_LOCALES) {
        if (record.search_terms[lang] !== undefined && !Array.isArray(record.search_terms[lang])) {
          errors.push(`record[${index}].search_terms.${lang}: must be an array`);
        }
      }
    }
  }
  return errors;
}

export function validateTeacherDatasetBatch(records) {
  if (!Array.isArray(records)) {
    return { valid: [], errors: [{ index: -1, errors: ['batch must be an array'] }] };
  }
  const valid = [];
  const errors = [];
  records.forEach((record, index) => {
    const recordErrors = validateTeacherDatasetRecord(record, index);
    if (recordErrors.length) errors.push({ index, errors: recordErrors });
    else valid.push(record);
  });
  return { valid, errors };
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function contentHashFor(record) {
  const key = [
    normalizedText(record.query_text).toLowerCase(),
    normalizedText(record.category).toLowerCase(),
    record.locale || 'ja'
  ].join('|');
  return sha256Hex(key);
}

function entryIdFor(contentHash) {
  return `tq_${contentHash.slice(0, 16)}`;
}

export async function diffAgainstExisting(db, records) {
  const withHashes = await Promise.all(records.map(async (record) => ({ record, content_hash: await contentHashFor(record) })));
  if (!withHashes.length) return { newRecords: [], duplicates: [] };

  const placeholders = withHashes.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT content_hash FROM teacher_queries WHERE content_hash IN (${placeholders})`
  ).bind(...withHashes.map((item) => item.content_hash)).all();
  const existing = new Set((results || []).map((row) => row.content_hash));

  const seenInBatch = new Set();
  const newRecords = [];
  const duplicates = [];
  for (const item of withHashes) {
    if (existing.has(item.content_hash) || seenInBatch.has(item.content_hash)) {
      duplicates.push(item);
    } else {
      seenInBatch.add(item.content_hash);
      newRecords.push(item);
    }
  }
  return { newRecords, duplicates };
}

export async function ingestTeacherDatasetBatch(db, { batchId, records, source = 'gpt_cto', now = () => new Date().toISOString() } = {}) {
  if (!batchId) throw new Error('BATCH_ID_REQUIRED');
  if (!db) throw new Error('DB_REQUIRED');

  const { valid, errors: invalidRecords } = validateTeacherDatasetBatch(records);
  const { newRecords, duplicates } = await diffAgainstExisting(db, valid);
  const timestamp = now();

  for (const { record, content_hash } of newRecords) {
    await db.prepare(`INSERT INTO teacher_queries (
      entry_id, content_hash, query_text, locale, persona, user_intent, ideal_answer, reason, category,
      search_terms_ja, search_terms_en, search_terms_ko, search_terms_zh, excluded_conditions, confidence,
      source, status, batch_id, authored_date, authored_updated_date, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      entryIdFor(content_hash), content_hash, record.query_text, record.locale, record.persona,
      record.user_intent, record.ideal_answer, record.reason, record.category,
      JSON.stringify(record.search_terms?.ja || []),
      JSON.stringify(record.search_terms?.en || []),
      JSON.stringify(record.search_terms?.ko || []),
      JSON.stringify(record.search_terms?.zh || []),
      JSON.stringify(record.excluded_conditions || []),
      record.confidence,
      source, 'PENDING', batchId, record.authored_date, record.authored_updated_date, timestamp, timestamp
    ).run();
  }

  const validationId = `tv_${batchId}`;
  await db.prepare(`INSERT INTO teacher_validation (
    validation_id, batch_id, batch_source, validated_at, total_records, new_records,
    duplicate_records_skipped, invalid_records_skipped, regression_test_status, applied, created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    validationId, batchId, source, timestamp,
    Array.isArray(records) ? records.length : 0, newRecords.length, duplicates.length, invalidRecords.length,
    'NOT_RUN', 0, timestamp
  ).run();

  return {
    batchId,
    validationId,
    totalRecords: Array.isArray(records) ? records.length : 0,
    inserted: newRecords.length,
    duplicatesSkipped: duplicates.length,
    invalidSkipped: invalidRecords.length,
    invalidDetails: invalidRecords
  };
}

export async function recordRegressionResult(db, batchId, { status, summary = null, now = () => new Date().toISOString() } = {}) {
  if (!['PASS','FAIL'].includes(status)) throw new Error('REGRESSION_STATUS_INVALID');
  await db.prepare(
    `UPDATE teacher_validation SET regression_test_status = ?, regression_test_summary = ? WHERE batch_id = ?`
  ).bind(status, summary, batchId).run();

  if (status === 'PASS') {
    await db.prepare(
      `UPDATE teacher_queries SET status = 'ACTIVE', updated_at = ? WHERE batch_id = ? AND status = 'PENDING'`
    ).bind(now(), batchId).run();
    await db.prepare(
      `UPDATE teacher_validation SET applied = 1 WHERE batch_id = ?`
    ).bind(batchId).run();
  }
}
