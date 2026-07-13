# Project_GATE_Spec_v1

## 概要

Project GATE は Amazon事業向けAI活用SEO・コンテンツ生成・送客基盤。

## MVP

-   対象: 100商品
-   固定費ゼロ優先
-   GAS / Google Spreadsheet / Google Drive
-   GitHub
-   Power Automate
-   OneDrive
-   イベント駆動
-   差分更新(Hash)
-   AI Cache
-   将来APIへ置換可能

## データフロー

Amazon出品システム → OneDrive(ZIP) → Power Automate → Google Drive

    Project GATE/
     01_Input_Zip
     02_Extracted_CSV
     03_Archive
     04_Error
     05_Log

→ Google Apps Script → Master Database

## ZIP

-   ZIP名例
    -   listing-AP0147_customer_support-itg@mc2-ltd.jp-csv.zip
    -   listing-AP0147_customer_support-itt@mc2-ltd.jp-csv.zip
    -   listing-AP0147_customer_support-mc2@mc2-ltd.jp-csv.zip
-   tenant(itg/itt/mc2)はZIP名から抽出
-   CSVはShift_JIS(CP932)

## CSV

確認済み項目: - ASIN - 商品名 - SKU - メーカー - 利益 - 売価 -
販売価格 - Amazon手数料 - 送料 - 関税 - 州税 - 在庫 - 登録日時 -
更新日時 - 日本最安値 - 米国最安値 - サイズ情報 - その他

CSV Mappingは後工程。

## 設計原則

-   appendRow禁止
-   setValuesのみ
-   一括読み込み
-   一括書き込み
-   MappingとNormalizer分離
-   EngineとDrive処理分離
-   FolderID管理
-   Configシート管理
-   SOLID
-   Hash比較はメモリ上

## Opportunity Engine(MVP)

-   Profit
-   SEO
-   Inventory Competition/Trendは将来実装。

## GAS構成

-   Config.gs
-   Main.gs
-   Logger.gs
-   Utility.gs
-   DriveService.gs
-   ImportLog.gs
-   ZipEngine.gs
-   ImportEngine.gs
-   MappingEngine.gs
-   NormalizeEngine.gs
-   ValidationEngine.gs
-   HashEngine.gs
-   DatabaseEngine.gs

## Configシート

キー: - ENV - INPUT_FOLDER_ID - EXTRACT_FOLDER_ID - ARCHIVE_FOLDER_ID -
ERROR_FOLDER_ID - LOG_FOLDER_ID - SPREADSHEET_ID - SYSTEM_VERSION

Folder名管理は禁止。

## Sprint1

01_Input_Zip → ZIP検出 → Batch_ID(UUID) → Tenant抽出 → ZIP解凍 →
CSVを02_Extracted_CSV保存 → Import_Log記録 → 03_Archiveへ移動

## 実装ルール

-   GAS(V8)
-   コメント付き
-   例外処理
-   Logger(INFO/WARN/ERROR)
-   Utilities.unzip使用
-   FolderID管理
-   Configシート読込
-   appendRow禁止
-   setValues使用
-   コピペで動作
-   保守性重視
