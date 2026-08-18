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

// 自動で走るワークフローは、release/deploy正本のci.ymlと本番外形監視の
// production-monitor.ymlだけに固定する。
// 2026-08-07 に apply-teacher-dataset-d1.yml を追加したが、これは
// workflow_dispatch でしか起動しない手動実行用で、push や PR では動かない。
// 2026-08-17 に setcloudflaresecret.yml を追加した。Cloudflareダッシュボード
// とwrangler loginが両方ブロックされていた(アカウント復旧待ち)期間に、
// 既存のCLOUDFLARE_API_TOKEN Secretを使ってWorkerのSecretを設定するための
// 手動実行専用ワークフロー(confirm: APPLY必須)。同じくpush/PRでは動かない。
// 同日、apply-d1-migrations.ymlも追加した。social_post_queue/
// social_post_performanceへTHREADSを許可する0052/0053マイグレーションを
// 本番D1へ適用するための手動実行専用ワークフロー(confirm: APPLY必須、かつ
// pending migrationの一覧が事前申告と完全一致しない限り何も実行しない)。
// 規約の狙いは古いCIが増殖して「どれが本物か分からない」状態を防ぐことなので、
// 手動ワークフローは名前を列挙して明示的に許可し、そのうえで「自動トリガーを
// 持たないこと」を下のテストで固定する。これを外すと、手動のつもりの
// ワークフローが後から push で走るようになっても気づけない。
// 2026-08-18 に submit-runway-job.yml を追加した。Runwayの動画生成ジョブを
// ops/runway/*.sql から本番D1へ投入する手動実行専用ワークフロー
// (confirm: SUBMIT必須、INSERT OR IGNORE INTO runway_* 以外のSQL文が
// 混ざっていたら実行前に拒否)。生成後はGENERATED_REVIEW_REQUIREDで停止し、
// QA承認なしにSNSへは公開されない。
// 同日、fetch-runway-raw-media.yml も追加した。GENERATED_REVIEW_REQUIRED時点の
// 生動画(字幕焼き込み前)をR2から読み取り専用で取り出し、QA承認に必要な
// 字幕合成・ハッシュ照合をローカルで行えるようにする手動実行専用ワークフロー
// (confirm: FETCH必須、D1へはSELECTのみ、対象job_idのstorage_key配下しか
// 読めない、R2へはobject getのみでput/deleteは行わない)。
// 同日、publish-runway-reel-20260818.yml も追加した。大隆さんが目視・試聴で
// 確認したリール第2弾の後処理済みバイト列をR2へ載せ、QA承認までを行う
// 手動実行専用ワークフロー(confirm: PUBLISH必須)。Instagramの公開キューへ
// 載せる最終段だけは release: RELEASE の追加入力が無いと実行しない。
const MANUAL_ONLY_WORKFLOWS = ['apply-teacher-dataset-d1.yml', 'setcloudflaresecret.yml', 'apply-d1-migrations.yml', 'submit-runway-job.yml', 'fetch-runway-raw-media.yml', 'publish-runway-reel-20260818.yml'];

test('GitHub Actions uses only the release and production-monitor workflows', () => {
  const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter((name) => name.endsWith('.yml'));
  assert.deepEqual(workflows.filter((name) => !MANUAL_ONLY_WORKFLOWS.includes(name)), ['ci.yml', 'production-monitor.yml']);
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /npm test/);
  assert.match(ci, /dist\/Project_GATE_Complete\.gs/);
  assert.doesNotMatch(ci, /Project_GATE_Complete_v\d+\.\d+/);
  assert.match(ci, /Require Cloudflare credentials for production deploy/u);
  assert.match(ci, /CLOUDFLARE_API_TOKEN\/CLOUDFLARE_ACCOUNT_ID are required for the production deploy/u);
  assert.doesNotMatch(ci, /skipping deploy/u);
  assert.doesNotMatch(ci, /steps\.creds\.outputs\.configured/u);
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
