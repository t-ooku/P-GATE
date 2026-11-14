import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const WRANGLER_VERSION = '4.113.0';
const DATABASE = 'hoshilu-products';
const npmCli = process.env.npm_execpath || '';
const npxCli = npmCli ? join(dirname(npmCli), 'npx-cli.js') : '';
const temporaryRoot = mkdtempSync(join(tmpdir(), 'hoshilu-auth-release-'));
const persistence = join(temporaryRoot, 'd1');
const bundle = join(temporaryRoot, 'bundle');

const run = (command, args, label) => {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error || result.status !== 0) {
    process.stderr.write(output);
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    throw new Error(`${label} failed`);
  }
  process.stdout.write(`PASS ${label}\n`);
  return output;
};

const runNpx = (args, label) => {
  if (!npxCli) throw new Error('run this check through npm so npx can be located safely');
  return run(process.execPath, [npxCli, ...args], label);
};

try {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  const release = source.match(/const RELEASE = '([0-9]+\.[0-9]+\.[0-9]+)'/)?.[1];
  if (!release) throw new Error('Worker release must use a semantic version');
  const releaseTest = readFileSync(new URL('../test/index.test.mjs', import.meta.url), 'utf8');
  const runbook = readFileSync(new URL('../docs/AUTH_RELEASE_RUNBOOK.md', import.meta.url), 'utf8');
  if (!releaseTest.includes(`payload.release, '${release}'`)) {
    throw new Error(`release test does not assert ${release}`);
  }
  for (const required of [
    `release\` が \`${release}\``,
    '0027_admin_login_guard.sql', '0028_seller_login_guard.sql',
    'SELLER_ALLOWED_TENANTS', '既存セッションは即時失効'
  ]) {
    if (!runbook.includes(required)) throw new Error(`auth runbook is missing: ${required}`);
  }
  process.stdout.write(`PASS auth release metadata ${release}\n`);

  run(process.execPath, ['--test',
    'test/admin-auth.test.mjs', 'test/admin-login-guard.test.mjs',
    'test/bounded-json.test.mjs', 'test/seller-auth.test.mjs',
    'test/seller-login-guard.test.mjs'
  ], 'auth tests');

  const dryRun = runNpx([
    '--yes', `wrangler@${WRANGLER_VERSION}`, 'deploy', '--dry-run', '--outdir', bundle
  ], 'worker bundle dry-run');
  if (!dryRun.includes(`env.PRODUCT_DB (${DATABASE})`)) {
    throw new Error(`bundle dry-run does not bind PRODUCT_DB to ${DATABASE}`);
  }

  for (const migration of [
    'migrations/0027_admin_login_guard.sql',
    'migrations/0028_seller_login_guard.sql'
  ]) {
    runNpx([
      '--yes', `wrangler@${WRANGLER_VERSION}`, 'd1', 'execute', DATABASE,
      '--local', '--persist-to', persistence, '--file', migration
    ], migration);
  }

  const schema = runNpx([
    '--yes', `wrangler@${WRANGLER_VERSION}`, 'd1', 'execute', DATABASE,
    '--local', '--persist-to', persistence, '--json', '--command',
    "SELECT name,type FROM sqlite_schema WHERE name IN ('admin_login_guard','admin_login_guard_locked','admin_auth_audit','admin_auth_audit_time','seller_login_guard','seller_login_guard_locked','seller_auth_audit','seller_auth_audit_time') ORDER BY name"
  ], 'auth database schema');
  const expected = new Map([
    ['admin_login_guard', 'table'], ['admin_login_guard_locked', 'index'],
    ['admin_auth_audit', 'table'], ['admin_auth_audit_time', 'index'],
    ['seller_login_guard', 'table'], ['seller_login_guard_locked', 'index'],
    ['seller_auth_audit', 'table'], ['seller_auth_audit_time', 'index']
  ]);
  let result;
  try { result = JSON.parse(schema); } catch { throw new Error('auth schema did not return JSON'); }
  const rows = result?.[0]?.results;
  if (result?.[0]?.success !== true || !Array.isArray(rows) || rows.length !== expected.size) {
    throw new Error('auth schema is incomplete');
  }
  for (const row of rows) {
    if (expected.get(row.name) !== row.type) {
      throw new Error(`unexpected auth schema object: ${row.name} (${row.type})`);
    }
  }
  process.stdout.write('AUTH_RELEASE_CHECK_OK\n');
} finally {
  const expectedPrefix = join(tmpdir(), 'hoshilu-auth-release-');
  if (!temporaryRoot.startsWith(expectedPrefix)) {
    throw new Error('refusing to remove an unexpected temporary directory');
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
