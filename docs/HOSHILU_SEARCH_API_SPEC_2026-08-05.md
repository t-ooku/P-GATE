# HOSHILU Search API 設計案

更新日: 2026-08-05
対象ブランチ(実装時): `agent/hoshilu-search-api-v1`
ステータス: 設計のみ・未実装

## 1. 目的

ChatGPT・Gemini・LINE・外部AIエージェントなどの外部クライアントから、HOSHILUの検索能力をAPIとして呼び出せるようにする。

## 2. 絶対原則(既存SSoTを継承)

> AIは理解する。HOSHILUは探す。

- 呼び出し元(外部AI)は**意図・検索語・条件を渡す側**であり、本APIはその意図を受け取って**HOSHILU自身がモール・ショップを検索した実結果のみ**を返す。
- 本APIは**商品URL・価格・在庫・画像を生成しない**。すべて実在する接続先(Amazon/楽天/Yahoo!/Qoo10/SHEIN/ファッション5モール/将来のShopify等)から取得した値のみを返す。
- これは`tools/line-worker/src/ai-product-discovery.mjs`(AI Search v2 STEP1)と同じ役割分担であり、本APIはその**外部公開版**という位置づけ。内部の`/api/knowledge`(PWA向け)とロジックを共有し、出力先を汎用JSON APIとして切り出す。

## 3. エンドポイント設計

```
POST /api/v1/search
```

### 3.1 リクエスト

```json
{
  "query": "透明で韓国っぽいワイヤレスイヤホン",
  "language": "ja",
  "country": "JP",
  "price": { "max": 10000, "currency": "JPY" },
  "exclude": ["有線", "中国製"],
  "marketplaces": ["AMAZON_JP", "RAKUTEN_JP"],
  "session_ref": "caller-issued-opaque-id"
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `query` | ○ | 自由文。既存`validateKnowledgeRequest`と同じ2〜200文字制限を継承。 |
| `language` | - | `ja`/`en`/`zh`/`ko`。未指定は`ja`。 |
| `country` | - | 将来の配送可否フィルタ用。現状は記録のみ。 |
| `price` | - | `min`/`max`/`currency`。 |
| `exclude` | - | 除外条件(色・素材・否定語など自由文の配列)。 |
| `marketplaces` | - | 対象モールの絞り込み。未指定は全モール。 |
| `session_ref` | - | 呼び出し元が管理する不透明ID。HOSHILU側では**ハッシュ化してのみ**保持(既存`hashUser()`を再利用)。 |

### 3.2 レスポンス

```json
{
  "ok": true,
  "query_id": "sq_xxx",
  "understood": {
    "category": "完全ワイヤレスイヤホン",
    "features": ["透明", "韓国風"],
    "search_keywords": { "ja": ["透明 ワイヤレスイヤホン"], "en": ["transparent earbuds"] }
  },
  "results": [
    {
      "marketplace": "AMAZON_JP",
      "status": "OK",
      "retrieved_at": "2026-08-05T09:00:00Z",
      "items": [
        {
          "title": "...",
          "price": 8980,
          "currency": "JPY",
          "in_stock": true,
          "image_url": "https://...",
          "product_url": "https://hoshilu.app/go?token=..."
        }
      ]
    },
    {
      "marketplace": "QOO10_JP",
      "status": "ERROR",
      "error_code": "PROVIDER_TIMEOUT"
    }
  ],
  "generated_at": "2026-08-05T09:00:01Z"
}
```

**部分成功を正とする**: 1モールが失敗しても`ok:true`のまま返し、そのモールだけ`status:"ERROR"`で個別に報告する(既存の`Promise.allSettled`ベースのモール横断検索と同じ設計を踏襲)。全モール失敗時のみ`ok:false`。

## 4. 内部設計 — 既存コードとの関係

`handleKnowledgeApi`(`src/index.mjs`)が現在担っている「入力検証→Turnstile検証→GAS/Knowledge検索→モール横断検索→AI意図理解フォールバック→整形」のうち、**Turnstile検証(人間のブラウザ前提)を除いた部分をAPIキー認証に差し替えて再利用**する。

```
handleSearchApiV1(request, env)
  ├─ 1. APIキー検証(新規)
  ├─ 2. レート制限チェック(新規)
  ├─ 3. validateSearchApiRequest()  … validateKnowledgeRequestを一般化
  ├─ 4. discoverProductsWithAi()    … 既存そのまま再利用(AI意図理解)
  ├─ 5. marketplaceSearchDestinations() 系 … 既存そのまま再利用
  ├─ 6. 応答整形(JSON API用に新規)
  └─ 7. ログ記録(新規、個人情報を保存しない)
```

**既存の検索ロジック・AI意図理解・モール接続は一切変更しない**。新規に追加するのは「認証」「レート制限」「入出力の型」の3層のみ。

## 5. 認証設計

- **APIキー方式**(既存の`x-hoshilu-internal-secret`と同じヘッダ運用パターンを踏襲、ただし発行・失効を管理できるようD1テーブル化):

```sql
CREATE TABLE search_api_keys (
  key_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,        -- SHA-256、平文キーは保存しない
  client_name TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '["search:execute"]',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
```

- リクエストは`Authorization: Bearer hoshilu_sk_...`。受信したキーをSHA-256化し`key_hash`と定数時間比較(`unmet-demand-routes.mjs`の`same()`と同じ関数を共通化して再利用)。
- 既存の`access-policy.mjs`のロール体系(`guest/member/seller/operator`)に**`api_client`ロールを追加**し、`search:execute`アクションのみ許可する形で拡張する(新しい認可の仕組みを作らず既存ポリシーに合流させる)。

## 6. レート制限

- Cloudflare標準機能ではなく、まずは**D1ベースの簡易カウンタ**(1分間ウィンドウ、`search_api_keys.rate_limit_per_minute`)で開始。将来的にCloudflare Rate Limiting Rules(有料プラン機能)への移行を検討。
- レート超過時は`429`、`Retry-After`ヘッダ付き。

## 7. ログ・個人情報方針(初期仕様)

既存の`/api/knowledge`は「質問本文をサーバーログへ保存しない」方針(`consentText`のUI文言どおり)であり、本APIも同じ方針を継承する。

- `query`本文は**ログに残さない**(既存`redactSearchPersonalData`と同様、メール・電話番号等が混入していても記録しない設計を前提とする)。
- 記録するのは: `key_id`・`query_id`・呼び出し時刻・対象モール・成功/失敗・応答時間のみ。
- `session_ref`は呼び出し元の不透明IDをハッシュ化してのみ保持(生値を保存しない、既存`hashUser()`を再利用)。

## 8. エラー・部分成功

| コード | 意味 |
|---|---|
| `AUTH_INVALID` | APIキー不正・失効 |
| `RATE_LIMITED` | レート制限超過 |
| `QUERY_LENGTH_INVALID` | 2〜200文字外 |
| `PROVIDER_TIMEOUT` | 個別モールのタイムアウト(該当モールのみERROR、全体はok:true) |
| `NO_RESULTS` | 全モール0件(ok:trueのまま、resultsが空) |

## 9. 既存コードへの影響範囲

| 対象 | 変更内容 |
|---|---|
| `src/search-api-v1.mjs`(新規) | ルートハンドラ・入出力整形 |
| `src/search-api-auth.mjs`(新規) | APIキー検証・レート制限 |
| `src/access-policy.mjs` | `api_client`ロールと`search:execute`アクションの追加(既存関数の拡張、破壊的変更なし) |
| `src/index.mjs` | ルーター冒頭に1行追加 |
| `migrations/0034_search_api_keys.sql`(新規) | 上記スキーマ |
| **`ai-product-discovery.mjs`・モール接続モジュール・検索品質ロジック** | 変更不要(再利用のみ) |

## 10. 必要な環境変数・Secrets

- 追加のSecretsは不要(APIキーはD1にハッシュ保存し、平文はクライアント発行時の1回のみ表示)。
- 任意: `SEARCH_API_ENABLED`(varsフラグ、段階的ロールアウト用)。

## 11. 無料・低コストで開始できる範囲

- D1・Workersとも既存プランの範囲内。追加コストは実質ゼロ(レート制限を簡易実装している限り)。
- 外部AIエージェント側のトークン消費・接続コストは呼び出し元負担。

## 12. セキュリティ上の注意

- 生APIキーは**発行時の1回だけ**クライアントへ提示し、以降はハッシュのみ保持(パスワードと同じ扱い)。
- `product_url`は必ずHOSHILUの署名付き送客URL経由(生モールURLを直接返さない、既存ポリシー踏襲)。
- 個人情報(メール・電話番号等)を`query`から検出した場合はAPIレイヤーでも二重に除去する(既存`redactSearchPersonalData`の再利用に加え、ログ層でも保存しない)。
- CORSは許可オリジンを明示登録制にする(任意オリジンからのブラウザ直叩きを許可しない。サーバー間通信を前提とする)。

## 13. 実装ステップ

1. `access-policy.mjs`に`api_client`ロールを追加(既存テストが壊れないことを確認)。
2. `migrations/0034_search_api_keys.sql`追加。
3. `search-api-auth.mjs`: キー検証・レート制限(まず認証のみ、検索ロジックには触れない)。
4. `search-api-v1.mjs`: `handleKnowledgeApi`のロジックを呼び出し側に薄く委譲する形で実装(内部ロジックの複製をしない)。
5. `index.mjs`にルート登録。
6. 社内テストキーで疎通確認(1呼び出し=1モールのみで最小疎通)。
7. 全モール・4言語での応答を確認。
8. 外部パートナー(最初は1社)に限定公開。

## 14. テスト計画

- 認証テスト: 無効キー・失効キー・スコープ不足の拒否。
- レート制限テスト: 上限超過で429、`Retry-After`が正しいこと。
- 入力検証テスト: 空文字・201文字・不正`price`の拒否。
- 部分成功テスト: 1モール障害時に`ok:true`かつ該当モールのみ`ERROR`。
- ログ非保存テスト: `query`本文がログ・監査テーブルのいずれにも残らないこと。
- 回帰テスト: 既存`/api/knowledge`(PWA)の挙動・テストが本変更で壊れないこと。
- 4言語テスト: `language`指定ごとに`understood.search_keywords`が生成されること。
