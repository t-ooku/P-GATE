import { readFile } from 'node:fs/promises';
import { buildSocialWeeklyReport } from '../src/social-weekly-report.mjs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/report-social-weekly.mjs <weekly-snapshots.json>');
  process.exitCode = 1;
} else {
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const report = buildSocialWeeklyReport(input.current || [], input.previous || []);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
