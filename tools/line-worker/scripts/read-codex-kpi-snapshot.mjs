import { chmod, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { codexKpiSnapshotSummary } from '../src/promotion-dashboard.mjs';

const DEFAULT_DATABASE_ID = '17629324-b771-4348-982c-c25da48c29b2';
const MUTATING_SQL = /\b(?:ALTER|ATTACH|CREATE|DELETE|DETACH|DROP|INSERT|PRAGMA|REINDEX|REPLACE|UPDATE|VACUUM)\b/iu;
const TRANSIENT_D1_HTTP_STATUS = new Set([408, 425, 429]);

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
  const attempts = Math.max(1, Math.min(3, Number(options.attempts) || 3));
  const retryMs = Math.max(0, options.retryMs == null ? 1000 : Number(options.retryMs) || 0);
  assert(accountId, 'CLOUDFLARE_ACCOUNT_ID_MISSING');
  assert(apiToken, 'CLOUDFLARE_API_TOKEN_MISSING');
  assert(databaseId, 'HOSHILU_D1_DATABASE_ID_MISSING');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;

  const execute = async (sql, params = []) => {
    const statement = assertReadOnlySql(sql);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiToken}`,
            'content-type': 'application/json',
            'user-agent': 'HOSHILU-Codex-KPI-ReadOnly/1.0'
          },
          body: JSON.stringify({ sql: statement, params }),
          signal: AbortSignal.timeout(15000)
        });
        const status = Number(response?.status) || 0;
        if (!response?.ok) {
          const error = new Error(`CODEX_KPI_D1_HTTP_${status}`);
          error.retryable = TRANSIENT_D1_HTTP_STATUS.has(status) || status >= 500;
          throw error;
        }
        const payload = await response.json();
        const result = Array.isArray(payload?.result) ? payload.result[0] : null;
        assert(payload?.success === true && result?.success !== false, 'CODEX_KPI_D1_QUERY_FAILED');
        return { results: Array.isArray(result?.results) ? result.results : [] };
      } catch (error) {
        const transientNetworkError = ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name);
        if (attempt >= attempts || (!error?.retryable && !transientNetworkError)) throw error;
        await new Promise(resolve => setTimeout(resolve, retryMs * attempt));
      }
    }
    throw new Error('CODEX_KPI_D1_QUERY_FAILED');
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
  const internalPlaceholders = internalIds.map((_, i) => `?${i + 1}`).join(',');
  const [inventory, migrations, outreach, outreachOutcomes, social, funnel, articleJourney, siteJourney,
    notifications, priceCache, generalWatches, searchQa, watchProviders, socialRetries, socialFormats,
    sellerAcquisition] = await Promise.all([
    read(`SELECT 'products' AS source,COUNT(*) AS count FROM products
      UNION ALL SELECT 'marketplace_offers',COUNT(*) FROM marketplace_offers
      UNION ALL SELECT 'sp_api_listings',COUNT(*) FROM sp_api_listings`),
    read(`SELECT COUNT(*) AS applied_count,MAX(applied_at) AS last_applied_at FROM d1_migrations`),
    read(`SELECT status,COUNT(*) AS count,MAX(sent_at) AS last_sent_at FROM seller_outreach_contacts GROUP BY status`),
    read(`SELECT
      SUM(CASE WHEN NULLIF(sent_at,'') IS NOT NULL THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='OPTED_OUT' THEN 1 ELSE 0 END) AS unsubscribe,
      SUM(CASE WHEN status='REPLIED' THEN 1 ELSE 0 END) AS response,
      SUM(CASE WHEN status='QUEUED' THEN 1 ELSE 0 END) AS queued
      ,MIN(CASE WHEN status='QUEUED' THEN scheduled_at END) AS next_scheduled_at,
      (SELECT COUNT(*) FROM seller_outreach_contacts c
        WHERE c.status='QUEUED' AND datetime(c.scheduled_at)<=datetime('now')
        AND NOT EXISTS (SELECT 1 FROM seller_outreach_suppressions s WHERE s.email_hash=c.email_hash)
        AND NOT EXISTS (SELECT 1 FROM seller_outreach_contacts p WHERE p.email_hash=c.email_hash
          AND p.contact_id<>c.contact_id AND p.status IN ('SENDING','SENT','REPLIED','OPTED_OUT'))
      ) AS eligible_now
      FROM seller_outreach_contacts`),
    read(`WITH classified AS (
      SELECT platform,status,published_at,scheduled_at,
        CASE WHEN last_error='' THEN 'NONE'
          WHEN last_error LIKE 'SOCIAL_RETRY_EXHAUSTED_%' THEN 'RETRY_EXHAUSTED'
          WHEN last_error LIKE '%Param text must be at most%' THEN 'TEXT_TOO_LONG'
          WHEN last_error LIKE 'SOCIAL_%_TEXT_TOO_LONG' THEN 'TEXT_TOO_LONG'
          ELSE 'OTHER_REDACTED' END AS error_code
      FROM social_post_queue WHERE date(scheduled_at,'+9 hours')=date('now','+9 hours')
    ) SELECT platform,status,error_code,COUNT(*) AS count,
      MAX(NULLIF(published_at,'')) AS last_published_at,
      MIN(CASE WHEN status IN ('APPROVED','PUBLISHING') THEN scheduled_at END) AS next_scheduled_at
      FROM classified GROUP BY platform,status,error_code ORDER BY platform,status,error_code`),
    read(`SELECT event_type,traffic_class,CASE WHEN source LIKE 'seo_%' THEN 'SEO' ELSE 'OTHER' END AS origin,
      COUNT(*) AS count,COUNT(DISTINCT NULLIF(visitor_id,'')) AS observed_visitors
      FROM growth_events WHERE datetime(occurred_at)>=datetime('now','-7 days')
      AND event_type IN ('landing_view','seo_article_view','seo_search_transition','search_started',
        'target_price_watch_started','target_price_watch_set','marketplace_click','notification_opened')
      GROUP BY event_type,traffic_class,origin`),
    read(`WITH sessions AS (
      SELECT session_id,
        MIN(CASE WHEN event_type='seo_article_view' THEN occurred_at END) AS article_view_at,
        MIN(CASE WHEN event_type='seo_search_transition' THEN occurred_at END) AS article_search_click_at,
        MIN(CASE WHEN event_type='search_started' THEN occurred_at END) AS search_started_at,
        MIN(CASE WHEN event_type='target_price_watch_started' THEN occurred_at END) AS watch_started_at,
        MIN(CASE WHEN event_type='target_price_watch_set' THEN occurred_at END) AS watch_set_at,
        MIN(CASE WHEN event_type='marketplace_click' THEN occurred_at END) AS mall_click_at
      FROM growth_events WHERE datetime(occurred_at)>=datetime('now','-7 days')
      AND traffic_class<>'QA' AND session_id<>'' GROUP BY session_id
    ) SELECT
      SUM(CASE WHEN article_view_at IS NOT NULL THEN 1 ELSE 0 END) AS article_sessions,
      SUM(CASE WHEN article_search_click_at>=article_view_at THEN 1 ELSE 0 END) AS article_to_search_click_sessions,
      SUM(CASE WHEN search_started_at>=article_view_at THEN 1 ELSE 0 END) AS article_to_search_started_sessions,
      SUM(CASE WHEN watch_started_at>=search_started_at AND search_started_at>=article_view_at THEN 1 ELSE 0 END) AS article_to_watch_started_sessions,
      SUM(CASE WHEN watch_set_at>=search_started_at AND search_started_at>=article_view_at THEN 1 ELSE 0 END) AS article_to_watch_set_sessions,
      SUM(CASE WHEN mall_click_at>=search_started_at AND search_started_at>=article_view_at THEN 1 ELSE 0 END) AS article_to_mall_click_sessions
      FROM sessions`),
    read(`WITH sessions AS (
      SELECT session_id,
        MIN(CASE WHEN event_type='landing_view' THEN occurred_at END) AS landed_at,
        MIN(CASE WHEN event_type='search_started' THEN occurred_at END) AS searched_at,
        MIN(CASE WHEN event_type='target_price_watch_started' THEN occurred_at END) AS watch_started_at,
        MIN(CASE WHEN event_type='target_price_watch_set' THEN occurred_at END) AS watch_set_at,
        MIN(CASE WHEN event_type='notification_opened'
          OR (event_type='landing_view' AND source='price_watch_notification') THEN occurred_at END) AS notification_return_at,
        MIN(CASE WHEN event_type='marketplace_click' THEN occurred_at END) AS mall_click_at
      FROM growth_events WHERE datetime(occurred_at)>=datetime('now','-7 days')
      AND traffic_class<>'QA' AND session_id<>'' GROUP BY session_id
    ) SELECT
      SUM(CASE WHEN landed_at IS NOT NULL THEN 1 ELSE 0 END) AS landing_sessions,
      SUM(CASE WHEN searched_at>=landed_at THEN 1 ELSE 0 END) AS search_sessions,
      SUM(CASE WHEN watch_started_at>=searched_at AND searched_at>=landed_at THEN 1 ELSE 0 END) AS watch_started_sessions,
      SUM(CASE WHEN watch_set_at>=searched_at AND searched_at>=landed_at THEN 1 ELSE 0 END) AS watch_set_sessions,
      SUM(CASE WHEN notification_return_at IS NOT NULL THEN 1 ELSE 0 END) AS notification_return_sessions,
      SUM(CASE WHEN mall_click_at>=notification_return_at THEN 1 ELSE 0 END) AS notification_return_to_mall_click_sessions,
      SUM(CASE WHEN mall_click_at IS NOT NULL THEN 1 ELSE 0 END) AS mall_click_sessions FROM sessions`),
    internalIds.length ? read(`SELECT channel,status,COUNT(*) AS count,MAX(delivered_at) AS last_delivered_at
      FROM mywatch_notifications WHERE event_type='PRICE_DROP' AND event_key LIKE 'TARGET:%'
      AND member_id NOT IN (${internalPlaceholders}) GROUP BY channel,status`, internalIds)
      : { status: 'UNVERIFIED', reason: 'INTERNAL_MEMBER_EXCLUSION_NOT_CONFIGURED' },
    read(`SELECT marketplace,COUNT(*) AS count,SUM(CASE WHEN expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END) AS fresh,
      MAX(fetched_at) AS last_fetched_at,MIN(expires_at) AS first_expires_at FROM marketplace_price_cache GROUP BY marketplace`),
    internalIds.length ? read(`SELECT COUNT(*) AS watches,COUNT(DISTINCT member_id) AS users FROM member_wishes
      WHERE watch_price=1 AND CAST(json_extract(condition_snapshot,'$.price_condition.target_price_jpy') AS INTEGER)>=100
      AND member_id NOT IN (${internalPlaceholders})`, internalIds)
      : { status: 'UNVERIFIED', reason: 'INTERNAL_MEMBER_EXCLUSION_NOT_CONFIGURED' },
    read(`SELECT campaign AS outcome,COUNT(*) AS count,MAX(occurred_at) AS last_observed_at
      FROM growth_events WHERE event_type='search_qa_result' AND traffic_class='QA'
      AND datetime(occurred_at)>=datetime('now','-24 hours') GROUP BY campaign ORDER BY campaign`),
    read(`SELECT marketplace AS provider,campaign AS outcome,COUNT(*) AS count,MAX(occurred_at) AS last_observed_at
      FROM growth_events WHERE event_type='target_price_provider_result' AND traffic_class='QA'
      AND marketplace IN ('RAKUTEN_JP','YAHOO_JP','AMAZON_JP')
      AND (campaign IN ('CANDIDATES','EMPTY','TIMEOUT','COORDINATOR_UNAVAILABLE','PROVIDER_REQUEST_FAILED')
        OR (campaign GLOB 'HTTP_[1-5][0-9][0-9]' AND length(campaign)=8))
      AND datetime(occurred_at)>=datetime('now','-24 hours') GROUP BY marketplace,campaign`),
    read(`SELECT status,
      CASE WHEN last_error LIKE '%Param text must be at most%' OR last_error LIKE 'SOCIAL_%_TEXT_TOO_LONG' THEN 'TEXT_TOO_LONG'
        WHEN last_error LIKE 'SOCIAL_RETRY_EXHAUSTED_%' THEN 'RETRY_EXHAUSTED' ELSE 'OTHER_REDACTED' END AS error_code,
      COUNT(*) AS count,MAX(updated_at) AS last_updated_at
      FROM social_post_queue WHERE platform='THREADS' AND last_error<>''
      AND status IN ('APPROVED','PUBLISHING','FAILED','CANCELLED')
      GROUP BY status,error_code`),
    read(`WITH classified AS (
      SELECT q.status,q.external_post_id,q.published_at,q.scheduled_at,
        CASE WHEN ('-' || lower(q.content_id) || '-') GLOB '*[-_]story[-_]*' THEN 'STORY'
          WHEN q.content_format IN ('REEL','IMAGE','CAROUSEL') THEN q.content_format ELSE 'UNSPECIFIED' END AS format,
        EXISTS(SELECT 1 FROM social_post_performance p WHERE p.post_id=q.post_id AND p.public_url LIKE 'https://%') AS has_public_url
      FROM social_post_queue q WHERE q.platform='INSTAGRAM'
      AND date(q.scheduled_at,'+9 hours')=date('now','+9 hours')
    ) SELECT format,status,COUNT(*) AS count,
      SUM(CASE WHEN status='PUBLISHED' AND external_post_id<>'' AND published_at<>'' THEN 1 ELSE 0 END) AS published_with_id_and_time,
      SUM(CASE WHEN status='PUBLISHED' AND external_post_id<>'' AND published_at<>'' AND has_public_url=1 THEN 1 ELSE 0 END) AS published_with_three_fields,
      MIN(CASE WHEN status IN ('APPROVED','PUBLISHING') THEN scheduled_at END) AS next_scheduled_at
      FROM classified GROUP BY format,status`),
    read(`SELECT
      (SELECT COUNT(DISTINCT c.email_hash) FROM seller_outreach_contacts c
        WHERE NOT EXISTS (SELECT 1 FROM seller_outreach_suppressions s WHERE s.email_hash=c.email_hash)) AS candidate_count,
      (SELECT COUNT(DISTINCT c.email_hash) FROM seller_outreach_contacts c
        WHERE c.scheduled_at<>'' AND c.status NOT IN ('SKIPPED','OPTED_OUT')
        AND NOT EXISTS (SELECT 1 FROM seller_outreach_suppressions s WHERE s.email_hash=c.email_hash)) AS send_target_count,
      (SELECT COUNT(*) FROM seller_business_inquiries) AS inquiry_total,
      (SELECT COUNT(*) FROM seller_business_inquiries WHERE inquiry_type='ACCOUNT_APPLICATION') AS account_application_total,
      (SELECT COUNT(*) FROM seller_business_inquiries WHERE status='QUALIFIED') AS qualified_lead_total,
      (SELECT COUNT(*) FROM seller_billing_accounts a
        WHERE NOT EXISTS (SELECT 1 FROM seller_shops s WHERE s.seller_key=a.seller_key
          AND s.slug IN ('with-care','find-fun','tomorrows-smile'))) AS external_seller_accounts,
      (SELECT COUNT(*) FROM products p WHERE EXISTS (
        SELECT 1 FROM seller_shops s, json_each(s.tenants) t
        WHERE t.value=p.tenant AND s.slug NOT IN ('with-care','find-fun','tomorrows-smile')
      )) AS external_registered_products,
      (SELECT COUNT(*) FROM growth_events WHERE event_type='seller_landing_view'
        AND traffic_class<>'QA' AND datetime(occurred_at)>=datetime('now','-7 days')) AS seller_landing_views_7d,
      (SELECT COUNT(*) FROM growth_events WHERE event_type='seller_cta_clicked'
        AND traffic_class<>'QA' AND datetime(occurred_at)>=datetime('now','-7 days')) AS seller_cta_clicks_7d`)
  ]);
  const outreachRow = outreachOutcomes.status === 'AVAILABLE' ? (outreachOutcomes.rows[0] || {}) : {};
  const outreachLifecycle = outreachOutcomes.status === 'AVAILABLE' ? {
    sent: { status: 'AVAILABLE', count: Number(outreachRow.sent || 0) },
    delivered: { status: 'UNAVAILABLE', reason: 'RESEND_DELIVERY_EVENT_NOT_CONNECTED' },
    bounce: { status: 'UNAVAILABLE', reason: 'RESEND_BOUNCE_EVENT_NOT_CONNECTED' },
    unsubscribe: { status: 'AVAILABLE', count: Number(outreachRow.unsubscribe || 0) },
    response: { status: 'AVAILABLE', count: Number(outreachRow.response || 0) },
    failed: { status: 'AVAILABLE', count: Number(outreachRow.failed || 0) },
    queued: { status: 'AVAILABLE', count: Number(outreachRow.queued || 0) },
    eligible_now: { status: 'AVAILABLE', count: Number(outreachRow.eligible_now || 0) },
    next_scheduled_at: outreachRow.next_scheduled_at || null
  } : { status: 'UNAVAILABLE' };
  return { inventory, migrations, outreach, outreach_lifecycle: outreachLifecycle, social, funnel,
    seller_acquisition: sellerAcquisition.status === 'AVAILABLE' ? {
      ...sellerAcquisition,
      exclusions: 'ITG_SELLER_SHOP_SLUGS_AND_QA_TRAFFIC',
      meeting_conversion: { status: 'UNAVAILABLE', reason: 'DEDICATED_MEETING_STAGE_NOT_CONNECTED' }
    } : sellerAcquisition,
    article_watch_journey_7d: articleJourney, site_watch_journey_7d: siteJourney, notifications,
    price_cache: priceCache, search_qa: searchQa,
    target_price_providers_24h: watchProviders, threads_retry_audit: socialRetries,
    instagram_formats_today: socialFormats,
    general_user_watch_set: { ...generalWatches, classification: 'EXCLUDES_CONFIGURED_INTERNAL_MEMBERS', internal_member_count: internalIds.length },
    notification_return_internal_exclusion: { status: 'UNAVAILABLE', reason: 'ANONYMOUS_RETURN_EVENTS_CANNOT_BE_JOINED_TO_INTERNAL_MEMBER_IDS' } };
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
