# Claude → Codex: 商品ページを検索エンジンに公開（購入先クリックを無料で増やす）— 2026-10-25

## 大隆さんの決定（2026-10-25）
「購入サイト送客を無料で100倍にする方法は？」→ Claude の提案「Google から買うボタン付きの商品ページに直接来てもらう」→「初めて良い、Codex とも連携して」。
成果指標は購入先クリック（marketplace_click、content=product_detail）。作業数を成果にしない。

## Claude がやったこと（この [PATCH] で本番反映）
- `/product?key=…`: 価格の記録（price_observations）が **14 日以上**あり商品名がある商品だけ `index,follow`。それ以外は従来どおり noindex。
  - サーバーで本文を組み立てる（D1 だけ読む。楽天・Yahoo! の API は呼ばない）: 商品名（h1）、今いくら？（最新の記録の価格・日付）、7日前／30日最安・最高／中央値との比較、記録開始日、推移グラフ（SVG）、「楽天市場で買う」（/go の署名リンク、so=PRODUCT_DETAIL）。
  - title「{商品名}｜今いくら？価格推移と最安値（楽天市場）| HOSHILU」、description、canonical（`from=` を含まない）、JSON-LD Product/Offer。
  - 開いたあとは従来どおり `product-detail.mjs` が `/api/product` で最新の価格に差し替える（最新が取れない時は記録の表示を残す）。
  - cache-control: public, max-age=600, s-maxage=3600（index のページだけ）。
- `/sitemap-products.xml`: 14 日以上の商品の一覧（lastmod=最後の記録日、最大 20,000 件、1 時間キャッシュ）。robots.txt に Sitemap 行を追加。
- 2026-10-24 時点の対象: 記録 14 日以上 1,062 商品（7 日以上 1,874、全体 7,673）。毎日増える。

## Codex にお願いしたいこと（本番確認・継続観測）
1. 本番で `/sitemap-products.xml` が 200・URL 数（レスポンスヘッダ `x-product-count`）を記録する。`/product?key=<一覧の先頭>` を開き、`<meta name="robots" content="index,follow">`・canonical・h1・今いくら？・グラフ・買うボタンが **JS なしの HTML に入っている**ことを確認（curl で可）。記録が少ない商品が noindex のままであることも 1 件確認。
2. Search Console への sitemap 登録は大隆さんにしかできない（ログイン）。朝ブリーフで「Search Console に https://hoshilu.app/sitemap-products.xml を追加」を 1 行依頼する（Claude からも伝える）。
3. 毎朝の KPI に次を足す: 対象商品数（sitemap の件数）、Google からの `/product` 着地（growth_events の source=google / referrer）、`/product` 起点の marketplace_click（content=product_detail）。登録から 2〜8 週間は増えなくて正常。
4. 楽天 API の負荷: クローラが JS を実行すると `/api/product` → 楽天 API が呼ばれる。`search_provider_degraded` や楽天の 429 が増えたら Claude に知らせる（対策: /api/product のキャッシュ、または Googlebot には記録だけ返す）。
5. 次の段階（Claude が実装予定・Codex は要望があれば書く）: 記録する商品を毎日増やす（楽天・Yahoo! のランキングから自動で観測対象に追加）、ジャンル別の値下がりページから商品ページへの内部リンク強化、商品ページの画像（記録に image_url が無いので別途）。

## 守っていること
- 価格は HOSHILU が API で確認して記録した値だけ。将来の価格は書かない（「今が底値」「買い時」は出さない）。
- Amazon は対象外（記録していない）。アフィリエイト表記はページ下部に従来どおり。
- 検索本文・会員 ID は扱わない。
