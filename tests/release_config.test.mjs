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
  assert.match(build, /require\(path\.join\(root, 'package\.json'\)\)/);
  assert.match(release, /require\(path\.join\(root, 'package\.json'\)\)/);
  assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version));
  assert.match(config, new RegExp(`CURRENT_SYSTEM_VERSION = '${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.ok(fs.existsSync(path.join(root, 'dist', `Project_GATE_Complete_v${minorVersion}.gs`)));
});

test('GitHub Actions uses a single current workflow', () => {
  const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter((name) => name.endsWith('.yml'));
  assert.deepEqual(workflows, ['ci.yml']);
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /npm test/);
  assert.match(ci, /dist\/Project_GATE_Complete\.gs/);
  assert.doesNotMatch(ci, /Project_GATE_Complete_v\d+\.\d+/);
});

test('stable GAS bundle exists after build', () => {
  const stable = path.join(root, 'dist', 'Project_GATE_Complete.gs');
  assert.ok(fs.existsSync(stable));
  assert.ok(fs.statSync(stable).size > 1000);
});
