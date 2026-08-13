import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://hoshilu.app/';
const REQUIRED_HEALTH_CHECKS = [
  'turnstile_configured',
  'ai_chat_configured',
  'rakuten_marketplace_configured',
  'yahoo_shopping_configured'
];
const ASSET_MARKERS = Object.freeze({
  'app.js': ['KNOWLEDGE_HTTP_TIMEOUT_MS', 'SEARCH_DEADLINE_EXCEEDED', 'SEARCH_SUPERSEDED', 'tokenCallbackTimeoutMs', 'maxAttempts'],
  'ai-search-ui.mjs': ['AI_CHAT_HTTP_TIMEOUT_MS', 'tokenCallbackTimeoutMs'],
  'growth-analytics.mjs': ['SEARCH_WATCHDOG_MS', 'search-execution-started', 'search_dead_end', 'search_degraded']
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseText(response, label) {
  assert(response?.ok, `${label}:HTTP_${Number(response?.status) || 0}`);
  return response.text();
}

async function responseJson(response, label) {
  const text = await responseText(response, label);
  try { return JSON.parse(text); } catch { throw new Error(`${label}:INVALID_JSON`); }
}

export function criticalAssetPaths(indexHtml = '') {
  const paths = [];
  for (const name of ['app.js', 'ai-search-ui.mjs', 'growth-analytics.mjs']) {
    const escaped = name.replaceAll('.', '\\.');
    const match = String(indexHtml).match(new RegExp(`(?:src=["'])(/[^"']*${escaped}\\?v=\\d+)(?:["'])`, 'u'));
    if (match) paths.push(match[1]);
  }
  return paths;
}

function probeRequest(baseUrl, pathname, turnstileToken = '', requestTimeoutMs = 10000) {
  return new Request(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'HOSHILU-Production-Monitor/1.0' },
    body: JSON.stringify({
      query: 'monitor probe',
      history: [{ role: 'user', content: 'monitor probe' }],
      consent: true,
      session_id: 'monitor_session_20260813',
      turnstile_token: turnstileToken
    }),
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
}

async function checkTraceableValidation(fetcher, baseUrl, pathname, expectedError, checks, turnstileToken = '', requestTimeoutMs = 10000) {
  const response = await fetcher(probeRequest(baseUrl, pathname, turnstileToken, requestTimeoutMs));
  assert(response.status === 400, `${pathname}:EXPECTED_400_GOT_${response.status}`);
  const payload = await response.json();
  assert(payload?.ok === false && payload?.error === expectedError, `${pathname}:VALIDATION_RESPONSE_CHANGED`);
  const headerId = String(response.headers.get('x-request-id') || '');
  assert(headerId.length >= 16 && headerId === String(payload.request_id || ''), `${pathname}:REQUEST_ID_MISSING`);
  checks.push(`${pathname} validation and request ID`);
}

async function checkAnonymousEventIngestion(fetcher, baseUrl, checks, requestTimeoutMs = 10000) {
  const response = await fetcher(new Request(new URL('/api/events', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'HOSHILU-Production-Monitor/1.0' },
    body: JSON.stringify({
      event_type: 'landing_view', locale: 'JA',
      source: 'qa_production_monitor', medium: 'qa', campaign: 'reliability_monitor'
    }),
    signal: AbortSignal.timeout(requestTimeoutMs)
  }));
  assert(response.status === 202, `/api/events:EXPECTED_202_GOT_${response.status}`);
  const payload = await response.json();
  assert(payload?.ok === true, '/api/events:INGESTION_FAILED');
  checks.push('/api/events anonymous QA ingestion');
}

export async function inspectProduction({
  baseUrl = DEFAULT_BASE_URL,
  fetcher = fetch,
  expectedIndexHtml = null,
  assetPolicy = 'source',
  requestTimeoutMs = 10000
} = {}) {
  const origin = new URL(baseUrl);
  const checks = [];
  const fetchTimeoutMs = Math.max(10, Math.min(30000, Number(requestTimeoutMs) || 10000));
  assert(['source', 'live'].includes(assetPolicy), `ASSET_POLICY_INVALID:${assetPolicy}`);

  const cacheBust = `monitor=${Date.now()}`;
  const health = await responseJson(await fetcher(new URL(`/health?${cacheBust}`, origin), {
    headers: { accept: 'application/json', 'user-agent': 'HOSHILU-Production-Monitor/1.0' },
    signal: AbortSignal.timeout(fetchTimeoutMs)
  }), '/health');
  assert(health.ok === true, 'HEALTH_NOT_OK');
  for (const name of REQUIRED_HEALTH_CHECKS) assert(health?.checks?.[name] === true, `HEALTH_CHECK_FALSE:${name}`);
  checks.push(`/health ok (${REQUIRED_HEALTH_CHECKS.length} critical integrations)`);

  const productionHtml = await responseText(await fetcher(new URL(`/?${cacheBust}`, origin), {
    headers: { accept: 'text/html', 'user-agent': 'HOSHILU-Production-Monitor/1.0' },
    signal: AbortSignal.timeout(fetchTimeoutMs)
  }), '/');
  const sourceIndex = assetPolicy === 'live'
    ? productionHtml
    : expectedIndexHtml ?? await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const expectedAssets = criticalAssetPaths(sourceIndex);
  assert(expectedAssets.length === 3, `${assetPolicy === 'live' ? 'LIVE' : 'LOCAL'}_CRITICAL_ASSET_VERSION_MISSING`);
  for (const path of expectedAssets) {
    assert(productionHtml.includes(path), `PRODUCTION_ASSET_VERSION_MISMATCH:${path}`);
    const asset = await responseText(await fetcher(new URL(path, origin), {
      headers: { accept: '*/*', 'user-agent': 'HOSHILU-Production-Monitor/1.0' },
      signal: AbortSignal.timeout(fetchTimeoutMs)
    }), path);
    assert(asset.length > 1000, `PRODUCTION_ASSET_TOO_SMALL:${path}`);
    const name = path.includes('ai-search-ui.mjs') ? 'ai-search-ui.mjs' : path.includes('growth-analytics.mjs') ? 'growth-analytics.mjs' : 'app.js';
    for (const marker of ASSET_MARKERS[name]) assert(asset.includes(marker), `PRODUCTION_ASSET_MARKER_MISSING:${name}:${marker}`);
  }
  checks.push(`critical assets current (${expectedAssets.join(', ')})`);

  const capabilities = await responseJson(await fetcher(new URL(`/api/ranking-capabilities?${cacheBust}`, origin), {
    headers: { accept: 'application/json', 'user-agent': 'HOSHILU-Production-Monitor/1.0' },
    signal: AbortSignal.timeout(fetchTimeoutMs)
  }), '/api/ranking-capabilities');
  assert(capabilities.ok === true && Array.isArray(capabilities.marketplaces), 'RANKING_CAPABILITIES_INVALID');
  assert(capabilities.marketplaces.length === 13, `RANKING_MARKETPLACE_COUNT:${capabilities.marketplaces.length}`);
  const yahoo = capabilities.marketplaces.find((item) => item.marketplace_id === 'YAHOO_JP');
  assert(yahoo?.status === 'available' && yahoo?.ranking_mode === 'native_api', 'YAHOO_RANKING_NOT_AVAILABLE');
  checks.push('13-mall registry and Yahoo! native ranking');

  await checkTraceableValidation(fetcher, origin, '/api/ai-chat', 'TURNSTILE_VERIFICATION_FAILED', checks, 'hoshilu-production-monitor-invalid-token', fetchTimeoutMs);
  await checkTraceableValidation(fetcher, origin, '/api/knowledge', 'TURNSTILE_TOKEN_INVALID', checks, '', fetchTimeoutMs);
  await checkAnonymousEventIngestion(fetcher, origin, checks, fetchTimeoutMs);
  return { ok: true, checked_at: new Date().toISOString(), checks, expected_assets: expectedAssets };
}

export async function runProductionMonitor(options = {}) {
  const attempts = Math.max(1, Math.min(5, Number(options.attempts) || 1));
  const retryMs = Math.max(100, Math.min(30000, Number(options.retryMs) || 5000));
  const deadlineMs = Math.max(10000, Math.min(180000, Number(options.deadlineMs) || 90000));
  const deadlineAt = Date.now() + deadlineMs;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (Date.now() >= deadlineAt) throw lastError || new Error('PRODUCTION_MONITOR_DEADLINE');
    try {
      return await inspectProduction(options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && Date.now() + retryMs < deadlineAt) await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
  throw lastError;
}

function cliOptions(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  return {
    baseUrl: value('--base-url', process.env.HOSHILU_PRODUCTION_URL || DEFAULT_BASE_URL),
    assetPolicy: value('--asset-policy', process.env.HOSHILU_MONITOR_ASSET_POLICY || 'source'),
    attempts: Number(value('--attempts', process.env.HOSHILU_MONITOR_ATTEMPTS || 1)),
    retryMs: Number(value('--retry-ms', process.env.HOSHILU_MONITOR_RETRY_MS || 5000)),
    deadlineMs: Number(value('--deadline-ms', process.env.HOSHILU_MONITOR_DEADLINE_MS || 90000))
  };
}

async function main() {
  try {
    const result = await runProductionMonitor(cliOptions(process.argv.slice(2)));
    const summary = [`## HOSHILU production monitor: PASS`, '', `Checked: ${result.checked_at}`, ...result.checks.map((item) => `- ${item}`), ''].join('\n');
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
  } catch (error) {
    const message = String(error?.message || error);
    const summary = `## HOSHILU production monitor: FAIL\n\n- ${message}\n`;
    console.error(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, summary));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
