import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const worker = resolve(root, 'tools', 'line-worker');
const sqlFile = resolve(root, process.argv[2] || 'benchmarks/itg-gold-candidate-search.sql');
const outputFile = resolve(root, process.argv[3] || 'benchmarks/itg-gold-candidates.json');
const npxCli = resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const statements = readFileSync(sqlFile, 'utf8')
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const collected = [];
for (const [index, statement] of statements.entries()) {
  const output = execFileSync(process.execPath, [npxCli,
    '--yes', 'wrangler@4.113.0', 'd1', 'execute', 'hoshilu-products',
    '--remote', '--config', 'wrangler.jsonc', '--command', statement, '--json'
  ], { cwd: worker, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const parsed = JSON.parse(output.slice(output.indexOf('[')));
  const rows = parsed.flatMap((entry) => entry.results || []);
  collected.push({ seed: rows[0]?.seed || `seed-${index + 1}`, rows });
  process.stdout.write(`${index + 1}/${statements.length} ${rows[0]?.seed || 'no result'}: ${rows.length}\n`);
}

writeFileSync(outputFile, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  tenant: 'itg',
  source: 'hoshilu-products D1',
  candidates: collected
}, null, 2)}\n`, 'utf8');
console.log(outputFile);
