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
// 2026-08-19 に generate-runway-persona.yml を追加した。AI女優の参照画像候補を
// Runway API(gen4_image)で生成しartifactとして取り出す手動実行専用ワークフロー
// (confirm: GENERATE必須、1〜8枚に制限、D1/R2へは書き込まない)。
// 同日、publish-runway-reel.yml(汎用版)を追加した。従来のリールごとの
// 専用ワークフロー+SQL3本を、入力パラメータ(job_id/media_file/media_sha256)で
// 汎用化した(confirm: PUBLISH と release: RELEASE の二段確認は同じ)。
// publish-runway-reel-20260818.yml は第2弾(公開済み)の記録として残す。
// 2026-09-02 に apply-patch.yml を追加した。リポジトリ所有者が「[PATCH] …」
// 題名のIssueへ貼った git format-patch を feature/ui-search-v2 へ3-way適用し、
// ci.yml と同じ検証(全テスト・検索品質・wrangler dry-run・GASバンドル再現)を
// 通した場合だけ push・本番デプロイ・ヘルスチェックを行う。Issueイベントで
// 起動するため既定ブランチ(main)にも置く。push/PR/schedule では動かない。
// Claude(Cowork)がGitHubへ直接pushできない制約下で、人手のパッチ転記を
// なくしつつ、検証なしのコードが本番へ出ない経路として固定する。
const MANUAL_ONLY_WORKFLOWS = ['apply-teacher-dataset-d1.yml', 'setcloudflaresecret.yml', 'apply-d1-migrations.yml', 'submit-runway-job.yml', 'fetch-runway-raw-media.yml', 'publish-runway-reel-20260818.yml', 'publish-runway-reel.yml', 'generate-runway-persona.yml'];

test('GitHub Actions uses only the release and production-monitor workflows', () => {
  const workflows = fs.readdirSync(path.join(root, '.github', 'workflows')).filter((name) => name.endsWith('.yml'));
  // compile-teacher-dataset-rules.yml (2026-09-02追加): teacher-datasetのバッチが
  // feature/ui-search-v2 へ入った時だけ、生成物を GitHub のランナー側で再コンパイル
  // して同じブランチへコミットする。追加時にこの許可リストの更新が漏れていて、
  // 以降 npm test が落ちていた(2026-09-03に検知)。
  assert.deepEqual(workflows.filter((name) => !MANUAL_ONLY_WORKFLOWS.includes(name)),
    ['apply-patch.yml', 'ci.yml', 'compile-teacher-dataset-rules.yml', 'production-monitor.yml']);
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /npm test/);
  assert.match(ci, /dist\/Project_GATE_Complete\.gs/);
  assert.doesNotMatch(ci, /Project_GATE_Complete_v\d+\.\d+/);
  assert.match(ci, /Require Cloudflare credentials for production deploy/u);
  assert.match(ci, /CLOUDFLARE_API_TOKEN\/CLOUDFLARE_ACCOUNT_ID are required for the production deploy/u);
  assert.match(
    ci,
    /google-visual-activate:[\s\S]*Install Worker dependencies[\s\S]*npm ci --prefix tools\/line-worker[\s\S]*Deploy enabled Worker/u,
    'Google visual activation must install Worker dependencies before deployment'
  );
  assert.doesNotMatch(ci, /skipping deploy/u);
  assert.doesNotMatch(ci, /steps\.creds\.outputs\.configured/u);
});

test('apply-patch.yml は所有者のIssueだけを受け、検証を通した場合だけpush・デプロイする', () => {
  const file = path.join(root, '.github', 'workflows', 'apply-patch.yml');
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, 'utf8');
  const triggers = source.slice(source.indexOf('\non:'), source.indexOf('\npermissions:'));
  assert.match(triggers, /^\s{2}issues:\n\s+types: \[opened\]/mu);
  assert.match(triggers, /^\s{2}workflow_dispatch:/mu);
  assert.doesNotMatch(triggers, /^\s{2}(?:push|pull_request|schedule):/mu, 'must not run on push/PR/schedule');
  assert.match(source, /github\.event\.issue\.user\.login == github\.repository_owner/u);
  assert.match(source, /startsWith\(github\.event\.issue\.title, '\[PATCH\]'\)/u);
  assert.match(source, /issue\.user\.login !== owner/u, 'script must re-check the author');
  assert.match(source, /git am --3way/u);
  const order = ['git am --3way', 'wrangler@4.121.0 deploy --dry-run', 'npm test', 'npm run check:search-quality',
    'git diff --exit-code -- dist/Project_GATE_Complete.gs', 'git push origin', 'wrangler@4.121.0 deploy\n', 'check-production-health.mjs'];
  let cursor = -1;
  for (const step of order) {
    const index = source.indexOf(step, cursor + 1);
    assert.ok(index > cursor, `${step} must come after the previous verification step`);
    cursor = index;
  }
  assert.match(source, /group: cloudflare-deploy/u, 'must share the deploy concurrency group with ci.yml');
  assert.doesNotMatch(source, /d1 (?:execute|migrations apply)/u, 'must not touch D1');
  assert.doesNotMatch(source, /secret put/u, 'must not write Worker secrets');
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
