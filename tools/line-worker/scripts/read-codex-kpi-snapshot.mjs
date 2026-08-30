import { chmod, writeFile } from 'node:fs/promises';
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

async function main(argv) {
  const output = cliValue(argv, '--output', 'codex-kpi-snapshot.json');
  assert(output && !output.startsWith('-'), 'CODEX_KPI_OUTPUT_INVALID');
  const PRODUCT_DB = createCloudflareReadOnlyD1({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    databaseId: process.env.HOSHILU_D1_DATABASE_ID || DEFAULT_DATABASE_ID
  });
  const snapshot = await codexKpiSnapshotSummary({ PRODUCT_DB });
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
