import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTeacherDatasetBatch, contentHashFor } from '../src/search-quality/teacher-dataset-ingest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Compiles committed teacher-dataset batch JSON files into a single,
// synchronously importable artifact that the live search pipeline reads
// (query-structurer.mjs / knowledge-search.mjs / marketplace keyword
// builders). This exists because those modules run inside a Cloudflare
// Worker request path where the fastest, lowest-risk connection to D1-authored
// data is a build-time compiled JSON import - identical in shape to how
// canonical-attributes.json / product-types.json are already consumed - not
// a live D1 round-trip per search request. D1 (migrations/0033) remains the
// source of truth for future GPT-authored batches; this script is what turns
// a committed batch into something the search code can actually act on.
//
// Only files matching *-batch-*.json are treated as real teacher-dataset
// batches. format-example-batch.json is a format sample, not real data, and
// is intentionally excluded. So are the *.report.json files that
// ingest-teacher-dataset-batch.mjs writes next to each batch: their names
// also end in -batch-NNN.report.json, so without the exclusion they were
// read as batches and reported as "3 invalid records" on every compile -
// noise that would eventually hide a real validation failure.

const DATASET_DIR = resolve(__dirname, '..', 'evaluation', 'teacher-dataset');
const OUTPUT_PATH = resolve(__dirname, '..', 'src', 'search-quality', 'teacher-dataset-rules.generated.json');

async function loadBatchFiles() {
  const entries = await readdir(DATASET_DIR).catch(() => []);
  return entries
    .filter((name) => /-batch-.*\.json$/u.test(name) && !/\.report\.json$/u.test(name))
    .sort();
}

async function main() {
  const files = await loadBatchFiles();
  const seenHashes = new Set();
  const entries = [];
  const skipped = [];

  for (const file of files) {
    const path = resolve(DATASET_DIR, file);
    const raw = await readFile(path, 'utf8');
    const records = JSON.parse(raw);
    const { valid, errors } = validateTeacherDatasetBatch(records);
    for (const item of errors) skipped.push({ file, ...item });
    for (const record of valid) {
      const contentHash = await contentHashFor(record);
      if (seenHashes.has(contentHash)) continue;
      seenHashes.add(contentHash);
      entries.push({
        content_hash: contentHash,
        query_text: record.query_text,
        locale: record.locale,
        persona: record.persona,
        category: record.category,
        ideal_answer: record.ideal_answer,
        search_terms: record.search_terms || {},
        excluded_conditions: record.excluded_conditions || [],
        confidence: record.confidence,
        source_file: file
      });
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    source_batches: files,
    entry_count: entries.length,
    entries
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`compiled ${entries.length} teacher-dataset entries from ${files.length} batch file(s) -> ${OUTPUT_PATH}`);
  if (skipped.length) console.warn(`skipped ${skipped.length} invalid record(s):`, JSON.stringify(skipped));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
