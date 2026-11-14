import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeSearchDecision } from './line-worker/src/search-intelligence.mjs';

const root = resolve(import.meta.dirname, '..');
const inputLabel = String(process.argv[2] || 'improved').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
const outputLabel = String(process.argv[3] || `${inputLabel}-policy`).replace(/[^a-z0-9_-]/gi, '').toLowerCase();
const input = JSON.parse(readFileSync(resolve(root, 'benchmarks', 'results', `itg-gold-${inputLabel}.json`), 'utf8'));
const evaluations = input.evaluations.map((item) => {
  const decision = analyzeSearchDecision(item.query, item.results);
  return {
    ...item,
    asserted_answer: !decision.needs_clarification,
    clarification_required: decision.needs_clarification,
    clarification_question: decision.clarification_question,
    mywish_suggested: decision.offer_mywish,
    decision_reason: decision.reason,
    wrong_answer: !decision.needs_clarification && item.results.length > 0 && !item.top3
  };
});
const average = (items, key) => items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : 0;
const metrics = (items) => ({
  cases: items.length,
  top1: average(items, 'top1'),
  top3: average(items, 'top3'),
  category_match: average(items, 'category_match'),
  mrr: average(items, 'reciprocal_rank'),
  ndcg_at_3: average(items, 'ndcg_at_3'),
  no_answer_rate: average(items, 'no_answer'),
  wrong_answer_rate: average(items, 'wrong_answer'),
  clarification_rate: average(items, 'clarification_required'),
  mywish_offer_rate: average(items, 'mywish_suggested'),
  safe_response_rate: items.length ? items.filter((item) => item.top3 || item.clarification_required).length / items.length : 0
});
const levels = ['rich','ambiguous','ultra_ambiguous'];
const types = [...new Set(evaluations.flatMap((item) => item.query_types))].sort();
const output = {
  ...input,
  label: outputLabel,
  generated_at: new Date().toISOString(),
  overall: metrics(evaluations),
  by_information_level: Object.fromEntries(levels.map((level) => [level, metrics(evaluations.filter((item) => item.information_level === level))])),
  by_query_type: Object.fromEntries(types.map((type) => [type, metrics(evaluations.filter((item) => item.query_types.includes(type)))])),
  evaluations
};
const jsonPath = resolve(root, 'benchmarks', 'results', `itg-gold-${outputLabel}.json`);
writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const rows = [
  ['Top-1', pct(output.overall.top1)],
  ['Top-3', pct(output.overall.top3)],
  ['カテゴリ一致', pct(output.overall.category_match)],
  ['MRR', output.overall.mrr.toFixed(3)],
  ['nDCG@3', output.overall.ndcg_at_3.toFixed(3)],
  ['無回答率', pct(output.overall.no_answer_rate)],
  ['誤答率（断定した回答のみ）', pct(output.overall.wrong_answer_rate)],
  ['聞き返し率', pct(output.overall.clarification_rate)],
  ['MYWISH提案率', pct(output.overall.mywish_offer_rate)],
  ['安全応答率', pct(output.overall.safe_response_rate)]
];
const markdown = [
  `# HOSHILU ITG曖昧検索評価 — ${outputLabel}`,
  '',
  '安全応答は「Top-3内に正解」または「断定せず最小1問を聞き返した」ケースです。',
  '',
  '| 指標 | 値 |',
  '|---|---:|',
  ...rows.map(([name, value]) => `| ${name} | ${value} |`),
  '',
  '## 情報量別',
  '',
  ...Object.entries(output.by_information_level).map(([name, value]) => `- ${name}: Top-3 ${pct(value.top3)} / 誤答 ${pct(value.wrong_answer_rate)} / 聞き返し ${pct(value.clarification_rate)} / 安全応答 ${pct(value.safe_response_rate)}`),
  '',
  '## クエリタイプ別',
  '',
  ...Object.entries(output.by_query_type).map(([name, value]) => `- ${name}: Top-3 ${pct(value.top3)} / 誤答 ${pct(value.wrong_answer_rate)} / 聞き返し ${pct(value.clarification_rate)} / 安全応答 ${pct(value.safe_response_rate)}`)
].join('\n');
const markdownPath = resolve(root, 'docs', `HOSHILU_SEARCH_EVALUATION_${outputLabel.toUpperCase()}.md`);
writeFileSync(markdownPath, `${markdown}\n`, 'utf8');
console.log(JSON.stringify({ jsonPath, markdownPath, overall: output.overall }, null, 2));
