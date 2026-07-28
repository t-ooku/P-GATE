# HOSHILU Web版Codex向け最新引継ぎ書

最終実体確認: 2026-07-28 JST
公開ブランド: **HOSHILU（ホシル）**
内部プロジェクト: Project GATE / P-GATE
GitHub: `https://github.com/t-ooku/P-GATE`
本番: `https://hoshilu.app/`

> 本書はローカルファイル、`git fetch origin`後のGit状態、本番Cloudflare/D1、SNS投稿結果を確認して更新した。Google Drive、GAS、Spreadsheet、PADの現在画面を直接確認できない項目は「未確認」とした。

## 0. 安全状態

- branch: `agent/mygate-v5-itg-phase0`
- HEAD: `ac7713e64e2af8115d0f9635ad9808245d6cb973`
- 同名GitHub branchとahead/behind `0/0`。
- GitHub既定branchは`main`、確認時の先頭は`20a990eea07622c1e996c19a40234c7983023c86`。
- 2026-07-23以降の大規模実装がローカル未コミットで、本番実装はGitHubの現branchより進んでいる。
- dirty treeはデスクトップ版が所有する。Web版は「同時編集禁止」対象を変更しない。

## 1. 目的、事業構想、確定仕様

HOSHILUは、商品名や検索語が分からない「欲しい」を、見た目、見た場所、用途、条件、曖昧な記憶から検索可能な言葉へ変換し、発見、保存、条件監視、購入先比較まで支援する。

| 役割 | 公開名称 | 内部・旧名称 |
|---|---|---|
| 曖昧検索 | ホシル | MYCONCIERGE / Knowledge |
| 保存 | ほしっトク | MYWISH |
| 条件監視 | ホシっといて | MYWATCH |
| セラー分析 | HOSHILU INSIGHT | MYTREASURE |

- Brand line: `欲しいを、ちゃんと見つける。`
- Habit line: `気になったら、ほしっトク。`
- ITG/ITT/MC2の商品を共通索引へ取り込み、テナント境界を維持する。
- SNSは広告兼、匿名の未充足需要を集める参加型リサーチチャネル。
- Master Specは`docs/MYGATE_Master_Spec_v5.0.md`。公開名称は`docs/MYGATE_to_HOSHILU_REBRAND_ADDENDUM_v5.1.md`が優先。

## 2. 正式名称と旧名称・内部名称

| 名称 | 扱い |
|---|---|
| HOSHILU / ホシル | 正式名称 |
| MYGATE | 旧公開名称。移行説明・履歴・互換性説明以外では新規使用しない |
| P-GATE | リポジトリ、配布物など既存内部名称 |
| Project GATE | GAS、Bridge、コード上の内部プロジェクト名 |
| MYCONCIERGE等 | 保存データ・履歴・内部名として維持し、公開UIでHOSHILU名へ変換 |

## 3. 名称変更状況

### 変更済み

- 本番Web、PWA、主要ナビ、privacy/terms、`hoshilu.app`。
- Chrome拡張の公開表示、主要アイコン、4言語。
- Instagram/Xプロフィールと新規公開投稿。
- `docs/brand/`、HOSHILUプロフィール・OGP素材。

### 変更可能

内容確認後に更新可能:

- `marketing/social/README.md`
- `marketing/social/MYGATE_*.md`、`MYGATE_30_DAY_LAUNCH_QUEUE.csv`
- `marketing/social/SELLER_SOCIAL_SUPPORT_PLANS_v1.0.md`
- `marketing/social/ITG_3_STORE_PARTNER_LAUNCH_v1.0.md`
- `marketing/rights/MYGATE_POSTING_ASSET_PACK_SPEC_v1.0.md`
- 旧MYGATE表記の`marketing/social/creatives/01_*`〜`03_*`
- `gas/LineIntegration.gs`のユーザー向けP-GATE挨拶。

### 変更非推奨

互換性確認なしに変更禁止:

- GitHub/フォルダ名`P-GATE`
- GASプロジェクト、`Project_GATE_Complete*.gs`
- Worker名`project-gate-line-bridge`
- npm package、Windows Bridge、Task Scheduler名
- `mygate_session_id`、`mygate_language`、`mygate_wishes`
- Spreadsheet sheet名、Script Properties、analytics event、履歴データ
- 配布ZIP名、過去仕様・監査・release notes

### 要調査

- GAS画面上のプロジェクト名・deploy版、Drive親folder名、Spreadsheet名/メニュー。
- LINE表示名、rich menu、実機返信文。
- `gas/MeasurementEngine.gs`既定source`P-GATE`の分析継続性。
- 旧SNS資料を履歴凍結するかHOSHILU版へ更新するか。

## 4. 実装済み機能

- JA/EN/ZH/KOのPWA、responsive Web、音声入力、install導線。
- 曖昧検索、最小確認質問、条件追加、根拠不足時の断定抑制。
- ITG/ITT/MC2横断索引、ASIN統合、最大10候補、PC carousel/mobile swipe。
- ほしっトク匿名/会員同期、再検索、条件変更、削除。
- ホシっといてINSTANT/DAILY/WEEKLY/MUTED、通知、既読、retry、audit。
- LINE Login、メール会員、seller認証とtenant/plan境界。
- Amazon/楽天/Yahoo!購入先、署名送客、承認済み購入先優先。
- SP-API 3tenant分離、cursor、audit、増分/日次full scan設計。
- 未充足需要、輸入制限Knowledge、HOSHILU INSIGHT基盤。
- D1 migrations `0001`〜`0011`。
- SNS queue、承認、Cron、X/Instagram/TikTok publisher、共有導線/KPI。
- Chrome拡張4言語、PWA handoff。
- Windows Bridge、GAS ZIP取込、冪等、Master DB、Opportunity、Archive/Error移動。
- `03_Archive`の30日超ZIPを最大500件/回でDriveゴミ箱へ移す保守処理。

## 5. 作業中機能・対象・現在地点

### SNS自動投稿

対象:

- `tools/line-worker/src/social-publisher.mjs`
- `tools/line-worker/test/social-publisher.test.mjs`

状態:

- OAuth1.0aをstale bearerより優先する修正と回帰テスト8/8 PASS。
- Worker本番Version `cbf5926d-01bd-4cd4-b6aa-c63d2d5ef482`へ反映。
- OAuth1.0a資格情報自体もXから401。X API資格情報再発行は未完了。
- X投稿2件は公式画面から手動公開し、D1へ外部ID保存済み。

### Instagram当日投稿

対象:

- `marketing/social/creatives/04_want_poll_1080x1350.svg`
- `tools/line-worker/public/social/instagram-want-poll-v1.png`

状態:

- 1080×1350画像作成・目視確認済み。
- 公開済み: `https://www.instagram.com/hoshilu.app/p/DbVodqagSZP/`
- D1 `launch01-want-poll`はPUBLISHED。
- Instagram Webがキャプション編集を保存せず、画像内に匿名集計告知はあるがcaptionは空の可能性が高い。
- PNGはローカル保存。Worker assetとしての再deployは未実施。

### 大規模ローカル実装

検索、会員、SP-API、seller、MYWATCH、SNS、多言語、Chrome実装が大量に未コミット。個別の過去テストは合格だが、現在のdirty tree全体で2026-07-28に統合テストを実行し、全件PASS。

## 6. 未実装・未完了と優先順位

1. dirty treeを機能単位に監査、テスト、分割commit/push。
2. X Developer権限/資格情報を再発行しAPI投稿を再試験。
3. Instagram画像を公開HTTPS assetへ置きAPI投稿受入試験。
4. 残りInstagram/TikTok用の権利確認済み画像作成。
5. TikTok Content Posting API、`video.publish`、監査、Secret。
6. 最新GAS/DriveMaintenanceを実GASへ反映しdry-run/trigger確認。
7. SP-API 5 Secretと3account本番同期。
8. LINE Messaging API 4言語実機。
9. PWA通知、Chrome extension実機/Store。
10. 商標、domain、SNS handles、support URL。

## 7. 最新ディレクトリ構成

```text
P-GATE/
├─ .github/workflows/   GitHub Actions
├─ benchmarks/          ITG gold set/評価
├─ dist/                GAS結合版/生成物
├─ docs/                仕様/運用/監査/引継ぎ
│  └─ brand/            HOSHILU brand
├─ gas/                 GAS分割source
├─ marketing/           SNS/rights/creative
├─ outputs/             release生成物
├─ tests/               root/GAS/brand tests
└─ tools/
   ├─ chrome-extension/
   ├─ line-worker/{migrations,public,src,test}/
   └─ windows-bridge/
```

## 8. 主要ファイルの役割

| ファイル | 役割 |
|---|---|
| `docs/MYGATE_Master_Spec_v5.0.md` | Master Spec |
| `docs/MYGATE_to_HOSHILU_REBRAND_ADDENDUM_v5.1.md` | HOSHILU名称決定 |
| `docs/HOSHILU_PROGRESS_2026-07-24.md` | 本番/評価証拠 |
| `docs/HOSHILU_OVERNIGHT_HANDOFF_2026-07-26.md` | 環境間引継ぎSSoT |
| `tools/line-worker/src/index.mjs` | Worker routing/health/Cron統合 |
| `tools/line-worker/src/search-*.mjs` | 検索判断/evidence policy |
| `tools/line-worker/src/member-*.mjs` | 会員/ほしっトク |
| `tools/line-worker/src/mywatch-*.mjs` | ホシっといて |
| `tools/line-worker/src/social-publisher.mjs` | SNS承認/投稿/state |
| `tools/line-worker/src/sp-api-*.mjs` | SP-API同期 |
| `tools/line-worker/public/app.js` | PWA UI |
| `gas/Main.gs` | ZIP取込orchestration |
| `gas/DriveMaintenanceEngine.gs` | Archive保持 |
| `dist/Project_GATE_Complete.gs` | GAS安定名結合版 |
| `tools/build_bundle.js` / `tools/release.js` | bundle/release生成 |
| `tools/windows-bridge/Project_GATE_Bridge.ps1` | PC ZIP転送 |

## 9. 現在のGit branch

`agent/mygate-v5-itg-phase0`

## 10. 最新commit、日時、GitHub反映

本書作成時の実装基準HEAD（本書自身の保存commit前）:

- `ac7713e64e2af8115d0f9635ad9808245d6cb973`
- `2026-07-22T19:04:36+09:00`
- `docs: promote verified ITG Phase0 checks`
- 同名remote branchへpush済み、ahead/behind `0/0`。
- ただし大量のlocal未commit変更はGitHub未反映。
- 本書自身の保存commit IDは自己参照になるため本文には固定せず、Git履歴と最終報告を正とする。

## 11. ローカルのみの未commit変更

追跡済み:

- `dist/Project_GATE_Complete*.gs`
- `gas/KnowledgeEngine.gs`、`Main.gs`、`MarketplaceEngine.gs`
- `docs/MEASUREMENT_SPEC_v1.3.md`、`MULTI_EC_OFFER_SPEC_v1.14.md`
- `tests/release_config.test.mjs`、`tests/run_tests.js`
- `tools/build_bundle.js`、`tools/release.js`
- `tools/chrome-extension/`のREADME、manifest、options、sidepanel、icons、test
- `tools/line-worker/`のindex、app、HTML/CSS、privacy、service worker、manifest、icons、headers、test、wrangler

主な未追跡:

- `benchmarks/`、検索評価文書。
- `docs/HOSHILU_*`、SP-API/SNS/Seller/brand文書。
- `gas/ProductIndexSyncEngine.gs`、`SocialKnowledgeEngine.gs`、`UnmetDemandEngine.gs`。
- `marketing/`一式。
- HOSHILU/i18n/speech/sticky-nav tests。
- D1 migrations `0001`〜`0011`。
- Workerのmember/search/MYWATCH/SNS/SP-API/seller/unmet-demand modules/tests/public assets。
- Chrome `_locales`、i18n、HOSHILU icons。
- 多数の`dist/hoshilu-*-dry-run/`、ZIP、`.tmp-ftfy/`。

## 12. commit済み未push

なし（ahead/behind `0/0`）。

## 13. 動作確認

確認済み:

- 2026-07-26: root/GAS/release PASS、Worker 154 PASS、Chrome 6 PASS、dry-run PASS。
- 2026-07-28: `npm.cmd test`全体PASS。root/GAS、release 4/4、Worker 155/155、Chrome 6/6。social publisher 8/8を含む。Worker deploy成功、X 2件/Instagram 1件手動公開、D1 PUBLISHED確認。

未確認:

- なし。2026-07-28の最新`npm.cmd test`は全件PASS。
- 最新GASを実GASへ反映した状態。
- 7/23以降のPAD定時履歴、DriveMaintenance本番trigger。
- SP-API 3account、LINE 4言語実機、Store提出。

失敗中:

- X API投稿: OAuth2/OAuth1.0aとも401。
- Instagram Web: 公開後caption編集が保存されない。

## 14. 既知不具合・課題・保留

- SNS資格情報/権限不整合、Instagram queueのmedia_url不足、TikTok未設定。
- 本番コードがdirty treeからdeployされ、対応commitがGitHubにない。
- 完成source、一時物、dry-run、生成物が混在。
- 旧MYGATEのSNS資料/画像、公開LINEのP-GATE挨拶が残る。
- Web版はGitHubだけで現本番を再現できない。

## 15. Google Drive、GAS、Spreadsheet

コード/資料で確認:

- Drive: `01_Input_Zip`、`02_Extracted_CSV`、`03_Archive`、`04_Error`、`05_Log`。
- GASはfolder IDs、Spreadsheet ID等をScript Propertiesから読む。
- 正常ZIPはArchive、異常ZIPはError、JSON logは05_Log。
- 5分trigger、1回1ZIP、空振りlog抑制。
- GAS結合版と分割版を同時登録しない。

実環境:

- 2026-07-22監査では3accountがBridge→Drive→GAS→Archiveを完走。
- 現在のDrive画面、GAS deployment、Spreadsheet、trigger一覧は未確認。
- Secret実値をGitHub/文書/Sheetへ保存しない。

## 16. PAD 3account ZIP取得

- Flow `Project_GATE_Access_Auto_Download`が3accountを連続処理した記録あり。
- 各ZIPでBridge→Drive→GAS→Archive→件数増加検知→次accountを完走。
- Archive filter `*customer_support-*.zip`、Task Scheduler毎日5:00との記録。
- 単発完走は確認済み（2026-07-22）。5営業日連続、7/23以降の定時履歴、flow export/秘密除去は未確認。
- PC停止/スリープ中はPAD/Bridgeは動かない。Drive到着済みZIPのGAS処理は継続可能。

## 17. `05_Log`、`03_Archive`、`04_Error`整理

- `03_Archive`: `gas/DriveMaintenanceEngine.gs`実装済み。30日超`.zip`のみ、最大500件/回、Driveゴミ箱。Inputは削除しない。dry-run/production分離、日次3時trigger install関数あり。実GAS反映/triggerは未確認。
- `04_Error`: 異常ZIP移動は実装済み。保持期限/自動削除は未実装または未確認。
- `05_Log`: JSON監査logと空振り抑制は実装。保持期限/自動削除は未実装または未確認。

## 18. SNS、共有カード、多言語

SNS:

- Instagram: brand `17906088525286725`、want poll `DbVodqagSZP`。
- X: phone case `2080936092271038534`、save habit `2082070219728761299`、UV umbrella `2082070510024925592`。
- `launch01-search-demo`は401 FAILED、未承認なので再投稿していない。
- REVIEW_REQUIREDは自動公開しない。TikTok未設定。

共有/多言語:

- HOSHILU OGP、share targets、campaign attribution、X intent、Instagram copy導線あり。
- Web/PWA/ChromeはJA/EN/ZH/KO。LINE 4言語実機は未確認。

## 19. Web版がPCなしで進められる作業

- GitHub branch/PR/Actions/issue確認。
- 本書レビュー、公開URL/SEO/OGP/privacy/terms目視。
- X/Meta/TikTok/LINE Developer不足設定の確認（Secret値は記録しない）。
- 名称残存レビュー/issue化、SNS KPI、商標/handle/store/support URL調査。
- dirty treeがpushされるまで実装ファイルは変更しない。

## 20. デスクトップ版専用作業

- dirty treeの監査、分割、test、commit、push。
- ローカル一時物/生成物/完成sourceの選別。
- PAD、Task Scheduler、Bridge、OneDrive/Drive同期実機。
- GAS bundle生成、Chrome ZIP/実機、画像/dry-run整理。

## 21. 担当分担

| 環境 | 担当 |
|---|---|
| Desktop | dirty tree、GAS、Worker、Chrome、PAD、local生成物、commit/push |
| Web/mobile | GitHubレビュー、online設定監査、公開確認、issue、KPI/市場/商標調査 |

移管時はDesktopが対象をcommit/pushし、本書更新後に明示解放する。

## 22. 同時編集禁止

Desktopが解放するまでWeb版は変更禁止:

- `tools/line-worker/**`
- `tools/chrome-extension/**`
- `gas/**`、`dist/**`、`tests/**`、`benchmarks/**`、`marketing/**`
- 本書、`docs/HOSHILU_PROGRESS_2026-07-24.md`
- `docs/MYGATE_to_HOSHILU_REBRAND_ADDENDUM_v5.1.md`
- root `package.json`、`.github/workflows/**`

読み取り・reviewのみ可。

## 23. 環境切替時の保存・引継ぎ

1. branch/HEAD/status/ahead-behind確認。
2. 対象diff確認、関連test。
3. 完成fileだけ明示stage。
4. commit/pushしGitHub上で確認。
5. 本書の完了/作業中/未保存/次手順/禁止file更新。
6. 移行先へbranch、commit ID、対象file、開始手順を伝える。
7. 移行元は編集停止し、移行先完了まで触らない。

## 24. 次の作業（優先順）

1. Desktop: dirty treeを機能別分類、一時物/生成物を分離。
2. Desktop: 全test、失敗修正。
3. Desktop: SNS修正、member/MYWATCH、search、SP-API/seller、Chromeの順に分割commit/push。
4. Web: X/Meta/TikTok/LINE権限/審査/Secret有無を値なしで確認。
5. Web: 旧MYGATE公開資料の変更候補をissue/reviewとして整理。
6. Desktop: GitHub反映後に本書更新し実装fileをWebへ解放。

## 25. Web版Codex開始プロンプト

```text
HOSHILU（ホシル）のWeb/スマホ側作業を開始してください。

正式名称はHOSHILU（ホシル）です。MYGATEは旧公開名、P-GATE/Project GATEは内部・互換名称です。repoやコード識別子を一括変更しないでください。

GitHub t-ooku/P-GATE の次を最初に確認してください。
- branch: agent/mygate-v5-itg-phase0
- desktop確認時HEAD: ac7713e64e2af8115d0f9635ad9808245d6cb973
- 引継ぎ: docs/HOSHILU_OVERNIGHT_HANDOFF_2026-07-26.md

Desktop側には大量の未commit実装があります。引継ぎ書の「同時編集禁止」は変更せず、読み取りとGitHub/online状態監査だけを行ってください。

担当:
1. GitHub branch/PR/Actions/issue確認
2. hoshilu.app、privacy、terms、OGP、SNSの目視
3. X/Meta/TikTok/LINE Developer不足設定をSecret値なしで確認
4. 旧MYGATE公開表記の変更候補を列挙
5. 商標、SNS handle、Chrome Store support URL調査

コード変更が必要なら対象fileを示し、Desktopから編集権を受け取ってから開始してください。未確認情報は推測せず「未確認」としてください。
```

## 26. 今回の保存範囲

大量の既存dirty treeを完成版扱いせず、本引継ぎ書のみを独立保存候補とする。`gh` CLIは未導入。Git pushは既存Git認証で確認する。
