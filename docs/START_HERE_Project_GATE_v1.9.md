# Project GATE — START HERE v1.9

## 正本

| 用途 | ファイル |
|---|---|
| GAS | `dist/Project_GATE_Complete_v1.9.gs` |
| 商品コード | `docs/PRODUCT_IDENTIFIER_SPEC_v1.9.md` |
| LINE／PWA | `tools/line-worker/` |
| Chrome拡張 | `tools/chrome-extension/` |
| iOS／Android設計 | `docs/NATIVE_APP_ARCHITECTURE_v2.0.md` |

## v1.9の現在地

- 日本語商品マスター、多言語Knowledge、契約、KPI
- LINE、PWA、Chrome拡張のコード
- JAN／EAN／UPCとASINの承認制対応表
- チェックディジットとtenant境界の検証
- 危険な複数ASIN割当の自動停止
- 商品コードのCoverage／Conflict一覧

## 未完了

- v1.9のGAS実環境反映
- ITG商品のJAN／EAN／UPC確認・登録
- PWA／LINE／Chromeの外部設定と実機試験
- バーコード検索の公開
- ネイティブiOS／Androidアプリ

## PCで行う順番

1. `Project_GATE_Source_v1.9.zip`をGitHubへ保存
2. GASをv1.9へ全置換して`setupProjectGate()`
3. `Product_Identifiers`へ確認済みコードを登録
4. 「商品コード整備状況を更新」
5. `Identifier_Conflicts=0`を確認
6. PWA／LINE／Chromeの外部設定と実機試験

商品コードは推測や自動翻訳で埋めず、メーカー資料または実物パッケージで確認する。
