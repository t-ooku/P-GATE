import { chmod, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { codexKpiSnapshotSummary } from '../src/promotion-dashboard.mjs';

const DEFAULT_DATABASE_ID = '17629324-b771-4348-982c-c25da48c29b2';
const MUTATING_SQL = /\b(?:ALTER|ATTACH|CREATE|DELETE|DETACH|DROP|INSERT|PRAGMA|REINDEX|REPLACE|UPDATE|VACUUM)\b/iu;

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

export function assertReadOnlySql(sql) {
  const value = String(sql || '').trim();
  assert(/^(?:SELECT|WITH)\b/iu.test(value), 'CODEX_KPI_SQL_NOT_READ_ONLY');
  assert(!MUTATING_SQL.test(value), 'CODEX_KPI_SQL_NOT_READ_ONLY');
  assert(!value.replace(/;\s*$/u, '').includes(';'), 'CODEX_KPI_SQL_MULTIPLE_STATEMENTS');
  return value;
}

export function createCloudflareReadOnlyD1(options = {}) {
  const accountId = String(options.accountId || '').trim();
  const apiToken = String(options.apiToken || '').trim();
  const databaseId = String(options.databaseId || DEFAULT_DATABASE_ID).trim();
  const fetcher = options.fetcher || fetch;
  assert(accountId, 'CLOUDFLARE_ACCOUNT_ID_MISSING');
  assert(apiToken, 'CLOUDFLARE_API_TOKEN_MISSING');
  assert(databaseId, 'HOSHILU_D1_DATABASE_ID_MISSING');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;

  const execute = async (sql, params = []) => {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
        'user-agent': 'HOSHILU-Codex-KPI-ReadOnly/1.0'
      },
      body: JSON.stringify({ sql: assertReadOnlySql(sql), params }),
      signal: AbortSignal.timeout(15000)
    });
    assert(response?.ok, `CODEX_KPI_D1_HTTP_${Number(response?.status) || 0}`);
    const payload = await response.json();
    const result = Array.isArray(payload?.result) ? payload.result[0] : null;
    assert(payload?.success === true && result?.success !== false, 'CODEX_KPI_D1_QUERY_FAILED');
    return { results: Array.isArray(result?.results) ? result.results : [] };
  };

  const prepare = (sql) => {
    const statement = assertReadOnlySql(sql);
    const bound = (params = []) => ({
      __codexExecute: () => execute(statement, params),
      async all() { return execute(statement, params); },
      async first() { return (await execute(statement, params)).results[0] || null; }
    });
    return {
      ...bound(),
      bind(...params) { return bound(params); }
    };
  };
  return {
    prepare,
    async batch(statements) {
      return Promise.all(statements.map(statement => {
        assert(typeof statement?.__codexExecute === 'function', 'CODEX_KPI_D1_STATEMENT_INVALID');
        return statement.__codexExecute();
      }));
    }
  };
}

function cliValue(argv, name, fallback = '') {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

// Operational totals include internal/test watches. These are diagnostics, not
// evidence of general-user adoption. No member IDs, wish IDs or titles leave D1.
export async function targetPriceDiagnostics(PRODUCT_DB) {
  try {
    const watches = await PRODUCT_DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN COALESCE(json_extract(condition_snapshot,'$.price_condition.target_product_key'),'')<>'' THEN 1 ELSE 0 END),0) AS with_product_key
      FROM member_wishes WHERE watch_price=1
      AND CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)>=100`).first();
    const observations = await PRODUCT_DB.prepare(`SELECT reason,matched,COUNT(*) AS count,
      MIN(price_jpy) AS min_price_jpy,MAX(price_jpy) AS max_price_jpy,MAX(observed_at) AS last_observed_at
      FROM target_price_observations GROUP BY reason,matched`).all();
    const lastCheck = await PRODUCT_DB.prepare(`SELECT MAX(matched_at) AS last_checked_at FROM search_watch_matches
      WHERE product_identity_key='TARGET_PRICE_CHECK'`).first();
    return { status: 'AVAILABLE', includes_internal_tests: true,
      watches: { total: Number(watches.total), with_product_key: Number(watches.with_product_key),
        without_product_key: Number(watches.total)-Number(watches.with_product_key) },
      observations_all: observations.results.map(row => ({ reason: String(row.reason), matched: Number(row.matched), count: Number(row.count),
        min_price_jpy: row.min_price_jpy, max_price_jpy: row.max_price_jpy, last_observed_at: row.last_observed_at })),
      last_checked_at: lastCheck?.last_checked_at || null };
  } catch {
    return { status: 'UNAVAILABLE', includes_internal_tests: true };
  }
}

export async function operationalDiagnostics(db, internalIds = []) {
  const read = async (sql, params = []) => {
    try { return { status: 'AVAILABLE', rows: (await (params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)).all()).results }; }
    catch { return { status: 'UNAVAILABLE' }; }
  };
  const [inventory, migrations, outreach, social, funnel, notifications, priceCache, generalWatches, searchQa] = await Promise.all([
    read(`SELECT 'products' AS source,COUNT(*) AS count FROM products
      UNION ALL SELECT 'marketplace_offers',COUNT(*) FROM marketplace_offers
      UNION ALL SELECT 'sp_api_listings',COUNT(*) FROM sp_api_listings`),
    read(`SELECT name,applied_at FROM d1_migrations ORDER BY id DESC LIMIT 5`),
    read(`SELECT status,COUNT(*) AS count,MAX(sent_at) AS last_sent_at FROM seller_outreach_contacts GROUP BY status`),
    read(`SELECT q.post_id,q.platform,q.status,q.external_post_id,q.published_at,q.scheduled_at,
      (SELECT p.public_url FROM social_post_performance p WHERE p.post_id=q.post_id AND p.public_url<>'' ORDER BY p.snapshot_at DESC LIMIT 1) AS public_url,
      CASE WHEN q.last_error='' THEN 'NONE'
        WHEN q.last_error LIKE 'SOCIAL_RETRY_EXHAUSTED_%' THEN 'RETRY_EXHAUSTED'
        WHEN q.last_error LIKE '%Param text must be at most%' THEN 'TEXT_TOO_LONG'
        WHEN q.last_error LIKE 'SOCIAL_%_TEXT_TOO_LONG' THEN 'TEXT_TOO_LONG'
        ELSE 'OTHER_REDACTED' END AS error_code
      FROM social_post_queue q WHERE date(q.scheduled_at,'+9 hours')=date('now','+9 hours') ORDER BY q.scheduled_at LIMIT 60`),
    read(`SELECT event_type,traffic_class,CASE WHEN source LIKE 'seo_%' THEN 'SEO' ELSE 'OTHER' END AS origin,
      COUNT(*) AS count,COUNT(DISTINCT NULLIF(visitor_id,'')) AS observed_visitors
      FROM growth_events WHERE datetime(occurred_at)>=datetime('now','-7 days')
      AND event_type IN ('landing_view','target_price_watch_started','target_price_watch_set','marketplace_click','notification_opened')
      GROUP BY event_type,traffic_class,origin`),
    read(`SELECT channel,status,COUNT(*) AS count,MAX(delivered_at) AS last_delivered_at
      FROM mywatch_notifications WHERE event_type='PRICE_DROP' AND event_key LIKE 'TARGET:%'
      GROUP BY channel,status`),
    read(`SELECT marketplace,COUNT(*) AS count,SUM(CASE WHEN expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END) AS fresh,
      MAX(fetched_at) AS last_fetched_at,MIN(expires_at) AS first_expires_at FROM marketplace_price_cache GROUP BY marketplace`),
    internalIds.length ? read(`SELECT COUNT(*) AS watches,COUNT(DISTINCT member_id) AS users FROM member_wishes
      WHERE watch_price=1 AND CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)>=100
      AND member_id NOT IN (${internalIds.map((_,i)=>`?${i+1}`).join(',')})`, internalIds) : { status: 'UNVERIFIED' },
    read(`SELECT medium AS query_id,campaign AS outcome,content AS codes,occurred_at
      FROM growth_events WHERE event_type IN ('search_qa_result','search_qa_trace') AND traffic_class='QA'
      AND datetime(occurred_at)>=datetime('now','-24 hours') ORDER BY occurred_at DESC LIMIT 40`)
  ]);
  return { inventory, migrations, outreach, social, funnel, notifications,
    price_cache: priceCache, search_qa: searchQa,
    general_user_watch_set: { ...generalWatches, classification: 'EXCLUDES_CONFIGURED_INTERNAL_MEMBERS', internal_member_count: internalIds.length },
    outreach_delivery: { status: 'UNAVAILABLE', reason: 'DELIVERY_AND_BOUNCE_NOT_RECORDED_IN_CONTACT_SCHEMA' } };
}

async function main(argv) {
  const output = cliValue(argv, '--output', 'codex-kpi-snapshot.json');
  assert(output && !output.startsWith('-'), 'CODEX_KPI_OUTPUT_INVALID');
  const PRODUCT_DB = createCloudflareReadOnlyD1({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    databaseId: process.env.HOSHILU_D1_DATABASE_ID || DEFAULT_DATABASE_ID
  });
  const snapshot = await codexKpiSnapshotSummary({ PRODUCT_DB });
  snapshot.target_price_diagnostics = await targetPriceDiagnostics(PRODUCT_DB);
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const internalIds = String(config.vars?.INTERNAL_MEMBER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean);
  snapshot.operational_diagnostics = await operationalDiagnostics(PRODUCT_DB, internalIds);
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600, flag: 'w' });
  await chmod(output, 0o600);
  console.log(`CODEX_KPI_SNAPSHOT_READY:${snapshot.generated_at}:${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error?.message || 'CODEX_KPI_SNAPSHOT_FAILED').slice(0, 160));
    process.exitCode = 1;
  });
}
