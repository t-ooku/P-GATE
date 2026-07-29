# HOSHILU 商品詳細URLフィード接続ガイド

対象は楽天市場、Qoo10 Japan、SHEIN Japanの許諾済み商品詳細URLです。検索結果ページや無断スクレイピングで収集したURLは受け付けません。

## 送信先

- `POST /api/internal/marketplace-offers/sync`
- `Authorization: Bearer <MARKETPLACE_OFFER_SYNC_SECRET>`
- `Content-Type: application/json`
- 1バッチ最大200件

SecretはCloudflare Workersへ登録し、ファイル、ログ、チャットへ記載しません。

## 必須項目

| 項目 | 内容 |
|---|---|
| `tenant` | HOSHILUのテナント識別子 |
| `batch_id` | 再送判定に使える一意のバッチID |
| `marketplace` | `RAKUTEN_JP`、`QOO10_JP`、`SHEIN_JP` |
| `external_product_id` | モール側の商品ID |
| `product_url` | HTTPSの商品詳細URL |
| `record_key` または `asin` | HOSHILU商品との照合キー |
| `observed_at` | URL・在庫を確認したISO 8601日時 |

完全な例は [hoshilu-marketplace-offers.sample.json](examples/hoshilu-marketplace-offers.sample.json) を参照してください。

## URL条件

- 楽天市場: `item.rakuten.co.jp` または `product.rakuten.co.jp` の商品詳細
- Qoo10: 数値の `goodscode` を持つ商品詳細、または商品IDを含む `/item/` 詳細
- SHEIN: `shein.com` 配下で `-p-<商品ID>.html` を持つ商品詳細
- 検索ページ、短縮URL、HTTP、許可外ドメインは拒否

## 鮮度と表示

- 7日以内に確認された購入可能なURLだけを商品カードへ表示
- `OUT_OF_STOCK`、`UNAVAILABLE`、`active: false` は表示しない
- 確認済みURLがない商品は「全部のモールで探す」を表示
- 更新停止時はURLが自動的に古くなり、商品カードから外れる

## 接続確認

同期Secretを使える運用担当者は、次の診断APIで件数と鮮度だけを確認できます。

- `GET /api/internal/marketplace-offers/stats`
- URLやSecretそのものはレスポンスへ含まれません
- `missing_marketplaces` が空になれば3モールの新鮮なURLがあります

## 運用手順

1. モールまたはASPから商品データ利用・ディープリンク利用の許諾を得る。
2. HOSHILU商品との `record_key` またはASIN照合を作る。
3. サンプル形式でステージング相当の少量バッチを送る。
4. 診断APIで `fresh_available` を確認する。
5. 商品カードから該当モールの「○○で見る」が商品詳細へ遷移することを確認する。
6. 24時間以内の定期更新を設定し、7日を超える停止を監視する。

