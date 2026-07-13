# Project GATE MVP 受入テスト

| ID | 試験 | 合格条件 |
|---|---|---|
| T1 | 正常ZIP | tenant、UUID、CSV保存、Import_Log、Archive移動が1回だけ成功 |
| T2 | 3 tenant | `itg` / `itt` / `mc2`を正しく抽出 |
| T3 | CP932 | 日本語の欠損・文字化けなく23列を認識 |
| T4 | 対象100件 | `MVP_Target`指定時は対象外をMasterへ入れない。空の場合は有効100件 |
| T5 | 冪等性 | 同じ業務値の再取込でMaster更新0件 |
| T6 | 差分 | 1商品の業務値変更で対象1件だけ更新 |
| T7 | 異常ZIP | Master無更新、`04_Error`移動、ERRORログ |
| T8 | Opportunity | Profit / SEOが100件出力され、同一HashはCacheを使用 |
| T9 | 運用 | 5分トリガー、失敗復旧、GitHub版への復元が手順どおり成功 |

## ローカル自動テスト

`node tests/run_tests.js`で純粋関数、tenant抽出、Mapping、Normalize、Validation、Hash、Opportunity算式、禁止APIを検証する。

## 実環境でのみ確認できる項目

Google権限、Drive移動、Range読込、Spreadsheet書込、Power Automate、時間主導トリガーは実アカウント上でT1〜T9を実施する。

