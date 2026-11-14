# 390px 実描画 QA 結果｜検索完了後→購入先CTA（Claude、2026-11-14）

依頼: `docs/handoff/claude-inbox/2026-11-14-mobile-purchase-cta-qa.md`（Codex 起票・調査のみ）。修正・配備はしていない。

## 1. 表示環境（実描画）
- 日時: 2026-11-14 14:10〜14:26 JST
- ブラウザ: Chromium（Playwright 1.63.0、Claude クラウド実行環境）。`viewport 390×844`、`isMobile: true`、`hasTouch: true`、`deviceScaleFactor 2`、`ja-JP / Asia/Tokyo`
- 描画対象: **feature/ui-search-v2 HEAD `21e6984` の `tools/line-worker/public/` をそのままローカル静的配信**（`http://127.0.0.1:8799/?qa=1`）。HTML/CSS/JS は本番と同じファイル。
- モック（本番・外部には一切アクセスしていない）:
  - `/api/config` → テスト用 turnstile_site_key、Turnstile スクリプトはスタブ（トークン即発行）
  - `/api/knowledge` → `src/unified-results.mjs` の `unifyResults()` で作った応答（候補は D1 `price_observations` の実在商品名 rom&nd グラスティングカラーグロス系 5〜6 件、価格 1,320〜1,370 円、モールは楽天/Yahoo!/Amazon の架空 URL）
  - `/api/events` はローカルで受けて記録（本番 D1 に届かない）
  - 外部ホストへのリクエストは Playwright の route で全て abort（記録された遮断先: `aml.valuecommerce.com/vcdal.js`、タップ時の `item.rakuten.co.jp/qa/a`）。**本番の検索・/go・実際の購入先は押していない。**
- 限界: 本番 Worker の応答・本番画像・本番の実データ件数ではない（API はモック）。実機スマホ（Safari の UI バー・フォント差）ではない。スクリーンショットはこのセッションの作業領域にのみ保存（リポジトリには DOM 実測値を記録）。

## 2. 検索完了後〜最初のカードの実測（390×844）
2 パターン（長い商品名を先頭に置いた 6 件／短い名前 5 件）で同じ結果。

| 項目 | 実測 |
|---|---|
| 検索送信→カード描画 | 約 5.0 秒（モック応答。主に UI 側の待ち・アニメーション） |
| 検索完了後の自動スクロール位置 | `scrollY = 1015` |
| 画面上部の固定物 | `#stickySearch`（top 0、高さ 108px） |
| 画面下部の固定物 | `.tab-bar`（top 779、高さ 65px） |
| 結果の見出し行（件数・おすすめ順/安い順） | 文書 top 1112 → 画面内 top **97px**（固定検索バー 108px の下に**約 11px 以上隠れる**） |
| 1 枚目カードのリンク領域（`.unified-card-link`） | 画面内 top **144** 〜 bottom **458**、幅 151 × 高さ 314px → **スクロール 0px で最初の viewport 内に全体が見える** |
| 1 枚目カードの中の順序 | 画像（131×131、画面内 y 154）→ 商品名（2 行で省略、y 293）→ モール名バッジ → 「過去の価格と比べる」（131×30）→ 価格 ¥1,320（y 408）＋「価格比較」ボタン（**58×27px**） → 価格通知/いつもの/気になる/口コミ（63×34〜38px） |
| 2 列目（2 枚目）カード | 同じ高さで右列に並ぶ（left 201、幅 151） |
| 3 枚目（2 段目） | top 1576（画面内 561）。価格行は y 846 付近で下部タブバー（779〜）の下 → スクロールが必要 |
| 横はみ出し | `document.documentElement.scrollWidth = 390`（なし）、各カード `scrollWidth ≤ clientWidth` |
| 重なり | 1 枚目カード中心の最上位要素はカード内（固定物との重なりなし） |
| 長い商品名（宣伝文句 90 字超） | 2 行で省略表示、カードの高さは短い名前と同じ 314px（崩れなし） |
| リンク生成 | `href` = モック候補の `tracking_url`、`target=_blank`、`rel=noopener noreferrer`、`data-marketplace` = RAKUTEN_JP / YAHOO_JP / AMAZON_JP（URL のホスト名と一致） |

## 3. 押下 1 回あたりのイベント（ローカルモック）
| タップした場所 | 遷移 | 記録されたイベント |
|---|---|---|
| カードの商品名（= `.unified-card-link`） | 新しいタブで購入先 URL（route で遮断） | `ai_result_clicked` 1・`marketplace_click` **1**・`search_outbound_text` 1 → **1 回 1 件で正常** |
| 「過去の価格と比べる」（`.unified-card-detail`） | 同じタブで `/product?key=…&from=search` | 購入先イベントなし（正常） |
| **「価格比較」ボタン** | **価格比較を開く ＋ 同時に新しいタブで購入先 URL へ遷移**（`item.rakuten.co.jp/qa/a` へのリクエストを観測） | `price_comparison_opened` 1 のみ。**`marketplace_click` 0** |

## 4. 改善候補（重要度順、最大 3 件）

### P1. 「価格比較」を押すと購入先へも飛び、その送客が計測されない
- 再現: 上の環境で検索 → 1 枚目カードの「価格比較」をタップ。
- 期待: 価格比較だけが開く（購入先へは行かない）か、購入先へ行くなら `marketplace_click` が 1 件残る。
- 実際: 価格比較が開くと同時に新しいタブでカードの購入先 URL が開く。イベントは `price_comparison_opened` だけで `marketplace_click` は 0。
- 原因（コードで確認）: `app.js` 1306〜1307 行で `.ai-price-compare-button` を buySlot に移し、`unified-results-ui.mjs` の card() がその buySlot を `.unified-card-price-row` に入れる。価格行は `<a class="unified-card-link">` の中にあるため、ボタンが**リンクの中の button** になり、ボタンの処理が `preventDefault` しないのでリンク本来の遷移も起きる。`growth-analytics.mjs` は `closest('a,button')` で button を拾うため `marketplace_click` にならない。
- 影響: 利用者が意図せず購入先へ飛ぶ（比較を見たい人の離脱）＋ 送客の取りこぼし（D1 実測: 直近 7 日 `price_comparison_opened` 2 件・`marketplace_click` 30 件／18 セッション。取りこぼしは最大でも 7 日 2 件程度で、60→8 の主因とは言えない）。
- 修正の方向（Codex 判断）: ボタンのクリックで `event.preventDefault()` と `stopPropagation()`、またはボタンを `<a>` の外（article 直下）に出す。
- 回帰リスク: カード全体タップの送客（正常に 1 件）を壊さないこと。`growth-browser-purchase-flow` の 1 回計測テストに「リンク内ボタンでは遷移しない」ケースを足すのが安全。

### P2. 購入先へ行くボタンが見た目に無い（カード全体がリンクだが、文字で示されていない）
- 再現: 検索直後の画面（スクロール 0）。
- 実際: 1 枚目カードは全体が購入先リンク（151×314px）で viewport 内に見えているが、ボタンとして見えるのは「過去の価格と比べる」「価格比較」「価格通知」「いつもの」「気になる」「口コミ」の 6 つで、**どれも購入先へ行くボタンではない**。購入先は「楽天市場」などの小さいバッジでしか示されない。
- 期待（仮説）: 「楽天で見る」のような購入先ボタンが 1 つあれば、押す場所が分かる。
- 根拠の強さ: 画面からの観察のみ。送客が少ない原因かどうかは**不明**（実機・実利用での検証なし）。文言追加は LP/画面文言の変更に当たるため、実施判断は Codex／大隆さん。
- 回帰リスク: ボタンを足すとカードの高さが増え、2 段目以降が下がる。

### P3. 検索完了後の自動スクロールで、件数と「おすすめ順／安い順」が固定検索バーの下に隠れる
- 再現: 検索完了直後（`scrollY 1015`）。
- 実際: 見出し行の top が画面内 97px、固定検索バーは 0〜108px → 並べ替えの切り替えが半分隠れる（スクリーンショットで「おすすめ順／安い順」の上側が切れているのを確認）。
- 期待: 見出し行が固定バーの下（約 108px 以降）から見える。`scroll-margin-top` を固定バーの高さ分とるなど。
- 影響: 「安い順」に気づきにくい。送客への影響は不明。回帰リスク小（スクロール位置のみ）。

## 5. 未確認（理由）
- 本番 `hoshilu.app` の 390px 実描画: このクラウド環境から hoshilu.app へは接続が遮断されており、回り込みは禁止のため未確認。
- 実機スマホ（iOS Safari のアドレスバー・ホームインジケータによる実 viewport 差）: 実機なし。
- 本番データでの件数・画像読み込み時間・PR 枠（sponsored）表示時の位置: モックに PR 枠を入れていない。PR 枠ありだと 1 枚目カードが下がる可能性がある（未計測）。
- 検索失敗時（緊急フォールバックのモール一覧）の 390px 表示: 今回は未計測。
- 60→8 の原因: 本 QA では特定していない（P1 は計測漏れ・誤遷移の不具合だが件数は小さい）。

## 6. KPI（D1 実測、2026-11-14 14:23 JST、traffic_class≠QA、直近 7 日）
- 購入先クリック `marketplace_click`: 30 件／18 セッション
- `price_comparison_opened`: 2 件
- Seller 問い合わせ `seller_business_inquiries`: 7 日 0 件（累計 4 件）
- 有料契約数: 未計測（初回成立日時の取得経路が未接続のため）
