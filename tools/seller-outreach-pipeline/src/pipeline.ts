import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scrapeSeller } from './crawler/sellerScraper.js';
import { matchDemand } from './services/demandMatcher.js';
import { generatePitch, geminiQuoteSelector } from './services/pitchGenerator.js';
import { submitContactForm, type SubmitOptions } from './workers/formSubmitter.js';
import { storeKey } from './lib/ledger.js';
import type { RuntimeConfig } from './config.js';
import type { DemandRecord, SenderInfo, SellerInfo, Pitch, DemandMatchResult } from './types/index.js';

export interface Job {
  storeUrl: string;
  sender: SenderInfo;
  demands: DemandRecord[];
  submit: Omit<SubmitOptions, 'mode' | 'ledgerPath' | 'screenshotDir' | 'dryRun' | 'plannedLogPath'>;
}
interface Dependencies {
  scrape: typeof scrapeSeller;
  match: typeof matchDemand;
  generate: (seller: SellerInfo, match: DemandMatchResult, sender: SenderInfo) => Promise<Pitch>;
  submit: typeof submitContactForm;
  save: (seller: SellerInfo, pitch: Pitch) => Promise<void>;
  output: (line: string) => void;
}
const defaults: Dependencies = {
  scrape: scrapeSeller, match: matchDemand, submit: submitContactForm,
  generate: (seller, match, sender) => generatePitch(seller, match, sender,
    geminiQuoteSelector(process.env.GEMINI_API_KEY ?? '', process.env.GEMINI_MODEL ?? '')),
  save: async (seller, pitch) => {
    const directory = join('data', storeKey(seller.storeUrl));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, 'draft.json'), JSON.stringify({ seller, pitch }, null, 2), { mode: 0o600 });
  },
  output: console.log
};

/** Sequential jobs share the request limiter. One blocked/error store cannot stop the next. */
export async function runJobs(jobs: Job[], config: RuntimeConfig,
  overrides: Partial<Dependencies> = {}): Promise<void> {
  const deps = { ...defaults, ...overrides };
  for (const job of jobs) {
    try {
      const seller = await deps.scrape(job.storeUrl);
      const match = deps.match(seller, job.demands);
      if (!match) {
        deps.output(JSON.stringify({ storeKey: storeKey(job.storeUrl), status: 'SKIPPED', reason: 'NO_SUPPORTED_DEMAND_MATCH' }));
        continue;
      }
      const pitch = await deps.generate(seller, match, job.sender);
      await deps.save(seller, pitch);
      const result = await deps.submit(seller, pitch, job.sender, {
        ...job.submit, mode: config.dryRun ? 'preview' : 'send', dryRun: config.dryRun,
        plannedLogPath: config.plannedLogPath, ledgerPath: config.ledgerPath, screenshotDir: config.blockedDir
      });
      deps.output(JSON.stringify({ storeKey: storeKey(job.storeUrl), ...result }));
    } catch {
      deps.output(JSON.stringify({ status: 'SKIPPED', reason: 'STORE_ERROR_CONTINUING_BATCH' }));
    }
  }
}
