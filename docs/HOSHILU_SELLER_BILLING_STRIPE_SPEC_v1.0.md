# HOSHILU Seller 請求・決済（前払い）仕様 v1.0

作成: 2026-09-04（大隆さん指示「請求・決済の自動化して」「全部前払いね」）
決定事項: Stripe を使う／カード＋銀行振込／既存の Stripe アカウントを使う。

## 1. 料金（2026-09-03 決定・/for-sellers と同一）

| プラン | 月額 | 有効クリック単価 | 毎月の無料枠 | ショップページ |
|---|---:|---|---|---|
| 無料プラン | 0円 | ジャンル定価（38/57/29/38/47/38/38/38/29/20/33円） | なし | なし |
| Business | 9,800円（登録後3か月は0円） | 定価の50%（19/29/15/19/24/19/19/19/15/10/17円） | Business単価で積算して5,000円まで0円。1か月目から、4か月目以降も。翌月繰越なし | あり |

## 2. 前払いの実現方法

| 対象 | 仕組み | Stripe オブジェクト |
|---|---|---|
| 月額 9,800円 | Subscription。期間開始時に請求（前払い）。`trial_end` ＝ 登録日の暦3か月後（JST 0:00） | Product「HOSHILU BUSINESS（月額）」/ Price lookup_key `hoshilu_business_monthly_9800_jpy`（初回に API で自動作成） |
| 月額（カード） | Checkout（mode=subscription, payment_method_collection=always）→ 以後自動引落 | checkout.session → subscription |
| 月額（銀行振込） | Subscription を直接作成（collection_method=send_invoice, days_until_due=14, customer_balance / jp_bank_transfer）。Stripe が請求書＋専用振込口座をメール、入金を自動照合 | subscription / invoice |
| 送客料 | `seller_billing_wallets` の前払い残高を /go の有効クリックごとに減額。Business は先に当月無料枠を消化 | — |
| チャージ | Checkout（mode=payment）。カードは `setup_future_usage=off_session` で保存し、自動チャージに使う。銀行振込は customer_balance / jp_bank_transfer | checkout.session / payment_intent |
| 自動チャージ | 残高が閾値（既定2,000円）を下回ったら保存済みカードへ off_session で既定10,000円。カード決済のアカウントのみ。1時間に1回まで（Idempotency-Key） | payment_intent |
| お支払い管理 | Billing Portal（カード変更・領収書・請求書・解約） | billing_portal.session |

未払い（invoice.payment_failed / subscription past_due）→ アカウント `SUSPENDED_UNPAID`、財布 `PAUSED` → 優先出品停止。
入金（invoice.paid / subscription active）→ `ACTIVE` に復帰。

## 3. 有効クリック（課金対象）

/go の署名付きトークンに `sp=true`（優先出品）・`sid`（セラーID）・`tn`（テナント）・`rc`（ジャンル）がある場合だけ。
自然掲載（sp なし）は課金しない。同一（セッション × 商品 × セラー）は JST 1日1回（`seller_qualified_click_charges.source_event_id` UNIQUE）。
消化順: 無料枠（Business）→ 前払い残高。残高不足は `VOID`（請求しない）。優先出品は「財布 ACTIVE かつ（残高>0 または 無料枠残>0）」のときだけ出る。

## 4. テーブル（migrations/0067）

`seller_billing_accounts`（プラン・支払方法・Stripe ID・状態・自動チャージ設定）、`seller_billing_ledger`（残高の増減。stripe_object_id UNIQUE で冪等）、`seller_billing_allowance_months`（月別無料枠）、`stripe_webhook_events`（イベントID重複排除）、`seller_billing_settings`（Price ID 等）。
既存 `seller_billing_wallets` / `seller_qualified_click_charges` / `seller_priority_memberships` をそのまま使う。

## 5. API

セラー（ログイン必須・POST は同一Origin）:
`GET /api/seller/billing`（残高・無料枠・プラン・Stripe接続状態）／`GET /api/seller/billing/ledger`／
`POST /api/seller/billing/topup {amount_jpy}` → Checkout URL／`POST /api/seller/billing/subscribe` → Checkout URL または請求書送付／
`POST /api/seller/billing/portal` → Portal URL／`POST /api/seller/billing/auto-recharge {enabled, amount_jpy, threshold_jpy}`。

管理者（authorizeAdminRequest）:
`GET /api/admin/seller-billing/accounts`／`POST /api/admin/seller-billing/accounts {account_name, contact_email, plan, payment_preference, tenants[], seller_ids[{tenant,seller_id}], seller_key?, inquiry_id?}`
→ Stripe Customer 作成・（Business）月額開始・チャージ用リンク作成・セラーへ案内メール／
`GET .../accounts/:key/ledger`／`POST .../accounts/:key/adjust {amount_jpy, note}`（振込の手動反映・返金）／`POST .../accounts/:key/subscribe`。

Webhook: `POST /api/stripe/webhook`（Stripe-Signature を HMAC-SHA256 で検証、5分の許容、event.id で冪等。処理失敗は 500 で Stripe に再送させる）。
受信イベント: checkout.session.completed / checkout.session.async_payment_succeeded / payment_intent.succeeded / customer.subscription.created・updated・deleted / invoice.paid / invoice.payment_failed。

## 6. Secret（Cloudflare Worker）

`STRIPE_SECRET_KEY`（sk_live_… または rk_live_…）、`STRIPE_WEBHOOK_SECRET`（whsec_…）。
未設定時: /health `checks.seller_billing.configured=false`。検索・/go は通常どおり動き、課金だけ行わない。セラー画面のチャージ・月額ボタンは無効表示。

## 7. 未実装・次の段階

- 複数セラーのログイン（現在は env の1アカウント）。請求アカウントは複数作れ、Checkout/Portal/請求書はメールのリンクから使えるが、管理画面ログインは1社分。
- 領収書・請求書 PDF の HOSHILU 側発行（Stripe の標準メール・Portal を使う）。
- 無料プランへの「ショップページなし」以外の機能差（ショップページ自体が未実装）。
