# HOSHILU 他PC移行・引継ぎ書

作成日: 2026-07-29 JST  
対象リポジトリ: `https://github.com/t-ooku/P-GATE`  
対象ブランチ: `agent/mygate-v5-itg-phase0`  
公開サービス: `https://hoshilu.app/`

## 0. この文書の目的と正

この文書は、現在のPCを使用できなくなっても、別PCでHOSHILU開発を継続できるようにするための引継ぎ書である。

- ソースコード、設計書、テスト、公開素材、実装メモの正はGitHubとする。
- GitHubに保存してはいけない認証情報は、各サービスのSecret管理画面またはパスワード管理ツールで別途引き継ぐ。
- 秘密情報の値をチャット、GitHub、Markdown、Spreadsheet、スクリーンショットへ貼らない。
- Google Drive/Spreadsheetの業務データとCloudflare D1は、GitHubから再生成できない運用データとして別管理する。

## 1. Git/GitHubの現状

2026-07-29監査時点:

| 項目 | 状態 |
|---|---|
| リポジトリ | `t-ooku/P-GATE` |
| GitHub URL | `https://github.com/t-ooku/P-GATE` |
| 既定ブランチ | `main` |
| 作業ブランチ | `agent/mygate-v5-itg-phase0` |
| 監査開始時HEAD | `09e303f` `fix: align release version at 1.15.0` |
| 追跡先 | `origin/agent/mygate-v5-itg-phase0` |
| 監査開始時ahead/behind | `0/0` |
| コンフリクト | なし |
| 既存PR | Draft PR #2 `Stabilize ITG setup and add MYGATE v5 SSoT` |
| PR URL | `https://github.com/t-ooku/P-GATE/pull/2` |
| プロジェクト由来の未コミット/未追跡 | 監査開始時なし |

今回の引継ぎ書は、検証後に同じブランチへコミット・Pushし、PR #2へ追加する。

## 2. プロジェクト全体の状況

### 2.1 完了済み・実装済み

- HOSHILU公開Web/PWA、JA/EN/ZH/KOの4言語UI。
- あいまいな記憶からの商品検索、追加質問、検索条件の継続。
- ITG/ITT/MC2を横断するD1商品索引、重複ASIN統合、FTS検索。
- Amazon、楽天市場、Qoo10、SHEINへの安全な送客経路。
- 承認済み商品URL、署名付き送客URL、キャンペーン計測。
- ほしっとく（旧MYWISH）と会員同期。
- ホシっといて（旧MYWATCH）の通知条件、スケジュール、リトライ、監査ロジック。
- LINE Login、セラー認証、テナント境界、プラン境界。
- LINE Messaging API用署名検証・Webhook処理コード。
- Amazon Creators API、楽天API、Amazon SP-APIの連携コード。
- 輸入制限・キャンセル需要の匿名化と国内代替候補Knowledge。
- HOSHILU INSIGHT向け未充足需要、制限、セラー分析基盤。
- SNS投稿キュー、承認制、X/Instagram/TikTok publisher。
- PWA、Service Worker、OGP、sitemap、robots、privacy、terms。
- Chrome Manifest V3拡張、4言語、PWAへの安全な引継ぎ。
- GASによるZIP取込、正規化、検証、Master Database、ログ、Opportunity。
- Windows BridgeによるOneDriveからGoogle DriveへのZIP転送。
- 30日超ArchiveをGoogle Driveゴミ箱へ移す保守処理。
- GitHub ActionsによるNode.js 22の全回帰テストと再現可能ビルド確認。

### 2.2 開発中・運用確認中

- 本番MYWATCH通知の実配信・到達確認。
- Amazon SP-APIの3テナント（ITG/ITT/MC2）本番Secretと同期監査。
- LINE Messaging API公式アカウントの本番Secret、Webhook、4言語返信確認。
- X API資格情報の再発行と自動投稿の再確認。
- Instagram/TikTok投稿用公開HTTPS素材と権限・審査確認。
- D1の最新migration適用状況と本番Workerのソース一致確認。
- 最新GAS bundleの本番Apps Script反映、dry-run、trigger確認。
- HOSHILU INSIGHTの契約スコープに基づく本番レポート化。
- Chrome Web Store向け説明、プライバシー、サポートURL、公開審査。

### 2.3 未着手または本番開始前

- ネイティブiOS/Androidアプリ。PWA/LINEの継続率・通知利用率を確認してから判断する。
- Qoo10/SHEINの公式商品Feed/APIによる商品詳細統合。検索結果スクレイピングは禁止。
- 大規模有料広告、クリエイター施策、一般向け大規模告知。
- 商標専門家を含む最終的な名称クリアランス。

### 2.4 保留事項

- X自動投稿: OAuth資格情報の状態が不安定だったため、本番再認証待ち。
- TikTok自動投稿: Content Posting APIの審査・権限が必要。
- LINE Messaging: LINE Loginとは別チャネルであり、Channel Secret/Access Token設定が必要。
- ネイティブアプリ: 現時点ではPWAで主要用途を満たすため、投資判断を保留。
- 一括名称変更: `mygate_*`、Project GATE、GASシート名、Worker名などは互換性維持のため変更しない。

## 3. GitHubへ保存するもの

保存対象:

- `gas/`: Google Apps Script分割ソース。
- `dist/`: 再現可能なGAS結合版。
- `tools/line-worker/`: Cloudflare Worker、公開Web、D1 migrations、テスト。
- `tools/chrome-extension/`: Chrome拡張。
- `tools/windows-bridge/`: Windows Bridge。
- `tests/`、Worker/Chrome各テスト。
- `docs/`: 設計、運用、リリース、ブランド、引継ぎ。
- `marketing/`: 公開素材、SNS計画、権利確認資料。
- `benchmarks/`: 検索評価データと結果。
- `.github/workflows/ci.yml`: CI。

保存しないもの:

- Secret、APIキー、OAuth token、パスワード。
- `.dev.vars`、`.clasp.json`、`.wrangler/`、`node_modules/`。
- ローカルログ、検査用一時ファイル、dry-run生成物、ローカルZIP。
- Google Drive/Spreadsheet/D1の本番業務データ。

## 4. GitHubに保存されない設定・データ

値ではなく必要項目だけを記載する。

### 4.1 Cloudflare Worker Secrets

- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_SITE_KEY`
- `GAS_BACKEND_URL`
- `GAS_BRIDGE_SECRET`
- `LINK_SIGNING_SECRET`
- `PRODUCT_SYNC_SECRET`
- `MARKETPLACE_OFFER_SYNC_SECRET`
- `UNMET_DEMAND_SYNC_SECRET`
- `MYWATCH_CRON_SECRET`
- `AUTH_SESSION_SECRET`
- `MEMBER_SESSION_SECRET`
- `MEMBER_PUBLIC_ORIGIN`
- `SELLER_AUTH_ID`
- `SELLER_AUTH_PASSWORD`
- `SOCIAL_ADMIN_SECRET`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `RESEND_API_KEY`
- `AMAZON_CREATORS_CREDENTIAL_ID`
- `AMAZON_CREATORS_CREDENTIAL_SECRET`
- `RAKUTEN_APPLICATION_ID`
- `RAKUTEN_ACCESS_KEY`
- `RAKUTEN_AFFILIATE_ID`
- `SPAPI_LWA_CLIENT_ID`
- `SPAPI_LWA_CLIENT_SECRET`
- `SPAPI_REFRESH_TOKEN_ITG`
- `SPAPI_REFRESH_TOKEN_ITT`
- `SPAPI_REFRESH_TOKEN_MC2`
- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_USER_ACCESS_TOKEN`
- `INSTAGRAM_ACCESS_TOKEN`
- `TIKTOK_ACCESS_TOKEN`

Secretの有無は、移行元PCのファイルではなくCloudflare DashboardのWorker設定で確認する。新PCへSecret値をファイルコピーする必要はない。

### 4.2 Cloudflareの非Secret設定

- Worker: `project-gate-line-bridge`
- Domain: `hoshilu.app`
- D1 binding: `PRODUCT_DB`
- D1 database: `hoshilu-products`
- D1 database IDは`tools/line-worker/wrangler.jsonc`で追跡済み。
- Cron: 15分間隔。
- Cloudflareアカウントへのログインと、対象Worker/D1/DNSへの権限が必要。

### 4.3 GAS Script Properties

- `SPREADSHEET_ID`
- `LINE_BRIDGE_SECRET`
- `LINE_CONTRACT_ID`
- `LINE_DEFAULT_CATEGORY`
- `PWA_CONTRACT_ID`
- `PWA_DEFAULT_CATEGORY`
- `PRODUCT_SYNC_SECRET`
- `PRODUCT_INDEX_SYNC_URL`
- `UNMET_DEMAND_SYNC_SECRET`
- `UNMET_DEMAND_SYNC_URL`

### 4.4 Spreadsheet Config

- `INPUT_FOLDER_ID`
- `EXTRACT_FOLDER_ID`
- `ARCHIVE_FOLDER_ID`
- `ERROR_FOLDER_ID`
- `LOG_FOLDER_ID`
- `SPREADSHEET_ID`
- `SYSTEM_VERSION`

### 4.5 ローカルPC固有

- OneDriveの注文ZIP到着フォルダ。
- Google Drive for desktopの同期先。
- Windows Bridgeのインストール先と設定。
- Windows Task Schedulerの毎日5:00タスク。
- Power Automate Desktopの3アカウントZIP取得フロー。
- ブラウザ、VS Code、Codex、GitHub CLIのログイン状態。
- Chrome拡張のローカル読込状態。

## 5. 接続済みサービス

| サービス | 用途 | 現在の状態 | 移行時に必要な作業 |
|---|---|---|---|
| GitHub | ソース、資料、CI、PR | `t-ooku/P-GATE`、Draft PR #2 | GitHubログイン、`gh auth login`、Clone |
| Cloudflare Workers | Web/PWA/API/Cron | `hoshilu.app`で稼働 | Dashboardログイン、Secret/権限確認 |
| Cloudflare D1 | 商品、会員、MYWATCH、SNS等 | `hoshilu-products` | migration一覧、バックアップ、binding確認 |
| Cloudflare DNS/Turnstile | Domain/ボット対策 | 本番利用 | DNS/Turnstile権限確認 |
| Google Drive | ZIP入力・CSV・Archive・Error・Log | 運用データあり | Googleアカウントログイン、同期設定 |
| Google Spreadsheet | 監査用SSoT/Master Database | 本番データあり | 対象Sheetへの権限確認 |
| Google Apps Script | ZIP処理、同期、KPI | 本番プロジェクトあり | Apps Script権限、Properties、trigger確認 |
| LINE Login | 会員認証 | 実アカウント確認済み | Provider/Channel権限確認 |
| LINE Messaging API | 公式チャット | 本番確認が残る | Secret/token、Webhook、返信試験 |
| Amazon SP-API | ITG/ITT/MC2出品同期 | コード済み、本番Secret確認待ち | LWA資格情報と3 refresh token確認 |
| Amazon Creators/Associate | 商品検索・送客 | コード済み | credentialとAssociate tag確認 |
| 楽天 | 商品API/送客 | コード済み | Application ID、Access Key、Affiliate ID |
| X | SNS投稿 | 再認証・本番確認待ち | Developer権限とOAuth再確認 |
| Meta/Instagram | SNS投稿 | 一部手動公開実績あり | Meta Business/App/Page/IG権限確認 |
| TikTok | SNS投稿 | 審査・設定待ち | Content Posting API審査、token |
| Resend | 会員メール認証 | 設定時のみ有効 | Domain、sender、API key |
| GitHub Actions | 回帰テスト | Node.js 22で実行 | 原則追加設定不要 |
| Power Automate Desktop | 3アカウントZIP取得 | 移行元PC依存 | Flow export/importと接続再認証 |
| Windows Task Scheduler | Bridge定時実行 | 移行元PC依存 | 新PCで再作成 |

Vercel、Firebase、Supabase、Google Analytics、Search Console、Render、Netlifyを本リポジトリの必須実行依存として確認できる証拠はない。利用している場合はアカウント側で別途確認する。

## 6. 開発・実行環境

監査PC:

| ツール | 確認バージョン/要件 |
|---|---|
| Node.js | `v24.18.0`。CIはNode.js `22` |
| npm | `11.16.0` |
| Git | `2.55.0.windows.3` |
| GitHub CLI | `2.96.0` |
| Wrangler | `4.113.0` |
| PowerShell | Windows PowerShellまたはPowerShell 7 |
| VS Code | 推奨。必須拡張はリポジトリで固定されていない |
| Chrome | PWA/Chrome拡張/表示確認 |
| Google Drive for desktop | Windows Bridge運用時に必要 |
| Power Automate Desktop | 3アカウントZIP自動取得時に必要 |
| Codex | 開発支援。GitHubログインと対象フォルダ指定 |
| Claude Code | 必須ではない。使用する場合もGitHubを正とする |

推奨VS Code拡張:

- ESLint（将来設定する場合）。
- Prettier（既存書式を壊さない範囲）。
- GitHub Pull Requests and Issues。
- Cloudflare Workers関連拡張は任意。

## 7. 新PCでの開始手順

### 7.1 必要ソフト

1. Git
2. Node.js 22 LTS以上
3. GitHub CLI
4. VS Code
5. Chrome
6. Google Drive for desktop
7. Power Automate Desktop（自動ZIP取得を移す場合）
8. Codex

### 7.2 GitHubログイン

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth status
```

### 7.3 Clone

```powershell
cd C:\Users\<ユーザー名>\Documents
git clone https://github.com/t-ooku/P-GATE.git
cd P-GATE
git fetch origin
git switch agent/mygate-v5-itg-phase0
git status --short --branch
```

`main`へmerge済みの場合は、最新の正として`main`を使用する。

### 7.4 依存関係

現在の`package.json`には外部npm dependenciesがないため、通常は`npm install`なしでテスト可能。将来lockfile/dependenciesが追加された場合は以下を使用する。

```powershell
npm ci
```

### 7.5 Build

```powershell
npm run build
```

生成物:

- `dist/Project_GATE_Complete.gs`

### 7.6 Test

```powershell
npm test
```

2026-07-29実績:

- GAS/ルート回帰: 全件PASS。
- リリース検証: 4/4 PASS。
- Worker: 179/179 PASS。
- Chrome拡張: 6/6 PASS。

### 7.7 Worker dry-run

```powershell
cd tools\line-worker
npx --yes wrangler@4.113.0 deploy --dry-run
```

### 7.8 Worker deploy

本番変更なので、テスト、D1 migration、Secret readiness、差分、rollback先を確認してから行う。

```powershell
cd tools\line-worker
npx --yes wrangler@4.113.0 d1 migrations list hoshilu-products --remote
npx --yes wrangler@4.113.0 d1 migrations apply hoshilu-products --remote
npx --yes wrangler@4.113.0 deploy
```

受入確認:

```text
https://hoshilu.app/
https://hoshilu.app/health
```

### 7.9 GAS

1. Google Drive/Spreadsheet/Apps Scriptへログイン。
2. `dist/Project_GATE_Complete.gs`または`gas/`分割版のどちらか一方だけを反映。
3. Script PropertiesとConfigを値なしで存在確認。
4. `setupProjectGate()`を実行。
5. 正常ZIPで`runProjectGate()`を手動試験。
6. Archive/Error/Log/Master Databaseを確認。
7. triggerを確認。

### 7.10 Windows Bridge

`tools/windows-bridge/README.md`に従う。OneDriveとGoogle Drive for desktopの実フォルダは新PCで再設定する。Task SchedulerとPower Automate Desktop FlowはGit Cloneだけでは移行されない。

### 7.11 よくあるエラー

| エラー | 原因 | 解決 |
|---|---|---|
| `gh`が見つからない | 未導入またはPATH未反映 | GitHub CLI導入後、Terminal/Codex再起動 |
| `gh auth status`が未ログイン | 新PCで未認証 | `gh auth login ... --web` |
| Workerが503 | 必須Secret/D1/Turnstile不足 | `/health`の項目名を見てDashboardで設定 |
| LINE 400/返信なし | Login/Messagingチャネル混同、Webhook/Secret不一致 | 対象ChannelとWebhook署名を再確認 |
| GAS timeout | 一括処理過多またはUI alert待ち | 1 ZIP/実行、trigger、最新版bundleを確認 |
| GASで重複定義 | 結合版と分割版を同時登録 | どちらか一方だけ残す |
| D1 migration失敗 | 適用順、権限、DB違い | `migrations list --remote`と対象アカウント確認 |
| Windows Bridgeが動かない | 同期アプリ停止、パス違い、Task停止 | OneDrive/Drive/Task Schedulerを確認 |
| 文字化け | PowerShellの表示encoding | UTF-8対応Terminalを使い、ファイルをUTF-8で開く |
| テスト後にbundle差分 | sourceと生成物不一致 | `npm run build`後に差分を確認し両方コミット |

## 8. HOSHILU専用引継ぎ

### 8.1 ブランド方針

- 正式公開名は`HOSHILU`、日本語表示は`ホシル`。
- ブランドラインは「欲しいを、ちゃんと見つける。」
- 習慣ラインは「気になったら、ほしっとく。」
- 公開UIで旧名MYGATEを新規使用しない。
- Pink `#F238B5`、Violet `#8A4CF4`、Blue `#258CFF`のgradientを維持。
- ロゴを伸縮、別色化、第三者モールロゴと合成しない。

### 8.2 UI方針

- 商品名が分からない人を前提に、見た目、場所、用途、条件から探せるようにする。
- 断定よりも候補と最小1問の確認を優先する。
- JA/EN/ZH/KOを同等に扱う。
- PC/モバイル/PWA/Chromeで検索文を安全に継続する。
- 購入先は承認済み・新鮮・許可ドメインの実商品URLを優先する。

### 8.3 AI・検索方針

- 利益率ではなく根拠、関連性、安全性で順位付けする。
- 型番、容量、固有語が候補と一致しない場合は断定しない。
- 個人情報、注文番号原文、住所、連絡先、自由記述の生データを分析基盤へ保存しない。
- 輸入制限や高リスク代替は人手確認なしに確定しない。
- 価格、在庫、安全性、互換性、最安を保証しない。

### 8.4 SEO方針

- HOSHILU正式名、canonical、sitemap、robots、OGPを維持。
- 検索意図と多言語aliasを使い、薄い自動生成ページを量産しない。
- 公開前にtitle、description、OGP、privacy、terms、support URLを確認。

### 8.5 SNS運用方針

- 投稿は承認制。未承認キューを自動公開しない。
- Affiliate投稿には明示表示を付ける。
- 個人情報を含むコメント・DMをKnowledgeへ取り込まない。
- HOSHILUへの計測リンクを使い、SNSプラットフォームをまたいでSecretを共有しない。
- X/Instagram/TikTokの権限と審査が揃ったチャネルだけ自動化する。

### 8.6 ITG向け実装

- ITG/ITT/MC2の3テナント境界を維持。
- 同一ASINは公開面で統合しても、セラー・契約・監査情報は混同しない。
- 支払いプランは検索関連性順位を変えない。
- SP-APIはテナント別refresh tokenを使い、1テナントの失敗で他を止めない。

### 8.7 MYGATE/P-GATEとの関係

- `HOSHILU/ホシル`: 正式な公開ブランド。
- `MYGATE`: 旧公開名。履歴・移行説明以外では新規使用しない。
- `P-GATE/Project GATE`: リポジトリ、GAS、Bridge、内部基盤の互換名。
- `mygate_*`: 保存データ・session・analytics互換キー。計画なしに変更しない。

### 8.8 変更してはいけない事項

- リポジトリ名、Worker名、GAS名、D1名、sheet名、storage keyの一括改名。
- Secret値のGitHub/文書/チャット保存。
- 結合GASと分割GASの同時登録。
- 未承認商品URLや検索結果URLを実商品購入先として表示。
- 未確認の輸入規制・安全・互換性をAIが断定。
- テナントをまたぐセラー情報や個人情報の公開。
- 承認前SNS投稿の自動公開。

## 9. 今後の優先順位

1. **GitHubと本番ソースの一致確認**  
   GitHubを正にできなければ移行・rollback・監査が成立しない。
2. **Cloudflare/D1のバックアップ、migration、Secret readiness確認**  
   Web/API/会員/商品検索の中核であり、誤deployの影響が最大。
3. **HOSHILU本番スモークテスト**  
   検索、会員、ほしっとく、ホシっといて、セラー、4モール送客を確認する。
4. **GAS/Drive/Spreadsheet本番確認**  
   取込、Archive、Error、Log、triggerの運用継続性を確保する。
5. **LINE Messaging API本番完了**  
   LINE Loginとは別にSecret/Webhook/4言語返信を受入確認する。
6. **SP-API 3テナント同期確認**  
   商品鮮度とセラー横断検索の正確性に直結する。
7. **MYWATCH実配信確認**  
   実装済みロジックを実運用の通知品質へつなげる。
8. **SNS認証・審査・運用再開**  
   X/Instagram/TikTokは権限が揃った順に承認制で有効化する。
9. **Chrome Web Store準備**  
   privacy/support/store copyを確定してから公開する。
10. **商標・handle・ネイティブアプリ判断**  
    大規模集客やストア投資の前に経営判断する。

## 10. 次の担当者向け短縮引継ぎ

### 現状

HOSHILUはCloudflare上のWeb/PWA、D1商品検索、GAS取込、会員、セラー、MYWISH/MYWATCH、SNS、Chrome拡張までコード化されている。公開URLは`https://hoshilu.app/`。ソースの正は`https://github.com/t-ooku/P-GATE`。

### 残課題

- 本番Worker/D1/GASとGitHubソースの一致。
- LINE Messaging、SP-API、MYWATCH通知の本番受入。
- X/Instagram/TikTokの権限・審査・Secret。
- Chrome Store、商標、handle、ネイティブ判断。

### 注意事項

- SecretをGitHubやチャットへ貼らない。
- HOSHILUは公開名、Project GATE/P-GATEは内部互換名。
- 互換キーやインフラ名を一括変更しない。
- 本番deploy前に全テスト、D1 migration、rollback先を確認する。

### 次にやること

1. Cloneし、対象ブランチとPR #2を確認。
2. `npm test`を実行。
3. Cloudflareの権限、D1、Secret項目を確認。
4. 本番とGitHubのsource versionを照合。
5. GAS/Drive/Spreadsheet/triggerを確認。
6. LINE/SP-API/MYWATCHの受入試験。

## 11. 完了確認

この文書をGitHubへPushした直後に更新・確認する。

- [x] GitHubへ保存可能なソース、資料、テスト、公開素材を追跡している。
- [x] 秘密情報の値を文書へ記録していない。
- [x] 監査開始時の未Pushコミットは0件。
- [x] Gitコンフリクトなし。
- [x] 全回帰テスト成功。
- [x] GitHub CLIの認証完了。
- [x] この引継ぎ書のコミット・Push完了（初回コミット`4d5c416`）。
- [x] PR #2の作業ブランチへ反映。
- [ ] 新PCで実Cloneしての実機確認。
- [ ] 手動移行項目の担当者・保管場所確認。

### 手動でしか移行できないもの

- 各サービスへのログイン、2FA、組織・アプリ・プロジェクト権限。
- Cloudflare Worker Secrets。
- GAS Script Properties。
- Google Drive/Spreadsheetの実データと共有権限。
- Power Automate Desktop Flowと接続。
- Windows Task Scheduler。
- OneDrive/Google Drive for desktopの同期フォルダ。
- LINE/Amazon/楽天/Meta/X/TikTok/ResendのDeveloper設定。
- VS Code/Codex/ブラウザのログインや個人設定。

### 移行可否

GitHubからコードを取得してビルド・テストを再開することは可能。  
本番運用を完全再開するには、上記の手動項目と各サービス権限を新PCで確認する必要がある。  
旧PCを処分・初期化するのは、新PCでClone、テスト、Cloudflare、GAS/Drive、主要外部サービスのログイン確認が完了した後にする。
