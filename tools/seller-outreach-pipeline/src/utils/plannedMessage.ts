import { appendFile, chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Pitch, SellerInfo } from '../types/index.js';

/** Full planned content is intentional in dry-run logs; secrets are never included. */
export async function logPlannedMessage(seller: SellerInfo, pitch: Pitch, path: string,
  output: (line: string) => void = console.log): Promise<void> {
  const line = JSON.stringify({ status: 'DRY_RUN', at: new Date().toISOString(),
    recipient: { store: seller.name, formUrl: seller.contactFormUrl, email: seller.email },
    subject: pitch.subject, body: pitch.body });
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, line + '\n', { mode: 0o600 });
  await chmod(path, 0o600);
  output(line);
}
