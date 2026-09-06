import { readFile } from 'node:fs/promises';
import { buildCampaignUrl } from './line-worker/public/campaign-attribution.mjs';

export function parseQueueCsv(text) {
  const [header, ...lines] = String(text).trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.filter(Boolean).map((line) => {
    const values = line.match(/(".*?"|[^,]*)(?:,|$)/g)
      .map((value) => value.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    return Object.fromEntries(keys.map((key, index) => [key, values[index] || '']));
  });
}

export function campaignRows(rows, base = 'https://hoshilu.app/') {
  return rows.map((row) => ({
    ...row,
    landing_url: buildCampaignUrl(base, {
      query: row.prefill_query,
      campaign: row.campaign_id,
      source: row.channel.toLowerCase(),
      content: row.content_id
    })
  }));
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  const queuePath = new URL('../marketing/social/HOSHILU_14_DAY_EXECUTION_QUEUE.csv', import.meta.url);
  const rows = campaignRows(parseQueueCsv(await readFile(queuePath, 'utf8')));
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}
