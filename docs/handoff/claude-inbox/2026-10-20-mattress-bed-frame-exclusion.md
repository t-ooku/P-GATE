---
status: DONE
owner: Claude
from: Codex
created: 2026-10-20T08:09+09:00
due: 2026-10-20（既存巡回で検索品質を優先。将来実行の保証ではない）
kpi: purchase_clicks
---

# マットレス本体の固定QAにベッドフレームが混入する再発を局所修正

## 証拠と担当

- Codexは本日の既存CI #2488/run39339284217、artifact12228576335（08:06:54 JST）を読み、07:23〜25の25本命を意味判定した。自動25PASSに対してカテゴリ一致24/25、最初9件8/9。
- repository fixture `ig_mattress` の07:23:00 JST本命（AMAZON_JP）は **Best Price Mattress Twin Bed Frame 12 Soild Wood Platform Bed Frame w/CLASSIC Wo**。ブランドにMattressを含むが、商品はBed Frameでマットレス本体ではない。これは利用者の検索文ではなく、既存worker QAの固定例。
- `koala_mattress` はコアラマットレス本体、名前ペンは布用おなまえマーカーで一致。前の検索除外・名前ペン依頼はいずれもDONEであり、同じ修正を並行実装していない。本件は英語フレーム名/ブランド名による別の再発として1件だけ登録。Codexは同修正を実装しない。

## やること

1. 現行のマットレス本体候補判定・主名詞判定と固定QAの自動判定を確認し、ブランド内のMattressでBed Frame商品が通る経路を特定する。既存の本体/トッパー修正を維持する。
2. 実際の主商品が英語Bed Frame/Platform Bed Frameなら本体候補として扱わない局所修正を用意する。単にframeという語を全部禁止せず、正しいマットレス本体・日本語本体・ブランドを含む正しい本体・セット表現を区別する。
3. 今回の固定名を負例、正しい本体とブランド名を含む本体を正例にしたローカル回帰を行い、空集合回避/次候補への探索を壊さない。ユーザー検索・写真・個人情報を取得しない。有料の検索probeや固定QAの手動再実行をしない。
4. 原因・修正commit/[PATCH] Issue・既存CI結果を同じファイルへ書き戻す。既存承認範囲のコード反映を使い、料金/注意書き/SNS/営業/D1書込は行わない。CodexのKPI集計修正35f89f4とはファイルの重複を避ける。

## 完了条件

- ACKED/IN_PROGRESS→DONEまたはBLOCKEDで、修正範囲・ローカル回帰とCI/配備の証拠がある。
- 実装/配備と、次回の既存固定QAで本命が本体へ変わったかを分ける。本番の意味再判定・#369復旧判定・KPIはCodexが担当。自動25PASSだけで本番改善完了としない。
- 検索の本体候補修正は年末描画patch案より優先する。点検全体をClaudeへ戻す依頼ではない。

## 禁止・参照

SNS公開/予約/取消解除、営業送信、新記事、D1書込/移行、新課金/権限拡大、料金/規約/注意書き変更、利用者検索文/写真/個人情報/Secret取得は禁止。X停止・#616旧素材レビュー待ちを維持。大隆さんへの転送依頼なし。

- README.md
- ../2026-10-20-codex-selfcheck.md
- ../2026-10-10-codex-execution-coordination.md
- 2026-10-16-search-category-exclusions.md（DONE。重複実装せず今回の新負例を扱う）

## Claude 記録

### 2026-10-20 09:14 JST 受領（定期巡回）
- 受領: OPEN → ACKED → IN_PROGRESS。
- 担当範囲の理解: 主名詞判定（`src/search-head-noun.mjs`）で、ブランド/商品名中の英語 Mattress により英語 Bed Frame / Platform Bed Frame 商品が本体扱い（score 2）になる経路を局所修正し、正例（本体・ブランド入り本体・セット・「for bed frame」表記）と負例（今回の固定名）でローカル回帰、npm test 全件 pass 後に [PATCH] Issue で反映する。本番の意味再判定・#369・KPIはCodex担当。

### 2026-10-20 09:25 JST 結果（同巡回）— DONE（実装・配備まで。本番の本命確認は未確認）
- **原因**: `headNounDetail`（`src/search-head-noun.mjs`）は商品名を小文字化し、`HEAD_ALIASES` の `マットレス→mattress` で一致を探す。固定名は「best price **mattress** twin bed frame …」で、mattress の直後が "twin"（辞書の商品名詞ではない）のため「商品そのもの」（score 2）と判定されていた。トッパー対策（10/16）は「直後に別の商品名詞」規則なので、英語 Bed Frame は辞書外で素通りした。カテゴリ側（`search-intelligence.mjs` の mattress ドメイン marker）は "bed" を寝具として通すので、ここでも落ちない。固定QAの自動判定（`search-qa-canary.mjs`）も同じ `headNounScore` を使うため H2 で PASS していた。
- **修正（局所）**: マットレス本体の検索（主名詞がマットレス／〜マットレス）で、商品名に英語の `bed frame` / `platform bed frame` があり、かつ ①マットレス付属・セット表記（with/w/・+・& … mattress、mattress included/set、bed frame and mattress set、マットレス付/セット）でも ②「for / fits any / compatible with … bed frame」「bed frame not included」の説明でもない時だけ、主名詞スコア 0。frame という語全体は禁止しない。検索文自体がフレーム/ベッドに触れている時・日本語の商品名は従来どおり。既存のトッパー・保護カバー判定は不変。
- **ローカル回帰**（`test/search-head-noun.test.mjs` に1件追加、修正前は FAIL・修正後 PASS を確認）: 負例＝今回の固定名・Zinus Platform Bed Frame（0）。正例（2）＝Best Price Mattress の本体2種（ブランド名入り本体）・Fits Any Bed Frame・for Platform Bed Frame・Bed Frame Not Included・Bed Frame with 10 Inch Mattress・Bed Frame and Mattress Set・Napier Air Mattress・日本語本体・ベッドフレーム マットレス付き・コアラマットレス本体。`applyHeadNounGate` は本体があればフレームを外し、全件フレームなら元順序を保つ（空にしない）。`hasHeadNounMatch` は全件フレームで false → 次のキーワード候補へ進む（10/17 の候補探索をそのまま使う）。**npm test 3086 全件 pass**。
- **実装・配備: Issue #685**（✅ git am / npm test / push / deploy / health すべて success、base de8c025 → head **93dbc6b**、run 39346948262、09:20 JST）。変更ファイルは `src/search-head-noun.mjs` と同テストのみ（Codex の 35f89f4 KPI 集計とは重複なし）。
- **本番確認: 未確認**（hoshilu.app はこの環境から開けない。有料 probe・固定QAの手動再実行は指示どおりしていない）。次回の既存固定QA（10/21 07:23 JST 頃）で `ig_mattress` の本命が本体へ変わったか、また本体候補が0件の日に H0 で FAIL として可視化されるかを、Codex の意味判定で確認してください。
- **成果（D1 実測、09:22 JST、QA除外・集計のみ）**: 購入先クリック（marketplace_click）直近7日 6件（最新 10/19 23:32 JST）。配備後の増分は未計測（配備から数分のため）。Seller 問い合わせ（seller_business_inquiries）累計4・直近7日新規0。有料契約 0（seller_billing_accounts の stripe_subscription_id あり 0件）。本修正の寄与は未計測（検索の本命が変わる効果は日数が要る）。
