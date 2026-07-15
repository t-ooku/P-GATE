# Project GATE MVP テスト結果

実施日: 2026-07-14 JST

## 自動テスト

結果: **合格**

- tenant抽出: `itg` / `itt` / `mc2`
- CSVの引用符・改行判定
- 実CSV 23列のMapping
- 数値・文字列Normalize
- 必須値・ASIN形式Validation
- SHA-256 Hashの安定性と差分検知
- Profitパーセンタイル
- SEO情報充足度スコア
- Masterの連続行一括更新グループ
- Opportunityが直近正常バッチの最大100件だけを対象にすること
- Windows BridgeのZIP限定・SHA-256冪等性・一時拡張子・5分監視・認証情報非保持
- `appendRow`禁止確認
- 全`.gs`のJavaScript構文確認
- `appsscript.json`のJSON構文確認

## 実CSV確認

提供ZIP内CSVをCP932からUTF-8へ変換し、先頭100データ行で確認した。

- ヘッダー: 23列
- データ: 100行
- 全行の列数: 23列
- ASIN形式正常: 100件
- 商品名あり: 100件
- Mapping / Normalize / Validation通過: 100件

## 未実施

次はユーザーのGoogle環境でのみ実施できる。

- Google権限認可
- Utilities.unzipによる実Drive ZIP解凍
- Drive API Range読込
- Spreadsheet書込
- Folder移動
- Power Automate転送
- 5分トリガー

これらは`TEST_PLAN.md`のT1〜T9で確認する。

## 実環境試験（2026-07-14追記）

- 初回正常取込: `SUCCESS`、100件読込、100件有効、100件登録。
- Windows Bridge経由の自動取込: `SUCCESS`。
- 同一業務値の再取込: 登録0件、更新0件、Unchanged 100件。
- `runProjectGate`の時間ベーストリガー1件を確認。
- Windows Bridge Status: 実行中。

以上によりコアMVPを完成判定とする。未実施のハードニング項目は`MVP_COMPLETION_REPORT_2026-07-14.md`へ記録した。

## v1.2 運用ハードニング（2026-07-14追記）

- 入力なしの5分トリガーで永続ログを生成しないこと: PASS
- 1回のGAS実行で処理するZIPを1件に制限すること: PASS
- 30分以上`STARTED`のImport_Logを復旧対象として検出すること: PASS
- 結合版のJavaScript構文: PASS
- `appsscript.json`のJSON構文: PASS

実環境への反映後、Configの`SYSTEM_VERSION=1.2.0`と、既存の自動取込が継続することを確認する。
