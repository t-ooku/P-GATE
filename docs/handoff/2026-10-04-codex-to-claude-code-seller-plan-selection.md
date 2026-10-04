# Codex → Claude Code：Seller 3プランの相談導線・計測修正依頼

- 日時: 2026-10-04 09:40 JST
- 対象ブランチ: `feature/ui-search-v2`
- 目的: 作業完了ではなく、外部Sellerの相談・契約・売上につながる導線にする
- 状態: 読み取り監査済み。Codexは下記所有ファイルを編集しない

## 確認した事実

本番 `https://hoshilu.app/for-sellers` では次の3プランを表示している。

- 掲載プラン: 月額1,980円（税込）
- AI販促担当 Light: 月額9,800円（税込）
- AI販促担当 Standard: 月額19,800円（税込）

しかし、本番の `#sellerBusinessForm` にはプラン選択欄がない。Light／StandardのCTAも同じ `#businessForm` へ移動するだけで、どのプランへの関心かをフォームへ引き継がない。

`public/for-sellers.js` は `plan_interest` を送信する実装を持つが、現在のDOMに同名フィールドがないため `null` になる。サーバー側 `src/seller-business-inquiries.mjs` の `PLAN_INTERESTS` も旧値のみで、Light／Standardを受け付けない。このままでは高単価プランの相談件数・成約率を分けて測れず、営業返信でも希望プランが分からない。

またフォーム直前の無料体験説明は1,980円だけを示すため、Light／StandardのCTAから来た店舗には条件が一致しない。

## 変更をお願いしたいファイル

- `tools/line-worker/public/for-sellers.html`
- `tools/line-worker/public/for-sellers.js`
- `tools/line-worker/src/seller-business-inquiries.mjs`
- 関連するSeller問い合わせ・LPテスト

## 期待する差分

1. 相談フォームに「検討中のプラン」を追加する。
   - 掲載プラン 1,980円
   - AI販促担当 Light 9,800円
   - AI販促担当 Standard 19,800円
   - 相談して決めたい
2. 各料金カードのCTAから来た場合、そのプランを初期選択する。利用者は変更できるようにする。
3. `plan_interest` の保存・通知・管理画面表示を、新3プランで壊さない。既存の旧値・履歴は維持する。
4. 選択プランに応じて、フォーム直前に30日無料・カード必須・31日目からの自動更新金額を正しく表示する。
5. `seller_cta_clicked` と相談受付KPIにプランを含め、最低限次をプラン別に集計可能にする。
   - LP到達
   - 料金CTA
   - フォーム開始
   - 送信成功
   - 商談化
   - 契約
6. 料金・規約・Price ID・無料期間の新条件は変えない。クリック従量課金を戻さない。
7. スマホ実機相当、通常テスト、既存Seller問い合わせの回帰を確認する。

## 所有と競合回避

`public/for-sellers.html` と `public/for-sellers.js` は現在Claude Code所有のため、Codexは編集しない。本書で対象・理由・差分要旨を宣言し、Claude Code側の対応結果を待つ。

`src/seller-business-inquiries.mjs` は上記LPと同時に整合させる必要があるため、本件ではClaude Code側で一括変更してほしい。Codexは別コミットを重ねない。

## 成功条件

「3プランを表示した」ではなく、どのプランの相談かが保存され、通知・管理画面・KPIで追え、Light／Standardの商談と契約をプラン別に改善できること。

## 大隆さんの判断（2026-10-04、Cowork 経由）

**OK。Claude Code は本依頼を進めてよい。** 補足（Cowork）:
- 外部店への案内6通は 10/3 に送信済みで、返信・相談はまだ 0 件。返信が来る前に「検討中のプラン」が保存されるようにしておくと、営業返信の型（`2026-10-03-cowork-ai-promo-reply-templates.md`）でプラン別に答えられる。
- `plan_interest` の値は管理画面・通知・KPI（`seller_cta_clicked`・相談受付）で同じ語を使う。旧値の履歴はそのまま残す。
- 結果は `2026-10-02-claude-code-ai-promo-progress.md` に追記し、本ファイルに「済」と日時を書く。
