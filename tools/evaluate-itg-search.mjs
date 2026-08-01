import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { intelligentFtsQuery as ftsQuery } from './line-worker/src/product-index-v2.mjs';
import { analyzeSearchDecision } from './line-worker/src/search-intelligence.mjs';

const root = resolve(import.meta.dirname, '..');
const worker = resolve(root, 'tools', 'line-worker');
const gold = JSON.parse(readFileSync(resolve(root, 'benchmarks', 'itg-ambiguous-search-gold-v1.json'), 'utf8'));
const label = String(process.argv[2] || 'current').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
const multilingualOnly = process.argv.includes('--multilingual');
const npxCli = resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const cases = gold.targets
  .flatMap((target) => target.variants.map((variant) => ({ target, variant, match: ftsQuery(variant.query) })))
  .filter((item) => !multilingualOnly || item.variant.locale !== 'ja');

function sqlText(item) {
  const literal = (value) => String(value).replaceAll("'", "''");
  return `SELECT '${literal(item.variant.case_id)}' AS case_id,p.asin,p.product_name,p.manufacturer,p.stock,bm25(product_search,10.0,4.0,2.0) AS text_rank
    FROM product_search JOIN products p ON p.rowid=product_search.rowid
    WHERE product_search MATCH '${literal(item.match)}' AND p.tenant='itg'
    ORDER BY text_rank ASC,p.stock DESC LIMIT 10`;
}

const resultMap = new Map();
const searchable = cases.filter((item) => item.match);
const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function executeD1(sql, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return execFileSync(process.execPath, [npxCli,
        '--yes', 'wrangler@4.113.0', 'd1', 'execute', 'hoshilu-products',
        '--remote', '--config', 'wrangler.jsonc',
        '--command', sql.replace(/\s+/g, ' '), '--json'
      ], { cwd: worker, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(750 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

for (let offset = 0; offset < searchable.length; offset += 1) {
  const batch = searchable.slice(offset, offset + 1);
  const output = await executeD1(sqlText(batch[0]));
  const parsed = JSON.parse(output.slice(output.indexOf('[')));
  const rows = parsed[0]?.results || [];
  batch.forEach((item) => resultMap.set(item.variant.case_id, rows.filter((row) => row.case_id === item.variant.case_id)));
  process.stdout.write(`${Math.min(offset + batch.length, searchable.length)}/${searchable.length}\n`);
}

function lexicalCategoryMatch(target, row) {
  const text = `${row?.product_name || ''} ${row?.manufacturer || ''}`.normalize('NFKC').toLowerCase();
  return target.synonyms.some((synonym) => {
    const normalized = synonym.normalize('NFKC').toLowerCase();
    if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(normalized)) return normalized.length >= 2 && text.includes(normalized);
    const words = normalized.match(/[a-z0-9]+/g) || [];
    return words.length > 0 && words.every((word) => word.length < 3 || text.includes(word));
  });
}

const evaluations = cases.map(({ target, variant, match }) => {
  const results = resultMap.get(variant.case_id) || [];
  const decision = analyzeSearchDecision(variant.query, results.slice(0, 3));
  const correct = new Set(target.correct_asins);
  const rankIndex = results.findIndex((row) => correct.has(row.asin));
  const rank = rankIndex < 0 ? 0 : rankIndex + 1;
  return {
    case_id: variant.case_id,
    target_id: target.target_id,
    locale: variant.locale || 'ja',
    information_level: variant.information_level,
    query_types: variant.query_types,
    query: variant.query,
    expected_asins: target.correct_asins,
    fts_query: match,
    rank,
    top1: rank === 1,
    top3: rank > 0 && rank <= 3,
    top10: rank > 0 && rank <= 10,
    reciprocal_rank: rank ? 1 / rank : 0,
    ndcg_at_3: rank > 0 && rank <= 3 ? 1 / Math.log2(rank + 1) : 0,
    ndcg_at_10: rank > 0 && rank <= 10 ? 1 / Math.log2(rank + 1) : 0,
    category_match: results.slice(0, 3).some((row) => lexicalCategoryMatch(target, row)),
    no_answer: results.length === 0,
    asserted_answer: !decision.needs_clarification,
    clarification_required: decision.needs_clarification,
    mywish_suggested: decision.offer_mywish,
    decision_reason: decision.reason,
    wrong_answer: !decision.needs_clarification && results.length > 0 && !(rank > 0 && rank <= 3),
    results: results.slice(0, 3).map((row) => ({
      asin: row.asin,
      product_name: row.product_name,
      manufacturer: row.manufacturer,
      text_rank: row.text_rank
    }))
  };
});

const average = (items, key) => items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : 0;
function metrics(items) {
  return {
    cases: items.length,
    top1: average(items, 'top1'),
    top3: average(items, 'top3'),
    top10: average(items, 'top10'),
    category_match: average(items, 'category_match'),
    mrr: average(items, 'reciprocal_rank'),
    ndcg_at_3: average(items, 'ndcg_at_3'),
    ndcg_at_10: average(items, 'ndcg_at_10'),
    no_answer_rate: average(items, 'no_answer'),
    wrong_answer_rate: average(items, 'wrong_answer'),
    clarification_rate: average(items, 'clarification_required'),
    mywish_offer_rate: average(items, 'mywish_suggested'),
    safe_response_rate: items.length ? items.filter((item) => item.top3 || item.clarification_required).length / items.length : 0
  };
}
const byInformationLevel = Object.fromEntries(['rich','ambiguous','ultra_ambiguous'].map((level) => [level, metrics(evaluations.filter((item) => item.information_level === level))]));
const locales = ['ja','en','zh','ko'];
const byLocale = Object.fromEntries(locales.map((locale) => [locale, metrics(evaluations.filter((item) => item.locale === locale))]));
const queryTypes = [...new Set(evaluations.flatMap((item) => item.query_types))].sort();
const byQueryType = Object.fromEntries(queryTypes.map((type) => [type, metrics(evaluations.filter((item) => item.query_types.includes(type)))]));
const report = {
  schema_version: '1.0',
  label,
  generated_at: new Date().toISOString(),
  dataset: { targets: gold.targets.length, cases: evaluations.length, tenant: 'itg' },
  overall: metrics(evaluations),
  by_locale: byLocale,
  by_information_level: byInformationLevel,
  by_query_type: byQueryType,
  evaluations
};

const resultsDir = resolve(root, 'benchmarks', 'results');
mkdirSync(resultsDir, { recursive: true });
const jsonPath = resolve(resultsDir, `itg-gold-${label}.json`);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const metricRow = (name, value) => `| ${name} | ${value.cases} | ${pct(value.top1)} | ${pct(value.top3)} | ${pct(value.top10)} | ${pct(value.category_match)} | ${value.mrr.toFixed(3)} | ${value.ndcg_at_3.toFixed(3)} | ${value.ndcg_at_10.toFixed(3)} | ${pct(value.no_answer_rate)} | ${pct(value.wrong_answer_rate)} |`;
const markdown = [
  `# HOSHILU ITG曖昧検索評価 — ${label}`,
  '',
  `生成日時: ${report.generated_at}`,
  '',
  '| 区分 | 件数 | Top-1 | Top-3 | Top-10 | カテゴリ一致 | MRR | nDCG@3 | nDCG@10 | 無回答率 | 誤答率 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  metricRow('全体', report.overall),
  '',
  ...Object.entries(byLocale).map(([name, value]) => metricRow(`言語:${name}`, value)),
  '',
  '',
  ...Object.entries(byInformationLevel).map(([name, value]) => metricRow(`情報量:${name}`, value)),
  ...Object.entries(byQueryType).map(([name, value]) => metricRow(`タイプ:${name}`, value)),
  '',
  '## ケース別結果',
  '',
  ...evaluations.flatMap((item) => [
    `### ${item.case_id} ${item.top3 ? '✅' : item.no_answer ? '—' : '❌'}`,
    '',
    `- クエリ: ${item.query}`,
    `- 正解ASIN: ${item.expected_asins.join(', ')}`,
    `- 順位: ${item.rank || '圏外/無回答'}`,
    `- 上位候補: ${item.results.map((row) => `${row.asin} ${row.product_name}`).join(' / ') || 'なし'}`,
    ''
  ])
].join('\n');
const markdownPath = resolve(root, 'docs', `HOSHILU_SEARCH_EVALUATION_${label.toUpperCase()}.md`);
writeFileSync(markdownPath, `${markdown}\n`, 'utf8');
console.log(JSON.stringify({ json: jsonPath, markdown: markdownPath, overall: report.overall }, null, 2));
