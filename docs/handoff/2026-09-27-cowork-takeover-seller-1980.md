> **2026-09-28 追記**：Seller 関連の正本は `docs/handoff/2026-09-28-hoshilu-seller-master-v1.md`（seller-master-20260928-v1）に統合された。以下は 9/27 時点の記録として残す。Codex への受け取り依頼は `2026-09-28-claude-to-codex-seller-master.md`。

# Cowork → Codex：Seller 1,980円の主担当を一時引継ぎ（2026-09-27 17:15 JST）

## 経緯
大隆さん（2026-09-27）「コーデックスがクレジット切れだから君が進めて」。指示書 §1 の「明示的な主担当移管」に当たるため、Codex が戻るまで Cowork が Seller 1,980円の残作業を進める。戻ったらこのファイルから再開すること。

## Cowork が本番に入れたもの
- **D1 migration 0087 / 0088 / 0089 を本番適用**（2026-09-27 08:14:16 UTC）。大隆さんの明示承認（「入れていい」）を取ってから実行。いずれも CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS のみで、既存行の変更・削除・課金なし。`d1_migrations` に id 88/89/90 として記録。確認: `seller_contact_permissions`・`seller_inquiry_notifications`・`seller_listing_pilots`・`seller_listing_pilot_audit`・`seller_listing_pilot_saves`・`idx_seller_pilot_owner` が存在。
  - ローカルに未追跡の `migrations/0087_seller_first_payment.sql` が残っているが、これはリポジトリに無い旧案で適用していない。
- #509 Threads `seller-start-flow` から「開始時の支払い登録は不要」を削除。
- #510 Seller 投稿に買い物客向けの札・コメント誘導を付けない／X カルーセルは見出し＋料金条件。
- #511 IndexNow（JST 4:00 に sitemap の URL を Bing 等へ送信、月曜は全 URL）。
- 未公開の投稿キュー 20 行を 1,980円・新画像に差し替え（旧料金 0 行）。日次販促タスクの固定文から旧料金と営業メール投入を削除。

## まだ受付を開始できない理由（Cowork だけでは進められないもの）
1. **Stripe**：大隆さんの Stripe 認証リセット待ち。新 Product/Price（1,980円・JPY・月次・税込、lookup_key `hoshilu_seller_1980_jpy_month_inclusive_v1`）の作成・確認、`SELLER_PILOT_1980_{TEST,LIVE}_{PRICE,PRODUCT}_ID` の設定、テストモード E2E（カード登録→30日→解約/自動更新）。実顧客への試験課金はしない。
2. **特定商取引法に基づく表記**：リポジトリに無い。事業者名・所在地・連絡先を推測で書かない。大隆さんの判断待ち。
3. 上の2つが揃うまで `SELLER_MANUAL_PILOT_ENABLED` 等の受付フラグは OFF のまま。「準備中」の表示を維持。

## 実測（2026-09-27）
- 掲載見本相談：本番の `seller_business_inquiries` 3件はすべて「テスト」。外部からの相談は 0 件。
- 営業メール 184 通送信（〜9/25）→ 返信 0（Gmail でも確認）。9/27 以降は同意ゲートで停止。
- /for-sellers：9/21〜9/27 に 34 セッション、CTA クリック 1。
- Threads 着地の多くは公開後 1 分以内の landing_view のみ（リンクのプレビュー取得とみられる）。実利用者は数件/週。
