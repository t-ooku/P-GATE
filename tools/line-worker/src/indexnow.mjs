// 2026-09-27 大隆さん「成功のためにやれることやって」。流入の実数（9/21〜9/27）は bing organic 10・chatgpt.com 4・google organic 5 セッション。
// Bing（ChatGPT の検索も Bing の索引を使う）に新しい・更新したページを早く知らせるため IndexNow で URL を送る。
// 送るのは sitemap.xml に載っている hoshilu.app の URL だけ。1日1回（JST 4時台の最初の定期実行）、
// ふだんは lastmod が3日以内のページと主要ページ、月曜は sitemap の全 URL。失敗しても他のジョブは止めない。
// 鍵ファイルは public/<鍵>.txt（IndexNow の仕様どおり、鍵と同じ名前のファイルに鍵そのものを置く）。
export const INDEXNOW_KEY = '9af18859d367bcd5133a88b9d06f8ea2';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'hoshilu.app';
const CORE_PATHS = ['/', '/for-sellers', '/buzz', '/ja/guides'];
const DAY_MS = 86_400_000;

function jst(now) {
  return new Date(now.getTime() + 9 * 3600_000);
}

// 定期実行（15分ごと）のうち、JST 4:00〜4:14 の1回だけ動く。
export function indexNowDue(now = new Date()) {
  const t = jst(now);
  return t.getUTCHours() === 4 && t.getUTCMinutes() < 15;
}

export function sitemapEntries(xml) {
  const entries = [];
  for (const block of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/gu)) {
    const loc = block[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/u)?.[1] || '';
    const lastmod = block[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/u)?.[1] || '';
    let url;
    try { url = new URL(loc); } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname !== HOST) continue;
    entries.push({ loc: url.toString(), lastmod });
  }
  return entries;
}

export function indexNowUrls(entries, now = new Date()) {
  const t = jst(now);
  const monday = t.getUTCDay() === 1;
  const since = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 3 * DAY_MS).toISOString().slice(0, 10);
  const core = new Set(CORE_PATHS.map((path) => new URL(path, `https://${HOST}`).toString()));
  const picked = entries.filter((entry) => monday || core.has(entry.loc) || (entry.lastmod && entry.lastmod.slice(0, 10) >= since));
  const urls = [...new Set([...core, ...picked.map((entry) => entry.loc)])];
  return urls.slice(0, 10_000);
}

export async function runIndexNowSubmission(env, now = new Date(), fetchImpl = fetch) {
  if (!indexNowDue(now)) return { status: 'NOT_DUE' };
  if (String(env?.INDEXNOW_ENABLED || 'true').toLowerCase() === 'false') return { status: 'DISABLED' };
  if (!env?.ASSETS?.fetch) return { status: 'NO_ASSETS' };
  try {
    const sitemap = await env.ASSETS.fetch(new Request(`https://${HOST}/sitemap.xml`));
    if (!sitemap.ok) return { status: 'SITEMAP_UNAVAILABLE' };
    const urls = indexNowUrls(sitemapEntries(await sitemap.text()), now);
    if (!urls.length) return { status: 'NOTHING_TO_SEND' };
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`, urlList: urls }),
      signal: AbortSignal.timeout(10_000)
    });
    // 200/202 は受付。本文にURLや鍵以外の個人情報は無いので、件数と状態だけを残す。
    console.log('INDEXNOW_SUBMITTED', { status: response.status, urls: urls.length });
    return { status: response.ok ? 'SUBMITTED' : 'REJECTED', http: response.status, urls: urls.length };
  } catch (error) {
    console.error('INDEXNOW_FAILED', String(error?.message || error).slice(0, 80));
    return { status: 'FAILED' };
  }
}
