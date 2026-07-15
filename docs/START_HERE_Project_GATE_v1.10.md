# Project GATE — START HERE v1.10

## 正本

| 用途 | ファイル |
|---|---|
| GAS | `dist/Project_GATE_Complete_v1.10.gs` |
| 公開前診断 | `docs/PREFLIGHT_SPEC_v1.10.md` |
| 商品コード | `docs/PRODUCT_IDENTIFIER_SPEC_v1.9.md` |
| PWA／LINE | `tools/line-worker/` |
| Chrome拡張 | `tools/chrome-extension/` |

## 実装済み

- ZIP自動取込、日本語商品マスター、Opportunity
- 顧客別KPI、契約、競合、独占
- 日・英・中・韓・ローマ字Knowledge
- LINE、インストール可能PWA、Chrome拡張
- JAN／EAN／UPCとASINの安全な紐付け
- `System_Health`公開前チェック

## 次にPCで行うこと

1. `Project_GATE_Source_v1.10.zip`をGitHubへ保存
2. GASをv1.10へ全置換
3. `setupProjectGate()`を実行
4. スプレッドシートを再読み込み
5. 「Project GATE → 公開前チェック」
6. `System_Health`のFAILを上から解消
7. PWA／LINE／Chromeの実機試験

Secretの実値はSystem_Healthへ表示されない。外部サービスの設定は各導入手順に従う。
