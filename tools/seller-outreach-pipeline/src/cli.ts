import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scrapeSeller } from './crawler/sellerScraper.js';
import { matchDemand } from './services/demandMatcher.js';
import { generatePitch, geminiQuoteSelector } from './services/pitchGenerator.js';
import { submitContactForm, type SubmitOptions } from './workers/formSubmitter.js';
import { storeKey } from './lib/ledger.js';
import type { DemandRecord, SenderInfo } from './types/index.js';

interface Job {
  storeUrl: string;
  sender: SenderInfo;
  demands: DemandRecord[];
  submit: Omit<SubmitOptions, 'mode' | 'ledgerPath' | 'screenshotDir'>;
}
const file = process.argv[2];
if (!file) throw new Error('Usage: npm start -- job.json [--send]');
const job = JSON.parse(await readFile(file, 'utf8')) as Job;
const seller = await scrapeSeller(job.storeUrl);
const match = matchDemand(seller, job.demands);
if (!match) {
  console.log(JSON.stringify({ status: 'SKIPPED', reason: 'NO_SUPPORTED_DEMAND_MATCH' }));
} else {
  const quoteSelector = geminiQuoteSelector(process.env.GEMINI_API_KEY ?? '', process.env.GEMINI_MODEL ?? '');
  const pitch = await generatePitch(seller, match, job.sender, quoteSelector);
  const directory = join('data', storeKey(seller.storeUrl));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'draft.json'), JSON.stringify({ seller, pitch }, null, 2), { mode: 0o600 });
  const result = await submitContactForm(seller, pitch, job.sender, {
    ...job.submit, mode: process.argv.includes('--send') ? 'send' : 'preview',
    ledgerPath: 'data/submissions.db', screenshotDir: 'artifacts'
  });
  // Do not put form content, email, query keywords, or target URLs in logs.
  console.log(JSON.stringify({ storeKey: storeKey(seller.storeUrl), ...result }));
}
