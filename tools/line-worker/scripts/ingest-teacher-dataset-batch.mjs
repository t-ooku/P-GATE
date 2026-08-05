import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { validateTeacherDatasetBatch, contentHashFor } from '../src/search-quality/teacher-dataset-ingest.mjs';

function usage() {
  console.error('Usage: node scripts/ingest-teacher-dataset-batch.mjs <path-to-batch.json> <batch-id>');
  console.error('Generates a local, idempotent SQL file for later `wrangler d1 execute --file=...`.');
  console.error('This script never contacts Cloudflare. It only reads the JSON file and writes local output files.');
}

function sqlString(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function entryIdFor(contentHash) {
  return `tq_${contentHash.slice(0, 16)}`;
}

function insertStatement(record, contentHash, batchId, source, timestamp) {
  const columns = [
    'entry_id','content_hash','query_text','locale','persona','user_intent','ideal_answer','reason','category',
    'search_terms_ja','search_terms_en','search_terms_ko','search_terms_zh','excluded_conditions','confidence',
    'source','status','batch_id','authored_date','authored_updated_date','created_at','updated_at'
  ];
  const values = [
    sqlString(entryIdFor(contentHash)),
    sqlString(contentHash),
    sqlString(record.query_text),
    sqlString(record.locale),
    sqlString(record.persona),
    sqlString(record.user_intent),
    sqlString(record.ideal_answer),
    sqlString(record.reason),
    sqlString(record.category),
    sqlString(JSON.stringify(record.search_terms?.ja || [])),
    sqlString(JSON.stringify(record.search_terms?.en || [])),
    sqlString(JSON.stringify(record.search_terms?.ko || [])),
    sqlString(JSON.stringify(record.search_terms?.zh || [])),
    sqlString(JSON.stringify(record.excluded_conditions || [])),
    Number(record.confidence),
    sqlString(source),
    "'PENDING'",
    sqlString(batchId),
    sqlString(record.authored_date),
    sqlString(record.authored_updated_date),
    sqlString(timestamp),
    sqlString(timestamp)
  ];
  return `INSERT OR IGNORE INTO teacher_queries (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

async function main() {
  const [, , batchPathArg, batchIdArg] = process.argv;
  if (!batchPathArg || !batchIdArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const batchPath = resolve(batchPathArg);
  const raw = await readFile(batchPath, 'utf8');
  const records = JSON.parse(raw);

  const { valid, errors } = validateTeacherDatasetBatch(records);
  if (errors.length) {
    console.error(`invalid records skipped: ${errors.length}`);
    for (const item of errors) console.error(`  ${JSON.stringify(item)}`);
  }

  const timestamp = new Date().toISOString();
  const withHashes = await Promise.all(valid.map(async (record) => ({ record, content_hash: await contentHashFor(record) })));

  const seen = new Set();
  const deduped = [];
  let withinBatchDuplicates = 0;
  for (const item of withHashes) {
    if (seen.has(item.content_hash)) { withinBatchDuplicates += 1; continue; }
    seen.add(item.content_hash);
    deduped.push(item);
  }

  const statements = deduped.map(({ record, content_hash }) => insertStatement(record, content_hash, batchIdArg, 'gpt_cto', timestamp));
  const validationStatement = `INSERT OR IGNORE INTO teacher_validation (
  validation_id, batch_id, batch_source, validated_at, total_records, new_records,
  duplicate_records_skipped, invalid_records_skipped, regression_test_status, applied, created_at
) VALUES (${[
    sqlString(`tv_${batchIdArg}`), sqlString(batchIdArg), "'gpt_cto'", sqlString(timestamp),
    Array.isArray(records) ? records.length : 0, deduped.length, withinBatchDuplicates, errors.length,
    "'NOT_RUN'", 0, sqlString(timestamp)
  ].join(', ')});`;

  const outDir = dirname(batchPath);
  const outBase = basename(batchPath, '.json');
  const sqlPath = resolve(outDir, `${outBase}.generated.sql`);
  const reportPath = resolve(outDir, `${outBase}.report.json`);

  await writeFile(sqlPath, [...statements, validationStatement].join('\n') + '\n', 'utf8');

  const report = {
    batchId: batchIdArg,
    sourceFile: batchPath,
    generatedAt: timestamp,
    totalRecords: Array.isArray(records) ? records.length : 0,
    validRecords: valid.length,
    invalidRecords: errors.length,
    withinBatchDuplicates,
    sqlStatementsGenerated: statements.length,
    invalidDetails: errors,
    note: 'This report reflects local validation and within-batch dedup only. Duplicate detection against records already stored in Cloudflare D1 happens at apply time via INSERT OR IGNORE (content_hash UNIQUE). No network calls were made.'
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`generated: ${sqlPath}`);
  console.log(`report:    ${reportPath}`);
  console.log(`valid=${valid.length} invalid=${errors.length} within-batch-duplicates=${withinBatchDuplicates} sql-statements=${statements.length}`);
  console.log('Cloudflare was not contacted. Apply the generated SQL manually with `wrangler d1 execute PRODUCT_DB --remote --file=...` after explicit approval.');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
