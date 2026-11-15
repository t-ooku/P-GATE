// Read-only evaluator: takes one local snapshot packet, prints counts only.
import { readFile } from 'node:fs/promises';
import { evaluateCosmeticsCoverage } from '../src/cheapest-coverage-evaluation.mjs';

try {
  if (process.argv.length !== 3) throw Error('usage: node tools/line-worker/scripts/measure-cheapest-coverage.mjs <packet.json>');
  const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
  process.stdout.write(`${JSON.stringify(evaluateCosmeticsCoverage(input), null, 2)}\n`);
} catch {
  // Do not echo file paths, raw JSON, tokens, or products on parse failure.
  console.error('Invalid coverage packet. See docs/eval/cosmetics-cheapest-v1.md.');
  process.exitCode = 1;
}
