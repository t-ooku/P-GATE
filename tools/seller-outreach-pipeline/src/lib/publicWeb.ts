import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { createRequire } from 'node:module';
import ipaddr from 'ipaddr.js';

const robotsParser = createRequire(import.meta.url)('robots-parser') as
  (url: string, content: string) => { isAllowed: (url: string, agent: string) => boolean | undefined };

export const AGENT = 'HOSHILU-SellerResearch/0.1 (+https://hoshilu.app/for-sellers)';

export async function publicAddress(raw: string): Promise<{ url: URL; address: string; family: number }> {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('PUBLIC_HTTPS_REQUIRED');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(host) || !host.includes('.') || host.endsWith('.local')) {
    throw new Error('PUBLIC_HOSTNAME_REQUIRED');
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(a => ipaddr.process(a.address).range() !== 'unicast')) {
    throw new Error('PRIVATE_OR_RESERVED_ADDRESS');
  }
  return { url, ...addresses[0] };
}

/** TLS hostname is preserved; DNS is resolved and pinned for each redirect. */
export async function fetchPublic(raw: string, redirects = 0): Promise<{ url: string; text: string; status: number }> {
  if (redirects > 3) throw new Error('TOO_MANY_REDIRECTS');
  const { url, address, family } = await publicAddress(raw);
  const response = await new Promise<{ status: number; location?: string; text: string }>((resolve, reject) => {
    const req = request(url, { headers: { 'user-agent': AGENT, accept: 'text/html,text/plain' },
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      }
    }, res => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2_000_000) res.destroy(new Error('RESPONSE_TOO_LARGE'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode ?? 0,
        location: res.headers.location, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(15000, () => req.destroy(new Error('REQUEST_TIMEOUT')));
    req.on('error', reject); req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
    const next = new URL(response.location, url);
    if (next.origin !== url.origin) throw new Error('CROSS_ORIGIN_REDIRECT_REQUIRES_REVIEW');
    return fetchPublic(next.href, redirects + 1);
  }
  return { url: url.href, text: response.text, status: response.status };
}

export async function assertRobotsAllowed(raw: string): Promise<void> {
  const url = new URL(raw);
  const robots = await fetchPublic(new URL('/robots.txt', url).href);
  if (robots.status === 404) return;
  if (robots.status !== 200 || robotsParser(new URL('/robots.txt', url).href, robots.text)
    .isAllowed(url.href, AGENT) === false) throw new Error('ROBOTS_NOT_ALLOWED_OR_UNAVAILABLE');
}
