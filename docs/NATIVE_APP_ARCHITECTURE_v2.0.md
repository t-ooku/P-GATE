# P-GATE iOS／Androidアプリ設計 v2.0候補

## 結論

ネイティブ版はPWAのWebView化ではなく、Expo／React NativeによるiOS・Android共通アプリとする。PWAで利用需要を確認した後、カメラ、バーコード、通知、お気に入り同期を追加してストアへ申請する。

Appleの審査基準4.2は、再包装したWebサイトを超える機能・UIを求める。したがって、PWAをそのまま包んだだけのアプリは申請しない。

## ネイティブ版の必須価値

| 機能 | 利用者価値 | 必要な基盤 |
|---|---|---|
| バーコード検索 | 店頭の商品を即座にP-GATEへ相談 | JAN／EAN／UPCとASINの対応表 |
| カメラ検索 | パッケージから候補を探す | 画像同意、OCR／画像認識、保存禁止ルール |
| お気に入り | 後から比較・購入 | 匿名または会員ID、削除API |
| 再入荷・価格通知 | 継続利用する理由 | 定期商品更新、Watch条件、Push Token |
| 履歴引継ぎ | LINE／PWA／アプリを横断 | 明示同意、アカウント、保存期間 |
| 端末共有 | 商品を家族・友人へ送る | OS共有シート、署名付き商品URL |

## 技術構成

- UI: React Native + Expo
- カメラ／バーコード: `expo-camera`
- Push通知: `expo-notifications`
- 言語: 日本語、英語、中国語、韓国語
- API Gateway: Cloudflare Worker
- Knowledge: 現在の多言語Knowledge API
- 商品正本: 日本語`Master_Database`
- 会員・お気に入り・通知設定: GAS／Sheetsではなく、公開前に専用DBへ分離

商品マスターと契約管理は既存GASで検証を継続できるが、一般消費者のアカウント、Push Token、大量アクセスをGoogle Sheetsへ保存しない。

## 先に必要な商品識別子

現在の正本はASIN中心である。v1.9で次の対応表と検証処理を実装したため、商品コードを確認・登録してからカメラ機能を公開する。

`Product_Identifiers`:

- Tenant
- ASIN
- Identifier_Type (`JAN` / `EAN` / `UPC`)
- Identifier_Value
- Source
- Approved
- Updated_At

未承認コードから商品を推薦しない。1つのコードが複数ASINへ結び付く場合は、容量・セット数・国仕様を利用者へ確認する。

実装仕様は`docs/PRODUCT_IDENTIFIER_SPEC_v1.9.md`を参照する。

## アカウントとデータ

### アカウントなし

- 質問
- 最大3候補
- Amazon等への送客
- 端末内だけのお気に入り／履歴

### アカウントあり

- 端末間お気に入り同期
- 再入荷／価格通知
- LINEとの履歴連携
- データのエクスポート／削除

履歴同期は初期状態でオフ。質問本文をクラウド保存する場合は目的、保存期間、削除方法へ個別同意を求める。アカウント作成を提供する場合、Apple要件を含めアプリ内のアカウント削除を実装する。

## API境界

| API | 認証 | 保存 |
|---|---|---|
| `POST /api/knowledge` | 不正利用検証／匿名セッション | 質問Hash、KPI |
| `POST /api/v2/barcode` | アプリ証明＋匿名／会員 | コードHash、結果 |
| `GET/PUT /api/v2/favorites` | 会員または端末鍵 | ASIN、作成日時 |
| `POST/DELETE /api/v2/push-tokens` | 会員＋端末鍵 | Push Token、同意 |
| `GET/PUT /api/v2/watchlist` | 会員 | ASIN、通知条件 |
| `DELETE /api/v2/account` | 再認証 | 関連個人データ削除 |

モバイルアプリ内へ共有API Secretを埋め込まない。端末証明、短期Access Token、Refresh Tokenローテーションを使う。

## 申請前の合格条件

- PWA／LINE合計で実利用者100人以上
- 質問から候補表示までの成功率を測定
- 送客率と翌週再利用率を確認
- バーコード対応商品を最低100件整備
- 通知希望者を利用者ヒアリングで確認
- 正式な利用規約、プライバシー方針、問い合わせ窓口
- iOS／Androidの実機アクセシビリティ試験
- Apple TestFlight／Google Play Closed Test

これらは成功保証値ではなく、高コストなネイティブ開発と審査へ進む最低限の投資判断基準である。

## 公開要件

- Apple: Webサイトの再包装を超える機能が必要
- Google Play: 新規アプリはAndroid 15（API 35）以上を対象
- カメラ・通知権限は使用する場面で説明して要求
- プライバシーポリシーとデータ利用申告
- 審査用アカウントと再現可能な操作手順

## 公式資料

- [Apple App Review Guidelines 4.2](https://developer.apple.com/app-store/review/guidelines/)
- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Google Play Target API](https://developer.android.com/google/play/requirements/target-sdk)
