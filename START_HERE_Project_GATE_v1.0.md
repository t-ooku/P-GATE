# Project GATE MVP — START HERE

## 現在の正本

MVPのGoogle Apps Script実装は、次の2ファイルを正本とします。

1. `Project_GATE_Complete_v1.0.gs` — 全14モジュールを実行順に結合したGAS本体
2. `Project_GATE_appsscript_v1.0.json` — Apps Scriptのマニフェスト

2026-07-14のWebアップロード（commit `350f7af`）では、フォルダが平坦化された際に既存ファイルの名前と中身が入れ替わりました。ルート直下にある個別の `.gs`、`README.md`、`appsscript.json` などは旧アップロード由来のため、MVPのデプロイには使用しないでください。

## 検証済み範囲

- 全GASソースのJavaScript構文
- マニフェストJSON構文
- テナント判定（itg / itt / mc2）
- 引用符・改行を含むCSV解析
- セラーセントラル想定23列のヘッダー変換
- ASIN・商品名・価格・在庫の正規化と必須チェック
- 重複判定用ハッシュ
- 利益性・SEO機会スコア
- DB連続行グループ化
- 実サンプルCSV先頭100件の変換・検証
- `appendRow()` 不使用

## Google Apps Scriptへの配置

1. 対象Googleスプレッドシートで「拡張機能」→「Apps Script」を開く。
2. エディタの既存コードを削除し、`Project_GATE_Complete_v1.0.gs` の全内容を貼り付ける。
3. プロジェクト設定で「appsscript.json マニフェスト ファイルをエディタで表示する」を有効にする。
4. `appsscript.json` の内容を `Project_GATE_appsscript_v1.0.json` の内容で置き換える。
5. 保存後、関数 `setupProjectGate` を一度だけ手動実行し、権限を許可する。
6. 作成された `Config` シートへ5つのGoogle DriveフォルダIDを入力する。
7. `runProjectGate` を手動実行してテストする。
8. 成功確認後、`installProjectGateTrigger` を一度実行して5分監視を有効化する。

## MVP合格条件

- Inputへ置いたZIPがArchiveへ移動する。
- ZIP内のCP932 CSVが文字化けなく読み取られ、`02_Extracted_CSV`へ保存される。
- DBにASIN単位で追記または更新される。
- `Opportunity`に直近正常バッチの最大100件が出力される。
- LogsとImport_Logに処理結果が残る。
- 同じZIPを再投入してもDBが二重登録されない。
- 異常ZIPはErrorフォルダへ移動し、後続ファイルの処理は継続する。

## 次回の整理

MVP動作確認後、旧アップロード由来の誤配列ファイルをGitHub DesktopまたはGitで削除し、`gas/`、`docs/`、`tests/`、`tools/` の正式構成へ置き換えます。これはMVPのGAS動作確認を妨げないため、デプロイ後に実施できます。
