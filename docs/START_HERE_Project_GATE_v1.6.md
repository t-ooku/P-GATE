# Project GATE — START HERE v1.6

## 現在の正本

| 用途 | 正本 |
|---|---|
| GAS本体 | `dist/Project_GATE_Complete_v1.6.gs` |
| GAS manifest | `gas/appsscript.json` |
| 多言語仕様 | `docs/MULTILINGUAL_KNOWLEDGE_SPEC_v1.6.md` |
| LINE仕様 | `docs/LINE_INTEGRATION_SPEC_v1.6.md` |
| LINE Worker | `tools/line-worker/` |
| Windows Bridge | `tools/windows-bridge/` |

Apps Scriptへは`dist/`の結合版だけを貼り付ける。結合版と`gas/`の分割ファイルを同時に登録しない。

## v1.6で追加された価値

- 日本語の出品データを複製せず、英語・中国語・韓国語・ローマ字検索を同じASINへ接続
- 承認済み翻訳だけを表示し、未整備時は日本語へ安全にフォールバック
- LINEの友だち追加から商品相談、最大3候補、Amazon送客までを接続
- LINEの表示・クリック・送客を顧客契約単位で計測
- LINE署名、送客リンク署名、再送重複、Amazonドメインを検証

## 既存の自動取込

1. 出品システムのZIPをOneDriveの同期元へ保存する。
2. Windows BridgeがGoogle Driveの`01_Input_Zip`へ転送する。
3. GASが1回につき1ZIPを取り込み、日本語の商品マスターを更新する。
4. `Import_Log=SUCCESS`と`Opportunity`を確認する。

PC停止・スリープ・サインアウト中はWindows Bridgeの転送を行わない。Google側へ到着済みのZIPはGASトリガーで処理できる。

## 多言語運用

1. `Search_Alias`へtenant、ASIN、別名、言語を登録する。
2. 確認済みの行だけ`Approved=TRUE`にする。
3. 必要に応じて`Localized_Content`へ言語別表示名・説明を登録する。
4. 「Project GATE → 多言語SEOを更新」で未整備言語を確認する。

## LINE公開前

LINEのコードは実装済みだが、公開には外部サービスのSecret設定と実機試験が必要。`docs/RELEASE_CHECKLIST_v1.6.md`の未完了項目を上から実施する。Channel SecretやAccess Tokenをスプレッドシート、GASソース、GitHubへ入力しない。

## テスト

```bash
node tests/run_tests.js
node --test tools/line-worker/test/*.test.mjs
node tools/build_bundle.js
node --check < dist/Project_GATE_Complete_v1.6.gs
```
