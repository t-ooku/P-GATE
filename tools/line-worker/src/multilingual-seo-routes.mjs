// GAS(gas/MultilingualSeoSyncEngine.gs)からSearch_Alias/Localized_Contentの
// スナップショットを受け取り、D1のproduct_aliases/localized_product_contentへ
// 反映する。products/contracts syncと同じ認証・重複排除パターン。
import { normalizeAliasEntry, normalizeContentEntry } from './multilingual-seo.mjs';

const MAX_RECORDS_PER_TYPE = 200;

function authorized(request, env) {
  const expected = String(env.MULTILINGUAL_SYNC_SECRET || env.GAS_BRIDGE_SECRET || '');
  const received = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return expected.length >= 32 && received === expected;
}

export function validateMultilingualSyncPayload(payload) {
  const batchId = String(payload?.batch_id ?? '').trim();
  const aliases = Array.isArray(payload?.aliases) ? payload.aliases : [];
  const content = Array.isArray(payload?.content) ? payload.content : [];
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(batchId)) throw new Error('MULTILINGUAL_SYNC_BATCH_INVALID');
  if (aliases.length > MAX_RECORDS_PER_TYPE || content.length > MAX_RECORDS_PER_TYPE) {
    throw new Error('MULTILINGUAL_SYNC_RECORD_COUNT_INVALID');
  }
  if (!aliases.length && !content.length) throw new Error('MULTILINGUAL_SYNC_RECORD_COUNT_INVALID');
  return {
    batch_id: batchId,
    aliases: aliases.map((item) => normalizeAliasEntry(item)),
    content: content.map((item) => normalizeContentEntry(item))
  };
}

export async function handleMultilingualSyncRoutes(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/internal/multilingual/sync') return null;
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  if (!env.PRODUCT_DB) {
    return Response.json({ ok: false, error: 'PRODUCT_DB_NOT_CONFIGURED' }, { status: 503 });
  }
  if (!authorized(request, env)) {
    return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  let input;
  try {
    input = validateMultilingualSyncPayload(await request.json());
  } catch (error) {
    return Response.json({ ok: false, error: String(error.message || error) }, { status: 400 });
  }
  const exists = await env.PRODUCT_DB.prepare(
    'SELECT batch_id FROM multilingual_sync_batches WHERE batch_id = ?1'
  ).bind(input.batch_id).first();
  if (exists) return Response.json({ ok: true, duplicate: true });

  const aliasSql = `INSERT INTO product_aliases (tenant,asin,language,alias,source,approved,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7)
    ON CONFLICT(tenant,asin,language,alias) DO UPDATE SET
      source=excluded.source, approved=excluded.approved, updated_at=excluded.updated_at
    WHERE product_aliases.updated_at<>excluded.updated_at`;
  const preparedAlias = env.PRODUCT_DB.prepare(aliasSql);
  const aliasStatements = input.aliases.map((entry) => preparedAlias.bind(
    entry.tenant, entry.asin, entry.language, entry.alias, entry.source,
    entry.approved ? 1 : 0, entry.updated_at
  ));

  const contentSql = `INSERT INTO localized_product_content
    (tenant,asin,language,display_name,description,keywords,source,approved,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
    ON CONFLICT(tenant,asin,language) DO UPDATE SET
      display_name=excluded.display_name, description=excluded.description,
      keywords=excluded.keywords, source=excluded.source, approved=excluded.approved,
      updated_at=excluded.updated_at
    WHERE localized_product_content.updated_at<>excluded.updated_at`;
  const preparedContent = env.PRODUCT_DB.prepare(contentSql);
  const contentStatements = input.content.map((entry) => preparedContent.bind(
    entry.tenant, entry.asin, entry.language, entry.display_name, entry.description,
    entry.keywords, entry.source, entry.approved ? 1 : 0, entry.updated_at
  ));

  if (aliasStatements.length) await env.PRODUCT_DB.batch(aliasStatements);
  if (contentStatements.length) await env.PRODUCT_DB.batch(contentStatements);
  await env.PRODUCT_DB.prepare(
    'INSERT INTO multilingual_sync_batches(batch_id,received_aliases,received_content,received_at) VALUES(?1,?2,?3,?4)'
  ).bind(input.batch_id, input.aliases.length, input.content.length, new Date().toISOString()).run();
  return Response.json({
    ok: true, duplicate: false, received_aliases: input.aliases.length, received_content: input.content.length
  });
}
