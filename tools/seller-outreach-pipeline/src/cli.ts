import { readFile } from 'node:fs/promises';
import { readConfig } from './config.js';
import { runJobs, type Job } from './pipeline.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const config = readConfig(process.env, args);
  const file = args.find(arg => !arg.startsWith('--'));
  if (!file) throw new Error('JOB_FILE_REQUIRED');
  const input = JSON.parse(await readFile(file, 'utf8')) as Job | Job[];
  await runJobs(Array.isArray(input) ? input : [input], config);
}

main().catch(() => {
  console.error(JSON.stringify({ status: 'FAILED', reason: 'CONFIG_OR_JOB_FILE_INVALID' }));
  process.exitCode = 1;
});
