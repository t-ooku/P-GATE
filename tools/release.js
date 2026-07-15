'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputs = path.join(root, 'outputs');
const packageVersion = require(path.join(root, 'package.json')).version;
const version = packageVersion.replace(/\.0$/, '');

function run(command, args, cwd = root) {
  const result = childProcess.spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fileRecord(file) {
  return {
    file: path.basename(file),
    bytes: fs.statSync(file).size,
    sha256: sha256(file)
  };
}

function zip(output, cwd, entries) {
  if (fs.existsSync(output)) fs.rmSync(output);
  run('zip', ['-rq', output, ...entries], cwd);
}

fs.mkdirSync(outputs, { recursive: true });
run('npm', ['test']);
run(process.execPath, ['tools/build_bundle.js']);

const sourceZip = path.join(outputs, `Project_GATE_Source_v${version}.zip`);
const workerZip = path.join(outputs, `P-GATE_LINE_PWA_Worker_v${version}.zip`);
const chromeZip = path.join(outputs, `P-GATE_Chrome_Extension_v${version}.zip`);
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'p-gate-release-'));

try {
  zip(sourceZip, root, [
    '.github', '.gitignore', 'README.md', 'Project_GATE_Spec_v1 (2).md',
    'gas', `dist/Project_GATE_Complete_v${version}.gs`, 'dist/Project_GATE_Complete.gs',
    'docs', 'tests', 'tools', 'package.json'
  ]);
  zip(workerZip, path.join(root, 'tools', 'line-worker'), [
    'src', 'public', 'test', 'package.json', 'wrangler.jsonc', '.dev.vars.example'
  ]);
  zip(chromeZip, path.join(root, 'tools', 'chrome-extension'), [
    'background.js', 'icons', 'manifest.json', 'options.css', 'options.html', 'options.js',
    'panel.css', 'README.md', 'shared.mjs', 'sidepanel.html', 'sidepanel.js'
  ]);

  const manifest = {
    project: 'Project GATE',
    release: packageVersion,
    generated_at: new Date().toISOString(),
    tests: { gas: 'PASS', line_pwa_worker: 'PASS', chrome_extension: 'PASS' },
    artifacts: [sourceZip, workerZip, chromeZip].map(fileRecord),
    external_actions_remaining: [
      'GitHubへ一意なcommitとして保存',
      `GAS v${version}を反映してsetupProjectGateと公開前チェックを実行`,
      'Cloudflare WorkerとTurnstileを設定してデプロイ',
      'LINE Developersを設定して実機試験',
      'PWAとChrome拡張を実機試験',
      'ITGパイロット契約と商品コード100件を登録'
    ]
  };
  const manifestPath = path.join(outputs, `RELEASE_MANIFEST_v${version}.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${manifestPath}\n`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
