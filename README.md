# Project GATE

複数言語の利用者ニーズを日本語の商品データへ結び付け、根拠付きの商品提案と送客効果を計測するMVP実装です。

## 現在の実装範囲

- 対象100商品
- OneDrive → Windows Bridge → Google Driveへの安全なZIP配置
- GASによるZIP検出、tenant抽出、解凍、CP932 CSV読込
- Mapping / Normalize / Validationの責務分離
- SHA-256による差分更新
- Master Database同期
- Profit / SEO Opportunity出力
- AI Cache
- Import_Log / INFO・WARN・ERRORログ
- GASタイムアウト対策（1実行1ZIP、残りは次回へ繰越）
- 未完了取込ログの自動復旧（30分）
- 入力なし時の不要ログ抑制
- 顧客別KPI計測（表示・クリック・送客・購入）
- Control対P-GATEの効果比較と売上・粗利連動
- 同意済み5社以上に限定した匿名ベンチマーク
- 競合双方の同意、回答独占、カテゴリ独占の推薦ポリシー
- 契約別の推薦可否と監査ログ
- 日本語質問から根拠付きで最大3商品を返すKnowledge基盤
- 日本語の商品マスターを正本とした英語・中国語・韓国語・ローマ字検索
- 承認済み表示文と日本語フォールバック
- LINE公式アカウントでの商品質問・提案・Amazon送客
- LINE表示・クリック・送客のKPI計測
- iPhone／Android／PCへインストールできる多言語PWA
- Turnstile保護された公開Knowledge API
- PWA表示・クリック・送客のKPI計測
- 商品閲覧中のタイトル／選択文字をPWAへ安全に渡すChrome拡張
- JAN／EAN／UPCを日本語商品のASINへ安全に結ぶ商品識別子基盤
- 商品コードのチェックディジット、重複割当、整備率の検証
- Config・Trigger・PWA・LINE・契約・商品コードを確認する公開前診断
- 利益非優先・根拠不足時は回答しない中立性ルール

Inventory / Competition / TrendはMVP対象外です。

## ディレクトリ

- `gas/`: Google Apps Script本体
- `dist/`: Apps Scriptへ一度に貼り付ける結合版
- `tests/`: ローカル回帰テスト
- `tools/line-worker/`: LINE署名検証・返信・送客を担うCloudflare Worker
- `tools/chrome-extension/`: 最小権限のManifest V3 Chrome拡張
- `docs/`: 実装判断と導入手順

## 初回導入

1. Google Spreadsheetを1つ作成する。
2. Spreadsheetに紐づくApps Scriptプロジェクトへ`gas/`配下のファイルを登録する。
3. `setupProjectGate()`を手動実行する。
4. `Config`シートに5つのGoogle Drive Folder IDを入力する。
5. 必要なら`MVP_Target`シートへ対象ASINを最大100件入力する。空の場合はCSV先頭の有効100件を使う。
6. 正常ZIPを`01_Input_Zip`へ配置し、`runProjectGate()`を手動実行する。
7. 正常処理を確認後、`installProjectGateTrigger()`を1回実行する。

詳細は[`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md)を参照してください。

## テスト

```bash
node tests/run_tests.js
node --test tools/line-worker/test/*.test.mjs
node --test tools/chrome-extension/test/*.test.mjs
```

現在版は`v1.13.0`です。導入開始点は[`docs/START_HERE_Project_GATE_v1.13.md`](docs/START_HERE_Project_GATE_v1.13.md)、匿名比較仕様は[`docs/ANONYMOUS_BENCHMARK_SPEC_v1.13.md`](docs/ANONYMOUS_BENCHMARK_SPEC_v1.13.md)、公開前診断は[`docs/PREFLIGHT_SPEC_v1.10.md`](docs/PREFLIGHT_SPEC_v1.10.md)、商品識別子仕様は[`docs/PRODUCT_IDENTIFIER_SPEC_v1.9.md`](docs/PRODUCT_IDENTIFIER_SPEC_v1.9.md)、Chrome拡張仕様は[`docs/CHROME_EXTENSION_SPEC_v1.8.md`](docs/CHROME_EXTENSION_SPEC_v1.8.md)を参照してください。

PWAとChrome拡張は実装済み・未デプロイです。ネイティブiOS／Androidは[`docs/CHANNEL_EXPANSION_ROADMAP_v1.7.md`](docs/CHANNEL_EXPANSION_ROADMAP_v1.7.md)の判定条件を満たした後に追加します。

## 完成判定

`docs/TEST_PLAN.md`の受入試験を実環境で全件通過し、GitHubの一意なcommitから再現できた時点をMVP完成とします。
