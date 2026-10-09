# Codex 依頼：出品者向けページ（/for-sellers）の見た目を、もっとおしゃれにする（2026-10-09 Cowork → Codex）

大隆さん指示（2026-10-09）：「もっとおしゃれにするには Codex に URL 渡して改修してもらえばよい？」→ Codex に依頼。
対象 URL：https://hoshilu.app/for-sellers （相談フォームは #businessForm）

## 1. 目的
出品者（ショップ・ブランド）が最初の画面で「月額1,980円なら試してみたい」と思える見た目にする。
**文言・料金・約束の範囲は変えず、見た目（レイアウト・余白・色・図・動き）だけ** を磨く。
入口は「掲載プラン 月額1,980円」。AI販促担当（Light 9,800円・Standard 19,800円）は「販促まで任せるなら」の次の一歩。

## 2. 必ず知っておくこと（ここを外すと本番が変わらない）
- 本番は `SELLER_PROMO_PLANS_ENABLED=true`。本番で見えている **第一画面・中間の3節・料金欄の見出し・AI販促担当の料金カード・FAQの先頭2問** は
  `tools/line-worker/src/seller-promo-public-pages.mjs` が Worker で差し込んだもの。`public/for-sellers.html` の該当部分（マーカーの間）だけ直しても本番は変わらない。
  - マーカー（`<!--SELLER_PROMO_HERO_START-->` ほか6種）は for-sellers.html に **各1回ずつ** 残す（テストあり）。
  - 両方（通常版・販売ON版）で同じ見た目になるように直す。
- 本番と同じ HTML を手元で作る方法：
  `node -e "import('./src/seller-promo-public-pages.mjs').then(m=>{const fs=require('fs');fs.writeFileSync('public/_preview.html',m.applyPromoPlansToPublicPage('/for-sellers',fs.readFileSync('public/for-sellers.html','utf8')))})"`
  （確認後に `_preview.html` は消す。コミットしない）
- CSS の読み込み順：`for-sellers.css` → `for-sellers-pricing.css?v=10` → 本文先頭で `instagram-look.css?v=2`（**最後に読まれて上書きする**。順番はテストで固定）。
  CSS を変えたら `for-sellers-pricing.css` の `?v=` を上げ、テスト（seller-business-inquiries.test.mjs の v= 指定）も合わせる。
- 構成（上から）：第一画面 → 販売先そのまま注記 → **#included「1,980円でできること」6枚** → #how 呼び戻しの流れ（8段・数はテスト固定）→ #demand-now 需要（数字は JS が差し込む。HTMLに人数・件数を書かない）→ #demand-check → 販売ON版の3節（モールの外）→ #pricing（1,980円・Light・Standard）→ #kpi → #sample-flow → #faq → #businessForm。

## 3. やってほしいこと（例。見本サイトが届いたらそちらを優先）
- 第一画面：HOSHILU の色（ピンク #ff4f9a → 紫 #7357ff → 水色 #23b8ff、文字 #14142a）を生かして、もっと印象的に。
  例：検索結果の一番上に「PR」枠が出るイメージを **HTML/CSS の図で** 見せる（実在の他社商品写真・ロゴは使わない。架空の商品名・ぼかし枠で）。
  見出し用フォント `public/fonts/hoshilu-hero.woff2`（"HOSHILU Hero"・太さ900、OFL）は使ってよい。
- 料金：「月額1,980円（税込）」を一番大きく、30日無料の注意書きは読める大きさのまま、カード型で見やすく。
- 「1,980円でできること」6枚：アイコン（自作 SVG）・色分けで、ひと目で分かるように。
- 節ごとの余白・背景の切り替えでリズムを作る。スマホでは画面下に「1,980円の掲載を相談する」の追従ボタンも検討（フォームが見えている間は隠す）。
- 動きは控えめに（`prefers-reduced-motion` を尊重）。

## 4. 変えてはいけないこと
- 文言・料金・条件：1,980円（税込）／AI販促担当 9,800円・19,800円／30日無料と「開始前にカード登録・31日目から自動課金・毎月更新」の注意書き／「現在は体験開始の準備中です」。
- 「PR」枠の説明（検索語の条件にすべて合うときだけ・最大2件・通常の並びとは別・掲載順位や表示回数は保証しない）。
- 成果を約束する語（必ず売れる・売上が上がる・No.1・最安・今だけ 等。`src/seller-promo-qa.mjs` の PROMO_FORBIDDEN_PHRASES）を使わない。
- 他社のロゴ・商品写真を使わない（モール名は文字だけ）。人数・実績・お客様の声を作らない（実在しないものを載せない）。
- ショップ専用ページ（ショップタブ）の説明は戻さない（掲載店が集まるまで出さない、大隆さん決定）。
- フォーム：`privacy_consent` 必須・`marketing_consent` 任意、パスワード等を求めない、送信の仕組み（for-sellers.js）は変えない。
- 9,800／19,800 を `public/for-sellers.html` に直接書かない（販売ON時だけ Worker が差し込む方針）。

## 5. 確認（完了の条件）
- `npm test`（tools/line-worker）全件 pass。
- 320 / 360 / 390 / 430 / 768 / 1280px で、横はみ出しなし・文字の重なりなし・ボタンが押せる（Playwright 等で撮影）。
- 販売ON版（上の preview）と通常版の両方で確認。
- 変更前後のスマホ・PCのスクリーンショットを大隆さんに見せる。

## 6. 見本（大隆さんから届き次第ここに追記）
- 未定（「この雰囲気にしたい」サイトURL・スクショを 1〜3 枚もらう）。

## 参考
- 経緯：#606（検索結果の「PR」枠）・#607（/for-sellers を1,980円入口に）。Cowork の project doc `claude/hoshilu_seller_1980_entry_and_search_pr_2026-10-09.md`。
