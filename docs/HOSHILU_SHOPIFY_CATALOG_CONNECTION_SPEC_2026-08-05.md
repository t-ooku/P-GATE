# HOSHILU Shopify Catalog / UCP接続 設計案

更新日: 2026-08-05
対象ブランチ(実装時): `agent/hoshilu-shopify-catalog-readonly`
ステータス: 設計のみ・未実装

## 1. 目的

Shopify上の独立EC(自社ストア)の商品を、HOSHILUのWorld Search(横断検索)対象へ追加する。
初期スコープは**読み取り専用**。購入・決済・注文代行は対象外。

## 2. 既存アーキテクチャとの整合

HOSHILUは既にAmazon SP-API(`sp-api-sync.mjs`/`sp-api-d1-repository.mjs`)・楽天(`rakuten-marketplace-api.mjs`)・Yahoo!(`yahoo-shopping-api.mjs`)の3種類の外部カタログ接続パターンを持つ。Shopify接続はこの**同じ設計パターンを踏襲**する。

| 既存パターン | 役割 | Shopify版での対応 |
|---|---|---|
| `sp-api-sync.mjs` | 外部APIから商品を取得し正規化 | `shopify-catalog-sync.mjs`(新規) |
| `sp-api-d1-repository.mjs` | D1への冪等upsert・カーソル管理・監査ログ | `shopify-d1-repository.mjs`(新規、同一パターン) |
| `sp-api-admin-routes.mjs` | 手動同期トリガー・状態確認の管理者ルート | `shopify-admin-routes.mjs`(新規) |
| `rakuten-marketplace-api.mjs`の`normalizeXItems` | 外部スキーマ→HOSHILU内部候補スキーマへの正規化 | `normalizeShopifyProducts()` |
| `marketplace-product-url-policy.mjs` | 商品URLの検証・正規化(なりすまし防止) | `shopify-url-policy.mjs`(新規、ストアドメイン許可リスト方式) |

新規リポジトリ・ファイルを追加するのみで、既存の検索実行パス(`marketplaceSearchDestinations`等)や検索品質ロジック(`search-intelligence.mjs`)には変更を加えない。Shopify由来商品はHOSHILU内部の共通商品候補スキーマ(`record_key`/`product_name`/`image`/`offers[]`)に正規化されるため、既存の`knowledge-search.mjs`によるローカル検索・ランキングにそのまま乗る。

## 3. データモデル

### 3.1 取得フィールド(要求どおり)

| HOSHILU内部フィールド | Shopify Storefront API / Admin API 対応元 |
|---|---|
| 商品名 | `product.title` |
| 説明 | `product.description` (先頭500文字に切り詰め、既存の`description.slice(0,500)`規約に合わせる) |
| バリエーション | `product.variants[].{title, sku, price}` |
| 価格 | `variants[0].price.amount` (代表バリエーション。将来は最安値バリエーションを採用) |
| 通貨 | `variants[0].price.currencyCode` |
| 在庫 | `variants[].availableForSale` / `quantityAvailable`(Admin APIのみ、Storefrontは真偽値のみ) |
| 画像 | `product.images[0].url` |
| 販売元 | `shop.name`(接続時にストアごとに登録する表示名) |
| 商品URL | `product.onlineStoreUrl` |
| 国・配送可能地域 | `product.shippingCountries` は標準GraphQLに無いため、**ストア単位の登録情報**(接続設定時にセラー/運営が手動入力)として保持。将来Shopify Markets APIと接続すれば自動化可能。 |

### 3.2 取得方法: Storefront API (GraphQL) を第一候補とする

理由:
- Storefront APIは**公開トークン**(`Storefront Access Token`)で読み取り専用アクセスが可能。Admin API(要`shpat_`アクセストークン、書き込み権限を含みうる)より権限スコープが狭く、「読み取り専用」という初期方針に自然に合致する。
- レート制限が緩やか(ポイントベース、通常運用で十分)。
- 在庫の詳細(正確な数量)が必要な場合のみ、将来Admin APIの`read_products`スコープを追加検討する。

### 3.3 D1スキーマ(新規マイグレーション、既存命名規則`NNNN_description.sql`に従う)

`migrations/0033_shopify_catalog.sql`(案):

```sql
CREATE TABLE shopify_stores (
  store_id TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL UNIQUE,      -- 例: example.myshopify.com
  display_name TEXT NOT NULL,
  storefront_token_binding TEXT NOT NULL, -- env変数名を保存(トークン本体はSecretsのみ)
  ship_to_countries_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shopify_products (
  store_id TEXT NOT NULL,
  product_gid TEXT NOT NULL,             -- Shopify global id
  product_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  variants_json TEXT NOT NULL DEFAULT '[]',
  price REAL,
  currency TEXT,
  in_stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  missing_from_shopify INTEGER NOT NULL DEFAULT 0,  -- sp_api_listingsの全件照合パターンを流用
  sync_id TEXT NOT NULL,
  PRIMARY KEY (store_id, product_gid)
);
CREATE INDEX idx_shopify_products_store ON shopify_products(store_id);

CREATE TABLE shopify_sync_cursors (
  store_id TEXT PRIMARY KEY,
  cursor_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shopify_sync_audit (
  audit_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  result TEXT NOT NULL,
  items INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL
);
```

`sp_api_listings`の`missing_from_amazon`/`missing_scan_count`と同じ「全件照合で消えた商品を自動非表示化」パターンを`shopify_products.missing_from_shopify`に流用する(`finishFullScan`と同型の関数)。

## 4. 同期方式

- **Cron定期同期**(推奨): 既存の`triggers.crons: ["*/15 * * * *"]`(wrangler.jsonc)に相乗り、または専用cronを追加。ストアごとにカーソルベースの増分取得 + 日次1回の全件照合(`sp-api-sync.mjs`の`fullScanTenantForSchedule`と同型ロジックで複数ストアを時間分散)。
- ストア数が少ない間(1〜数店舗)は**手動同期のみ**でも十分。管理者ルート`POST /api/internal/shopify/sync`(要`x-hoshilu-internal-secret`、`unmet-demand-routes.mjs`と同型の定数時間比較認証)から開始し、安定後にcron化する段階的アプローチを推奨。

## 5. 既存コードへの影響範囲

| 対象 | 変更内容 |
|---|---|
| `src/shopify-catalog-sync.mjs`(新規) | Storefront APIクライアント・正規化 |
| `src/shopify-d1-repository.mjs`(新規) | D1 upsert・カーソル・監査ログ |
| `src/shopify-admin-routes.mjs`(新規) | 手動同期・状態確認ルート |
| `src/index.mjs` | ルーター冒頭に`handleShopifyAdminRoutes`呼び出しを1行追加(既存の`handleSpApiAdminResponse`等と同じ挿入パターン) |
| `src/knowledge-search.mjs` | **変更不要**。`shopify_products`をUNION対象に加える1クエリ追加のみ(検索ロジック本体は無改変) |
| `migrations/0033_shopify_catalog.sql`(新規) | 上記スキーマ |
| `wrangler.jsonc` | `vars`に`SHOPIFY_STORES_ENABLED`等の非機密フラグを追加(任意) |
| **既存の検索品質ロジック・UI・他モール接続** | 影響なし |

## 6. 必要な環境変数・Secrets

| 名前 | 種別 | 用途 |
|---|---|---|
| `SHOPIFY_STOREFRONT_TOKEN__<store_id>` | Secret(`wrangler secret put`) | ストアごとのStorefront Access Token。1店舗1変数(SP-APIの`SPAPI_REFRESH_TOKEN_ITG`等と同じ命名パターン) |
| `SHOPIFY_ADMIN_SYNC_SECRET` | Secret | 手動同期エンドポイント認証(`UNMET_DEMAND_SYNC_SECRET`と同型) |

ストアの`shop_domain`・表示名・配送可能国は機密ではないため**D1の`shopify_stores`テーブルに平文保存**(トークンのみSecrets管理)。

## 7. 無料・低コストで開始できる範囲

- Shopify Storefront APIの読み取りは**無料**(ストア側の標準機能、追加課金なし)。
- Cloudflare Workers Cron Triggers・D1は既存プランの範囲内で追加コストなし(D1書き込み行数のみ増加、現行の無料/低額枠で数店舗〜数千商品なら十分)。
- 初期は**1〜2店舗・手動同期のみ**で開始すれば追加コストゼロで検証可能。

## 8. セキュリティ上の注意

- Storefront Tokenは**読み取り専用スコープのみ**を要求する(Admin API管理画面で書き込み権限を含むトークンを誤って使わない)。
- 取得した`product_url`はHOSHILUの署名付き送客URL(`/go?token=`)を経由させ、Shopifyの生URLを直接クライアントへ露出しない(既存のAmazon/楽天と同じ送客ポリシー)。
- ストアの`shop_domain`は接続時に運営者が手動登録する**許可リスト方式**とし、任意のドメインを動的に追加できないようにする(なりすましストア対策)。
- 個人情報は一切扱わない(商品カタログのみ、顧客データ・注文データには触れない)。

## 9. 実装ステップ

1. `migrations/0033_shopify_catalog.sql`を追加し、ローカルD1で検証。
2. `shopify-catalog-sync.mjs`: Storefront API GraphQLクエリ・`normalizeShopifyProducts()`を実装(テスト用にモックfetchで正規化のみ先行実装)。
3. `shopify-d1-repository.mjs`: upsert・カーソル・監査ログ(`sp-api-d1-repository.mjs`をほぼそのまま移植)。
4. `shopify-admin-routes.mjs`: 手動同期エンドポイント。
5. `index.mjs`にルーター登録1行。
6. `knowledge-search.mjs`の商品取得クエリへ`shopify_products`をUNION(検索ロジック自体は無改変)。
7. 実店舗1件でStorefront Tokenを発行し、手動同期で疎通確認。
8. 問題なければcron化。

## 10. テスト計画

- 正規化テスト: Shopify GraphQLレスポンスのモック→HOSHILU内部候補スキーマへの変換が正しいこと(価格・通貨・在庫真偽値・画像・URL)。
- URLポリシーテスト: 許可リスト外ドメインの商品URLを拒否すること。
- D1冪等性テスト: 同一`product_gid`の再同期で重複行が増えないこと(`sp-api-d1-repository.mjs`の既存テストパターンを流用)。
- 全件照合テスト: 同期対象から消えた商品が`missing_from_shopify=1`になり検索結果から除外されること。
- 認証テスト: `x-hoshilu-internal-secret`なし/不一致でのアクセス拒否。
- 統合テスト: `knowledge-search.mjs`の検索結果にShopify商品が正しく混在すること(既存モールとの重複排除含む)。
