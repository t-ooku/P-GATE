# 外部Seller獲得・30日版 実施記録

## 着手時
- 2026-09-27 04:10以降JST、本番/開発 `feature/ui-search-v2`、HEAD `ec23353e`。未コミットなし。進行中PRに今回対象の競合なし。
- healthはok:true、missing/weak空、OAuth/Runway接続正常。#369は既存のYahooタイムアウト報告がopen。今回の新しい障害とは断定しない。直近Claude連絡は9/20で前回確認済み。
- 前回実測基準値（9/27 03:57 JST）：相談3（NEW・FOR_SELLERS_FALLBACK）、未適用0087/88/89。外部登録0。今回まだ最新実数へ置き換えない。
- Gmailプロフィール再確認：設定通知先と異なるアカウントのまま。返信・Resend配達・実通知は未確認。過去API受付185は配達185ではない。
- 許諾確認済み/適格候補0、具体的対話未確認、許諾済み外部見本/公開/本人確認/有料契約0。調査対象10は適格候補10ではない。新たなメール・SNS送信なし。

## 実装
- 単一条件定義 `public/seller-trial-policy.mjs`。新条件external-seller-30d-v1、旧external-seller-calendar3-v1保持。UTC保存、JST表示、30×24時間、終了時刻排他。
- 最初の承認済み商品公開と期間開始を同一DB文書のトランザクションで保存。DB失敗・下書き・相談・登録では開始なし。商品1件でも公開で開始し、獲得は3商品+外部確認+本人確認の別判定。非公開/編集/再公開は同じ期間を保持。
- 作成時に過去案内の確認を要求。旧3か月案内は証跡と条件IDを保持。既存有料アカウント/契約テーブルを更新しない。条件不明の旧下書きは確認するまで拒否。
- 7/21/30日担当作業を既存手動掲載管理に追加。対応証跡/担当/計測可否/分/追加費用を記録。自動通知は未設定。
- 体験中は継続関心のみ保存。期限後、本人の同意POST後に既存Stripe Checkout。料金・通貨・月次・税込・test/liveを照合。保存済み同意から固定冪等キー、24h超の不明状態は再作成しない。成功画面/GETで有料化しない。署名検証済みWebhook/本人の状態確認POSTでStripe最新契約+入金を確認。有料の更新停止も本人POST。
- 決済は既定OFF。疑似Stripe応答の単体/結合テストのみ。実Stripeテスト環境、本番有料化、実ユーザー課金は未実施。
- LP/料金FAQ/入口/クリエイター向け新規募集から一般向け旧3か月表現を削除。条件の稼働検証フラグが一致した場合だけ30日・支払い登録不要・自動有料化なしを表示。旧契約管理の個別条件・履歴は保持。
- 営業許諾保護は維持。相談通知は稼働確認済みの場合のみ新条件を記録し、再試行でも初回条件を保持。

## 未確認/停止位置
外部店舗の許諾・対話へ未到達。正しいGmail・Resend・管理画面の接続、migrationと期限後の扱いの承認が必要。承認後、保存3件照合→本人管理のQA受信確認→商品の使用許諾→限定見本→店舗承認→公開→本人確認へ。iPhone/SNS内ブラウザ実機未確認。価格拒否や実需要を推測しない。

## 公式資料（今回再確認）
- https://resend.com/legal/acceptable-use : cold outreach不可、明示opt-in。認証/相談返信を全停止する指示ではない。
- https://resend.com/docs/webhooks/event-types : sent/API受付とdelivered/相手メールサーバー到達を分離。
- https://resend.com/docs/webhooks/verify-webhooks-requests : raw body/署名/時刻検証。
- https://docs.stripe.com/api/checkout/sessions/create / https://docs.stripe.com/api/idempotent_requests / https://docs.stripe.com/billing/subscriptions/webhooks : 同意後Checkout・有限の冪等保存期間・最新契約照合。

- 追加監査：30日経路の有効化後は、旧adminアカウント作成から登録日起算3か月Stripe契約を新設する入口を拒否。既存アカウントの更新・契約・履歴は維持。旧個別案内の開始条件が不明なら公開前に確認し、30日へ置換しない。
