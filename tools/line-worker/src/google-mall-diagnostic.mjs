import { googleMallSearchConfigured, searchGoogleMalls } from './google-mall-search.mjs';

// Fixed handoff cases only; this endpoint never accepts user search text.
const CASES = Object.freeze([
  ['misspelling', '韓国 頭皮ケア リリーブ'],
  ['category', '韓国 頭皮ケア'],
  ['corrected_brand', 'リリーイブ 頭皮'],
  ['latin_brand', 'lilyeve']
]);

export async function runGoogleMallDiagnostic(env, options = {}) {
  const cases = [];
  for (const [case_id, query] of CASES) {
    let summary = null;
    const outcome = await searchGoogleMalls(env, query, {
      fetch: options.fetch,
      now: options.now,
      timeoutMs: options.timeoutMs,
      // Each fixed case makes at most one search call, with the normal atomic
      // daily reservation. Cached/expanded answers cannot diagnose the index.
      cache: null,
      broaden: false,
      // Diagnostics consume the actual budget, but are not user search outcomes.
      recordOutcome: false,
      onResponse: (value) => { summary = value; }
    });
    cases.push({
      case_id,
      source: outcome.source,
      reason: outcome.reason,
      result_count: summary?.result_count ?? null,
      corrected_query_present: summary?.corrected_query_present ?? null,
      total_size: summary?.total_size ?? null,
      accepted_count: outcome.items.length
    });
  }
  return { ok: cases.every((row) => row.source === 'live'), cases };
}

export async function handleGoogleMallDiagnosticRoute(request, env, authorize, options = {}) {
  if (new URL(request.url).pathname !== '/api/internal/search/google-mall-diagnostic') return null;
  const headers = { 'cache-control': 'no-store' };
  if (request.method !== 'POST') return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { ...headers, allow: 'POST' } });
  if (!await authorize(request, env)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers });
  if (!googleMallSearchConfigured(env)) return Response.json({ ok: false, error: 'NOT_CONFIGURED' }, { status: 503, headers });
  return Response.json(await runGoogleMallDiagnostic(env, options), { headers });
}
