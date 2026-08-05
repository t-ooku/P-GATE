# HOSHILU 教師データ（Teacher Dataset）バッチ

## このディレクトリの位置づけ

ここに置くJSONファイルは **`teacher-dataset.schema.json`（[../teacher-dataset.schema.json](../teacher-dataset.schema.json)）に準拠した1日分の教師データバッチ**です。教師データはコードへ埋め込まず、常にJSON→Cloudflare D1（`teacher_queries`等）という経路で登録します。詳細設計は [docs/HOSHILU_TEACHER_DATASET_SPEC_v1.0.md](../../../../docs/HOSHILU_TEACHER_DATASET_SPEC_v1.0.md) を参照してください。

## `format-example-batch.json` について

**これは実際のGPT作成バッチではなく、フォーマット確認用のサンプルです。** 子ども・高齢者・外国人（ローマ字/韓国語混在）ペルソナのカバレッジ例を含み、`teacher-dataset-ingest.test.mjs` の入力形状とスキーマの整合を確認する目的で作成しました。日次の実バッチは `YYYY-MM-DD-batch-NNN.json` の形式でこのディレクトリへ追加してください（このサンプルファイルとは別名にすること）。

## 日次運用フロー

1. GPTが50〜100件の教師データをJSON化し、このディレクトリへ`YYYY-MM-DD-batch-NNN.json`として追加（またはClaudeへJSON本文を渡す）。
2. `npm run ingest:teacher-dataset -- <path-to-batch.json> <batch-id>` を実行し、スキーマ検証・content_hash算出・`INSERT OR IGNORE`によるD1向けSQLを生成する（**Cloudflareへは接続しない、ローカル生成のみ**）。
3. 既存の回帰テスト（`npm test`）を実行し、`search-quality-regression.test.mjs`等が壊れていないことを確認する。
4. 検証済みのバッチJSON・生成SQL・レポートをコミットしGitHubへ保存する。
5. 生成SQLをCloudflare D1へ適用する（`wrangler d1 execute PRODUCT_DB --remote --file=...`）操作は、別途の明示的な承認を得てから実施する（本基盤の対象外）。
