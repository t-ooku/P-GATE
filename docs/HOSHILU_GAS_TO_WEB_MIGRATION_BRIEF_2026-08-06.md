# HOSHILU GAS→Web移行 指示書（Claude向け）

更新日: 2026-08-06
対象: 今後Claudeにこのリポジトリで「GAS機能をWeb版へ寄せる」作業を依頼するときに読ませる指示書
前提調査: `gas/*.gs`、`tools/line-worker/src/*.mjs`、`docs/`配下の実装・仕様突き合わせに基づく（推測ではなく実装確認済み）

## 0. 最初に理解すること

HOSHILUは「GASを廃止してWeb版に一本化する」プロジェクトではない。現状は次の2系統が**橋渡しされて動いている1つのシステム**である。

- **GAS側**（`gas/`、Google Sheets/Driveが正本）: 商品マスター取込・検証・契約ポリシー・匿名ベンチマーク・LINE回答生成・多言語表記承認・SNSレビューキュー
- **Web側**（`tools/line-worker/`、Cloudflare Worker + D1、`hoshilu.app`で稼働中）: 商品検索（D1 FTS）、会員・お気に入り、セラーポータル、SP-API同期、LINE通信、成長分析

この2つは次の経路で常時通信している。移行作業でこの経路を壊すと本番のLINE応答・PWA検索が止まる。

| 方向 | 経路 | 用途 |
|---|---|---|
| GAS→Worker（push, 非同期, ベストエフォート） | `gas/ProductIndexSyncEngine.gs` → `POST /api/internal/products/sync` | Master_Databaseの差分をD1 `products`へ反映 |
| GAS→Worker（push, 非同期） | `gas/UnmetDemandEngine.gs` → `POST /api/internal/unmet-demand/sync` | 取込不可・キャンセル理由の匿名集計をD1へ反映 |
| Worker→GAS（pull, 同期, リクエスト内） | `tools/line-worker/src/index.mjs`の`callGas()` → GAS `doPost`（`gas/LineIntegration.gs`） | LINEイベント処理、PWA検索のGASフォールバック、KPIトラッキング(`TRACK`) |

`index.mjs`のPWA検索は現在、D1索引検索とGAS(`KNOWLEDGE`)を`Promise.allSettled`で競わせ、D1に十分な候補があればD1を優先し、無ければGASにフォールバックする実装になっている。**これは「移行中」であることの直接的な証拠であり、この設計を壊さず段階的に置き換えるのが正しい進め方。**

## 1. 絶対に守るガードレール

- `docs/MYGATE_to_HOSHILU_REBRAND_ADDENDUM_v5.1.md`により、互換フェーズ中は`mygate_*`、Project GATE、GASシート名、Worker名を見た目統一のためだけにリネームしない。
- `docs/HOSHILU_PC_HANDOFF_2026-07-29.md`により、Sheets/Driveの業務データとD1は「GitHubから再生成できない運用データ」として別管理する。D1をSheetsの代わりと決めつけて片方を消す作業をしない。
- `docs/HOSHILU_SEARCH_API_SPEC_2026-08-05.md`の原則を破らない：AIに商品URL・価格・在庫を生成させない。生成・検証はHOSHILU（Worker）側のみ。
- `docs/HOSHILU_COMMAND_GOVERNANCE_2026-08-02.md`により、外部公開・SNS投稿・有料施策・契約・認証変更・Secret登録・本番同期は大久津さんの承認後に行う。
- README/`HOSHILU_AI_SEARCH_V2_SPEC`共通の開発ルール：テスト失敗中は本番デプロイしない。GitHub保存→ローカル取得→テスト→本番デプロイ→実機確認の順で進める。
- `callGas()`のフォールバック経路（LINE応答・PWA検索・KPIトラッキング）を、対応する機能がWeb側で確認済みになるまで先に削除しない。

## 2. Web版だけでは完結しない箇所（移行不可・要判断）

**商品マスターZIPの取込経路**（`Project_GATE_Bridge.ps1` → Google Drive → `gas/ImportEngine.gs`/`ZipEngine.gs`/`DriveService.gs`）は、サードパーティのWindowsデスクトップ出品ツールがローカル/OneDriveフォルダにZIPを書き出す仕組みに依存している。これはGASの制約ではなく、上流ツールがローカルファイル出力しかできないことに起因する制約。

対応不能なので、Claudeに以下を勝手に判断させない。ユーザーへの確認事項として扱う：

1. 上流ツールがAPI/webhook/クラウドアップロードに対応する予定があるか（あればR2やWorker宛エンドポイントへ直接送信し、Windows Bridge自体を廃止できる）
2. 対応予定が無ければ、Windows Bridge＋GAS ZIP取込は当面維持する前提で計画する

## 3. 責任領域ごとの移行方針

| GAS機能 | 現状 | 移行方針 |
|---|---|---|
| `ProductIndexSyncEngine.gs` / `UnmetDemandEngine.gs`のpush部分 | 既にWorker/D1へブリッジ済み | 変更不要。参考実装として他エンジンの移植パターンに使う |
| `ContractPolicyEngine.gs`（競合排他・カテゴリ独占判定） | Worker未実装、`KnowledgeEngine`から同期呼び出し | 優先度高。D1にcontract/policyテーブルを新設し、Worker内にロジック移植。移植完了後に`index.mjs`のKNOWLEDGE経路からGAS呼び出しを外せる |
| `KnowledgeEngine.gs`（トークン一致検索＋根拠付き回答） | D1 FTS検索(`product-index-v2.mjs`)と機能競合中、GASはフォールバック | ContractPolicy移植が終わるまではフォールバックとして残す。D1側の再現率がGAS版に追いついたことをテストで確認してから依存を外す |
| `MultilingualSeoEngine.gs`（表記ゆれ承認テーブル） | Sheetsを承認UIとして使用、Worker側に相当データモデル無し | Sheetsの「承認チェック」運用を代替する管理画面をWorker側（admin-*.mjs系）に新設する必要あり。UI設計を先に決めてから着手 |
| `BenchmarkEngine.gs` / `MeasurementEngine.gs` / `MarketplaceMeasurementEngine.gs`（契約別KPI・匿名ベンチマーク） | Worker側の`growth-events.mjs`等はB2C成長指標で別物、B2B契約KPIのデータモデルが無い | 優先度中。D1にAccount/Campaign/Experiment概念を持つスキーマを新設しないと移植できない。既存のB2C成長分析と混同しない |
| `SocialKnowledgeEngine.gs`（SNSコメントのPII除去・モデレーション・レビューキュー） | Worker側は投稿実績集計のみで受信コメント処理は無し | 優先度低。レビューキューUIが要る点は多言語承認と同種の課題 |
| `ProductIdentifierEngine.gs`（JAN/EAN/UPC↔ASIN） | チェックディジット計算は移植容易、承認ワークフローがSheets依存 | 検証ロジックのみ先にWorker側ユーティリティとして移植可。承認ワークフローは管理画面が必要 |
| `PreflightEngine.gs` | GAS側だけを自己点検、Worker側は`index.mjs`内で別途自己点検 | 統合診断は無くても実害は小さい。優先度低 |
| `Project_GATE_Bridge.ps1` / ZIP取込 | 移行不可（§2参照） | ユーザー確認待ち。着手しない |

## 4. 作業を依頼された時の進め方（Claudeへの指示）

1. 着手前に、対象がこの表のどの行かを特定し、依存関係（他エンジン・Sheetsシート名）を`gas/`側の実装で確認する。ドキュメントの記述だけを信用せず、実コードを読んで前提を検証する。
2. 新しいD1テーブルが必要な場合は`tools/line-worker/migrations/`に追加し、既存の`products`/`import_restriction_knowledge`と命名・型を揃える。
3. Workerにロジックを実装したら、`index.mjs`の`callGas()`呼び出しは**即座に削除せず**、既存のD1優先・GASフォールバックのパターン（`Promise.allSettled`＋優先順位判定）に倣って並走させる。
4. 移植した機能について回帰テストを`tools/line-worker/test/`に追加する。既存テストと`docs/HOSHILU_AI_SEARCH_V2_SPEC_2026-08-04.md`が定める「テスト失敗中は本番デプロイしない」原則に従う。
5. GAS側の呼び出しを完全に外す判断（フォールバック除去）は、Web側で十分な期間・十分なテストで再現性が確認できてから、ユーザーの承認を得て行う。無断でGAS依存を削除しない。
6. Sheetsを承認UIとして使っている機能（多言語表記、SNSレビュー、商品コード承認）を移植する場合は、先に管理画面のUI/権限設計をユーザーと合意してから実装に入る。Sheetsの「誰でも一目で編集できる」利便性を失わない設計にする。
7. 本番同期・Secret登録・外部公開に関わる変更は、実装後もデプロイ前に必ずユーザー確認を取る（§1のガードレール参照）。

## 5. 非対象（このドキュメントの範囲外）

- Windows Bridge / ZIPインポート経路の廃止・置き換え（§2の確認が取れるまで着手しない）
- Google SheetsをSSoTから外す決定（監査証跡としての役割をD1が代替する設計が無い限り不可）
- 既存の10モール検索・4言語UI・署名付き`/go`トラッキングリンクの仕組みの変更（`HOSHILU_AI_SEARCH_V2_SPEC`の開発ルールで明示的に禁止）
