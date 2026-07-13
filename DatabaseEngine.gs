# Project GATE 導入手順

## 1. Google Drive

`Project GATE`フォルダ内に次の5フォルダを用意する。

- `01_Input_Zip`
- `02_Extracted_CSV`
- `03_Archive`
- `04_Error`
- `05_Log`

各フォルダを開き、URLの`folders/`以降をFolder IDとして控える。

## 2. Google Spreadsheet / Apps Script

1. Project GATE用Spreadsheetを開く。
2. `拡張機能` → `Apps Script`を開く。
3. 最短手順では、既存の`コード.gs`を開き、内容をすべて削除して`dist/Project_GATE_Complete_v1.0.gs`の内容を貼り付ける。
4. 分割管理する場合は、代わりに`gas/`配下の`.gs`ファイルを同名で登録する。結合版と分割版を同時に登録してはいけない。
5. プロジェクト設定で`appsscript.json`を表示し、リポジトリの内容へ置き換える。
6. 関数一覧から`setupProjectGate`を選び、`実行`する。
7. 初回の権限確認を許可する。

## 3. Config

作成された`Config`シートへ次を入力する。

- `INPUT_FOLDER_ID`: `01_Input_Zip`
- `EXTRACT_FOLDER_ID`: `02_Extracted_CSV`
- `ARCHIVE_FOLDER_ID`: `03_Archive`
- `ERROR_FOLDER_ID`: `04_Error`
- `LOG_FOLDER_ID`: `05_Log`

`SPREADSHEET_ID`は初期設定時に自動入力される。

## 4. 100商品

商品を指定する場合は`MVP_Target`シートのASIN列に最大100件を入力する。`Enabled`は空欄または`TRUE`を有効として扱う。

未指定の場合はCSVの先頭から有効100件を使用する。

## 5. 初回テスト

1. 正常なZIPを`01_Input_Zip`へ置く。
2. Apps Scriptで`runProjectGate`を実行する。
3. 次を確認する。
   - ZIPが`03_Archive`へ移動
   - CSVが`02_Extracted_CSV`へ保存
   - `Import_Log`が`SUCCESS`
   - `Master_Database`が最大100件
   - `Opportunity`と`AI_Cache`が作成
   - `05_Log`にJSONログが作成

## 6. 自動化

初回テスト成功後に`installProjectGateTrigger`を1回実行する。以後5分ごとに`01_Input_Zip`を確認する。

Power AutomateはOneDriveへZIPが追加された時に、そのファイルをGoogle Driveの`01_Input_Zip`へコピーする。

## 7. 失敗時

- ZIPは`04_Error`へ移動する。
- `Import_Log`の`Error_Code`と`Error_Message`を確認する。
- `System_Log`または`05_Log`のJSONログで詳細を確認する。
- 原因修正後、ZIPを`01_Input_Zip`へ戻して再実行する。
