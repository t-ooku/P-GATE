import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const minorVersion = pkg.version.replace(/\.0$/, '');

test('release version has one source of truth', () => {
  const build = fs.readFileSync(path.join(root, 'tools', 'build_bundle.js'), 'utf8');
  const release = fs.readFileSync(path.join(root, 'tools', 'release.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'gas', 'Config.gs'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'tools', 'line-worker', 'src', 'index.mjs'), 'utf8');
  assert.match(build, /require\(path\.join\(root, 'package\.json'\)\)/);
  assert.match(release, /require\(path\.join\(root, 'package\.json'\)\)/);
  assert.match(release, /'npm\.cmd test'/);
  assert.match(release, /tar\.exe/);
  assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version));
  assert.match(config, new RegExp(`CURRENT_SYSTEM_VERSION = '${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.match(worker, new RegExp(`RELEASE = '${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.ok(fs.existsSync(path.join(root, 'dist', `Project_GATE_Complete_v${minorVersion}.gs`)));
});

// 自動で走るワークフローは ci.yml ただ1つ、という規約は維持する。
// 2026-08-07 に apply-teacher-dataset-d1.yml を追加したが、これは
// workflow_dispatch でしか起動しない手動実行用で、push や PR では動かない。
// 規約の狙いは古いCIが増殖して「どれが本物か分からない」状態を防ぐことなので、
// 手動ワークフローは名前を列挙して明示的に許可し、そのうえで「自動トリガーを
// 持たないこと」を下のテストで固定する。これを外すと、手動のつもりの
// ワークフローが後から push で走るようになっても気づけない。
const MANUAL_ONLY_WORKFLOWS = ['apply-teacher-dataset-d1.yml'];

test('GitHub Actions uses a single current workflow', () => {
  const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter((name) => name.endsWith('.yml'));
  assert.deepEqual(workflows.filter((name) => !MANUAL_ONLY_WORKFLOWS.includes(name)), ['ci.yml']);
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /npm test/);
  assert.match(ci, /dist\/Project_GATE_Complete\.gs/);
  assert.doesNotMatch(ci, /Project_GATE_Complete_v\d+\.\d+/);
});

test('手動ワークフローは自動トリガーを持たない', () => {
  for (const name of MANUAL_ONLY_WORKFLOWS) {
    const file = path.join(root, '.github', 'workflows', name);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /workflow_dispatch:/u, `${name}: must be dispatch-only`);
    const triggers = source.slice(source.indexOf('\non:'), source.indexOf('\npermissions:'));
    assert.doesNotMatch(triggers, /^\s{2}(?:push|pull_request|schedule):/mu, `${name}: must not run automatically`);
  }
});

test('stable GAS bundle exists after build', () => {
  const stable = path.join(root, 'dist', 'Project_GATE_Complete.gs');
  assert.ok(fs.existsSync(stable));
  assert.ok(fs.statSync(stable).size > 1000);
});

test('release archives include Worker migrations and Chrome localization', () => {
  const source = fs.readFileSync(path.resolve(root, 'tools/release.js'), 'utf8');
  assert.match(source, /'migrations'/);
  assert.match(source, /'_locales'/);
  assert.match(source, /'i18n\.mjs'/);
});
