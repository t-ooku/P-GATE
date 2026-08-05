# HOSHILU 教師データ基盤 設計書 v1.0（2026-08-05）

## 0. 経緯・位置づけ

CTO指示書 v3.0（2026-08-05）を受け、[Vol.2 Stage2](HOSHILU_SEARCH_PIPELINE_VOL2_DESIGN_2026-08-05.md)の実装を一旦保留し、本基盤を優先する。

方針転換の要旨：HOSHILUは「毎日検索精度が向上するサービス」へ変更する。検索品質はコード（正規表現・辞書の直接編集）ではなく、**教師データ（GPTが日次で作成し、Cloudflare D1へ蓄積する構造化データ）**によって育てる。教師データはコードへ埋め込まない。

本書はTeacher Dataset基盤（D1スキーマ・JSON仕様・取り込みロジック・日次運用・ロードマップ）の設計と、今回実装した範囲・実装しなかった範囲の記録である。Business仕様（料金・優先出品・大量商品対応）は別紙 [HOSHILU_BUSINESS_MODEL_v1.1.md](HOSHILU_BUSINESS_MODEL_v1.1.md) を参照。

## 1. 全体アーキテクチャ

```
GPT(CTO)
  │ 日次50〜100件の教師データをJSON化
  ▼
teacher-dataset.schema.json でスキーマ検証
  │
  ▼
validateTeacherDatasetBatch()  ─── 不正レコードは除外・レポートへ記録
  │
  ▼
diffAgainstExisting()  ─── content_hash(query_text+category+locale)でD1と突合、重複は除外
  │
  ▼
teacher_queries へ INSERT（status='PENDING'） + teacher_validation へ1行（バッチの版）
  │
  ▼
npm test（既存の回帰テスト一式）
  │
  ├─ PASS → recordRegressionResult(status:'PASS') → 該当batch_idのPENDINGを一括ACTIVEへ昇格
  └─ FAIL → PENDINGのまま。本番の検索ロジックからは参照されない
  │
  ▼
（将来・今回未接続）query-structurer.mjs / hard-filter.mjs 等が
  ACTIVEなteacher_queries/teacher_rulesを「読むだけ」の関係で参照する
```

`src/search-quality/` 配下に既存の `query-structurer.mjs`／`hard-filter.mjs`／`two-stage-ranking.mjs` があり、[Vol.2設計書](HOSHILU_SEARCH_PIPELINE_VOL2_DESIGN_2026-08-05.md)が指摘した「未接続の構造化クエリ基盤」と同じ場所に teacher dataset のコードを置いた。Vol.2再開時、教師データはこの基盤の主要な入力源になる想定。

## 2. D1スキーマ

`tools/line-worker/migrations/0033_teacher_dataset.sql`（binding: `PRODUCT_DB`、既存の`hoshilu-products`データベース）。

### 2-1. `teacher_queries`（検索文単位の教師データ本体）

| 列 | 型 | 用途 |
|---|---|---|
| `entry_id` | TEXT PK | `tq_` + content_hash先頭16桁。内容が同じなら常に同じIDになる |
| `content_hash` | TEXT UNIQUE | `sha256(normalize(query_text)+category+locale)`。重複除外の実体 |
| `query_text` | TEXT | 検索文（原文） |
| `locale` | TEXT | `ja/en/ko/zh/mixed` |
| `persona` | TEXT | `child/elderly/foreign/general`（★追加項目、§6参照） |
| `user_intent`/`ideal_answer`/`reason`/`category` | TEXT | CTO指示書の必須項目 |
| `search_terms_ja/en/ko/zh` | TEXT (JSON配列) | モール検索語 |
| `excluded_conditions` | TEXT (JSON配列) | 除外条件 |
| `confidence` | REAL 0-1 | 信頼度 |
| `actual_ctr`/`actual_cvr`/`actual_search_success_rate` | REAL, NULL可 | 将来項目。計測基盤ができるまでNULL |
| `source` | TEXT | `gpt_cto/search_log_derived/manual_verified` |
| `status` | TEXT | `PENDING/ACTIVE/REJECTED/SUPERSEDED` |
| `batch_id` | TEXT | どの日次バッチで登録されたか |
| `authored_date`/`authored_updated_date` | TEXT | GPTが起票・更新した日（D1登録日時とは別） |
| `created_at`/`updated_at` | TEXT | D1登録・更新の実時刻 |

### 2-2. `teacher_rules`（教師データから一般化されたルール）

個々の検索文（`teacher_queries`）から、複数の検索文に共通するパターン（同義語・カテゴリ対応・属性推定・除外・ペルソナ特有の言い回し）を一般化したもの。`derived_from_entry_ids`で由来する`teacher_queries.entry_id`を保持し、由来を追跡可能にする。**今回は器のみ実装し、`teacher_queries`からの自動一般化ロジックは未実装**（§11参照）。

### 2-3. `teacher_trends`（トレンド・季節性シグナル）

GPTが観測した「今伸びているカテゴリ・キーワード」を日付単位で記録する。`(trend_date, category, trend_keyword)`をUNIQUEとし、同じ観測の重複登録を防ぐ。

### 2-4. `teacher_validation`（バッチの版元帳）

新しいバッチを取り込むたびに1行増える。`batch_id`をUNIQUEとし、これが「バージョン管理」の実体になる。`regression_test_status`が`PASS`になるまで、そのバッチのレコードは`PENDING`のまま本番へ影響しない。

独立の「バッチ管理テーブル」は追加しなかった。`teacher_validation`が1バッチ=1行の元帳を兼ねるため、5つ目のテーブルを作ると責務が重複すると判断した。

## 3. D1差分更新の設計（②の実現方法）

CTO指示書の3条件をどう満たすかを明示する。

- **毎日追加・全件更新禁止**：`ingestTeacherDatasetBatch()`は`INSERT`のみを発行する。既存行への`UPDATE`は`recordRegressionResult()`によるステータス遷移（`PENDING→ACTIVE`）と、その対象は「今回のbatch_idかつPENDING」に限定されており、他バッチの行を書き換えることはない。
- **追加分だけ登録・重複除外**：`content_hash`を`SELECT ... WHERE content_hash IN (...)`でD1と突合し、既存分とバッチ内重複の両方を除外してから`INSERT`する（[teacher-dataset-ingest.mjs](../tools/line-worker/src/search-quality/teacher-dataset-ingest.mjs)の`diffAgainstExisting()`）。CLI経由でSQLファイルを生成する場合も、`INSERT OR IGNORE`＋`content_hash UNIQUE`制約により、D1適用時点で二重に重複が防がれる。
- **バージョン管理**：`batch_id`と`teacher_validation`が版の単位。`status`列の`PENDING→ACTIVE`が「そのバージョンが有効化されたか」を表す。ロールバックは`status`を`SUPERSEDED`へ更新する運用を想定（実装は今回のスコープ外）。

## 4. Teacher Dataset JSON仕様（③）

[`evaluation/teacher-dataset.schema.json`](../tools/line-worker/evaluation/teacher-dataset.schema.json)。CTO指示書の最低項目をすべて含む。

必須：`query_text`／`user_intent`／`ideal_answer`／`reason`／`category`／`search_terms`（`{ja,en,ko,zh}`のオブジェクトへ統合。個別4フィールドではなく`understood.search_keywords`（[Search API設計](HOSHILU_SEARCH_API_SPEC_2026-08-05.md)）と同じ形にした）／`excluded_conditions`／`confidence`／`authored_date`／`authored_updated_date`。

将来項目：`actual_ctr`／`actual_cvr`／`actual_search_success_rate`（デフォルトnull）。

**設計時に追加した項目**：`locale`（query_text自体の言語。ローマ字・多言語混在は`mixed`）と`persona`（`child/elderly/foreign/general`）。CTO指示書⑤⑥⑦（子ども・高齢者・外国人検索への対応）を「実際にカバーできているか」を集計・検証可能にするために必要と判断し追加した。他の項目は指示書の記載どおり。

サンプル: [`evaluation/teacher-dataset/format-example-batch.json`](../tools/line-worker/evaluation/teacher-dataset/format-example-batch.json)（9件、子ども/高齢者/外国人ペルソナを含む。**GPTが作成した実バッチではなく、フォーマット確認・テスト用のサンプル**であることをREADMEに明記した）。

## 5. 日次運用フロー（④）

1. GPTが50〜100件のJSONを作成する。
2. `evaluation/teacher-dataset/YYYY-MM-DD-batch-NNN.json`として追加する。
3. `npm run ingest:teacher-dataset -- <path> <batch-id>` を実行する。スキーマ検証・content_hash算出・within-batch重複除外・`INSERT OR IGNORE`のSQLファイル生成・レポートJSON生成を行う。**この時点ではCloudflareへ一切接続しない**（ローカルのファイル生成のみ）。
4. `npm test`（902件の既存回帰テスト一式）を実行し、壊れていないことを確認する。
5. バッチJSON・生成SQL・レポートをコミットし、GitHubへ保存する。
6. 生成SQLをCloudflare D1へ適用する（`wrangler d1 execute PRODUCT_DB --remote --file=...`）操作は、**別途の明示的な承認を得てから実施する**。今回の指示書「Cloudflareへのデプロイ禁止」の対象。

## 6. ペルソナカバレッジ（⑤子ども／⑥高齢者／⑦外国人）

`persona`列と`locale`列により、後から`SELECT persona, COUNT(*) FROM teacher_queries GROUP BY persona`のような集計でカバレッジを検証できる。サンプルバッチには指示書に列挙された例（「ぴかぴかするイヤホン」「ゲームにつなぐやつ」「透明なやつ」「テレビに映すやつ」「充電する線」「軽い掃除機」等）と、ローマ字・韓国語混在の外国人検索例を含めた。

ultra_ambiguousな例（「ゲームにつなぐやつ」「透明なやつ」「テレビに映すやつ」）は`ideal_answer`に断定ではなく確認質問を入れている。カテゴリを一意に確定できない検索文に断定的な`ideal_answer`を与えると、教師データそのものが誤学習の原因になるため。

## 7. 検索ログからの抽出（⑧）— 設計のみ、未実装

「検索ログから匿名化した失敗検索／再検索／曖昧検索を抽出できる構造を設計する」ことが指示書の要求であり、実装は要求されていない。加えて、既存の[Search API設計](HOSHILU_SEARCH_API_SPEC_2026-08-05.md)・`/api/knowledge`は「質問本文をサーバーログへ保存しない」方針を明言しており、`redactSearchPersonalData`前提のこの方針と矛盾しない形で設計する必要がある。実際に確認した限り、既存の`unmet_demand_events`／`growth_events`もハッシュのみを保持し原文を保存していない。

2案を提示する。実装判断（法務・プロダクト側の同意）が必要なため、今回はテーブルを作成していない。

**案A（推奨・原文非保存）**：`search_signal_events`（未作成）に、`event_type`（`zero_result`／`refined_within_60s`／`clarify_shown`）・`category`（判定できた場合のみ）・`locale`・`occurred_at`をハッシュ化なしの匿名集計として記録する。原文は一切保存しない。GPTはこの集計（「このカテゴリでzero_resultが多い」等の傾向）を見て、翌日の教師データを起票する材料にする。既存の`traffic_class`（QA/ATTRIBUTED/UNATTRIBUTED）の枠組みをそのまま踏襲できる。

**案B（要・同意フロー変更）**：ユーザーが明示的に同意した場合のみ、原文を`teacher_candidate_queries`（要人手レビュー用の仮テーブル、未作成）へ一時保存し、人手確認後にPIIが無いことを確認してから`teacher_queries`へ昇格する。既存の「質問本文を保存しない」というUI上の約束を変更する必要があるため、プロダクト・法務判断が前提。

現時点では案Aを基本方針として次フェーズで設計・実装し、案Bは製品要件確定後に再検討することを推奨する。

## 8. Business仕様（⑨⑩⑪）との関係

料金・優先出品・大量商品向け一括設定は、教師データ基盤とは独立した仕様であり、別紙 [HOSHILU_BUSINESS_MODEL_v1.1.md](HOSHILU_BUSINESS_MODEL_v1.1.md) にまとめた。Business プランの「AI改善提案」「市場分析」機能は、将来的に`teacher_trends`／`teacher_rules`を参照する設計になる可能性が高いが、今回はテーブル定義のみで、その接続は未実装。

## 9. 実装ロードマップ

| Stage | 内容 | 状態 |
|---|---|---|
| 0 | Vol.2 Stage2実装（保留） | 一時停止 |
| 1（今回） | D1スキーマ・JSON仕様・取り込みロジック・CLIの作成 | 完了（Cloudflareへは未反映） |
| 2 | 生成SQLをCloudflareへ実際に適用する運用の確立（承認フロー含む） | 未着手 |
| 3 | GPTによる日次バッチの本運用開始（50〜100件/日） | 未着手 |
| 4 | `teacher_queries`（ACTIVE）を`query-structurer.mjs`等の既存検索パイプラインへ実接続 | 未着手。Vol.2再開時の主要な統合ポイント |
| 5 | §7案Aの匿名検索シグナル抽出を実装し、教師データ起票のフィードバックループを閉じる | 未着手（要判断） |
| 6 | `teacher_rules`の自動一般化（複数`teacher_queries`から共通パターンを抽出） | 未着手 |

## 10. 影響ファイル

### 新規追加
- `docs/HOSHILU_TEACHER_DATASET_SPEC_v1.0.md`（本書）
- `docs/HOSHILU_BUSINESS_MODEL_v1.1.md`
- `tools/line-worker/migrations/0033_teacher_dataset.sql`
- `tools/line-worker/evaluation/teacher-dataset.schema.json`
- `tools/line-worker/evaluation/teacher-dataset/README.md`
- `tools/line-worker/evaluation/teacher-dataset/format-example-batch.json`
- `tools/line-worker/src/search-quality/teacher-dataset-ingest.mjs`
- `tools/line-worker/scripts/ingest-teacher-dataset-batch.mjs`
- `tools/line-worker/test/teacher-dataset-ingest.test.mjs`

### 変更
- `tools/line-worker/package.json`（`ingest:teacher-dataset`スクリプト追加）
- `docs/HOSHILU_SEARCH_PIPELINE_VOL2_DESIGN_2026-08-05.md`（Stage2保留の状態注記を追記）

## 11. 未実装項目（今回のスコープ外、指示書どおり）

- Business画面／決済／Premium画面／Search API実装（指示書で明示的に除外）
- 生成SQLをCloudflare D1へ実際に適用する操作（`wrangler d1 execute --remote`は未実行、マイグレーション自体も未apply）
- `teacher_queries`（ACTIVE）を`query-structurer.mjs`等へ実接続するコード（テーブルへ書き込むところまでで、読み出して検索精度へ反映する経路は未実装）
- `teacher_rules`の自動一般化ロジック
- §7の検索ログ匿名化抽出（案Aも案Bも未実装、設計のみ）
- 認証付きの取り込みAPIエンドポイント（`src/index.mjs`へのルート追加）。現状はCLIでSQLファイルを生成する運用のみ

## 12. 推奨次ステップ

1. 本書とBusiness仕様書のレビュー（特に§7の案A/B判断、Business v1.1と既存v0.2の整合方針）
2. 承認後、マイグレーション`0033`をCloudflare D1へapply（別途明示的な承認が必要）
3. GPTから実際の日次バッチ（50〜100件）を受け取り、CLIで検証・SQL生成する運用を1回試す
4. Vol.2 Stage1（`query-structurer.mjs`拡張）を、教師データをどう参照するかも含めて再設計してから再開する
