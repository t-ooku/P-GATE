// 2026-09-05 大隆さん指示: 「底開口 水筒」型（利用者の機能語 ≠ 売り手の語）のケースを大量に
// 用意し、教師データとして残す。src/query-expansion-feature-rules.mjs の teacher 情報から
// evaluation/teacher-dataset のバッチ JSON を生成する（規則と教師データを1つの元から作り、
// ずれないようにする）。
//
// 使い方: node scripts/build-feature-teacher-batch.mjs 2026-09-05 019
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_EXPANSION_RULES } from '../src/query-expansion-feature-rules.mjs';
import { validateTeacherDatasetBatch } from '../src/search-quality/teacher-dataset-ingest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const serial = String(process.argv[3] || '019').padStart(3, '0');

export function buildFeatureTeacherEntries(rules = FEATURE_EXPANSION_RULES, authoredDate = date) {
  const entries = [];
  for (const rule of rules) {
    const teacher = rule.teacher || {};
    for (const query of teacher.queries || []) {
      entries.push({
        query_text: query,
        locale: 'ja',
        persona: 'general',
        user_intent: teacher.intent,
        ideal_answer: teacher.ideal,
        reason: `${teacher.reason} 展開規則 ${rule.id}（モール検索語「${rule.marketplaceKeywords}」）。`,
        category: teacher.category || rule.id,
        search_terms: {
          ja: [...new Set([rule.marketplaceKeywords, ...(rule.synonyms || []).slice(0, 2)])],
          en: [], ko: [], zh: []
        },
        excluded_conditions: [],
        confidence: 0.75,
        authored_date: authoredDate,
        authored_updated_date: authoredDate
      });
    }
  }
  return entries;
}

async function main() {
  const entries = buildFeatureTeacherEntries();
  const { errors } = validateTeacherDatasetBatch(entries);
  if (errors.length) {
    console.error(JSON.stringify(errors, null, 2));
    process.exit(1);
  }
  const output = resolve(__dirname, '..', 'evaluation', 'teacher-dataset', `${date}-claude-batch-${serial}.json`);
  await writeFile(output, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`${output}: ${entries.length} entries from ${FEATURE_EXPANSION_RULES.length} rules`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
