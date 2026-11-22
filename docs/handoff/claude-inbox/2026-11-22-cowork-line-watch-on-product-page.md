---
status: IN_PROGRESS
owner: Cowork（統括）
created: 2026-11-22 JST
to: Claude Code
approved: 大隆さん「ok」（11/22）
---

# LINE 値下がり見張り：商品ページに置く＋どこで止まっているかを測る

## 2 週間の結果（11/8〜11/21、本番 D1）
- `line_watch_clicked` 93 件、`line_watch_started` 1 件（大隆さんの 11/8 のテスト）、通知 0 通。
- 93 件は `recordWatchEvent`（src/line-price-watch.mjs）が session_id を入れていないため「1 セッション」に見えていただけで、**別々のクリック**。クローラーの UA は除外済み。
- つまり「押す → LINE が開く → 送信」の **LINE の送信で 92 人が止まっている**（または UA を名乗らない機械）。

## お願い（この順で 1 つの PR）
1. **商品ページ（/product?key=…、src/product-detail.mjs）の価格グラフのすぐ下に見張りボタン**を置く。文言「この値段より下がったらLINEで知らせる」。リンク先は既存の `/line/watch?key=<record_key>`（新しい仕組みは作らない）。価格の記録が無い商品（`latestObservation` が無い）には出さない。値下がりカード（owned-media.mjs）のボタンはそのまま。
2. **計測を分ける**：`/line/watch` に `from`（`product`／`drops`）を付け、`line_watch_clicked` の `content` に入れる。session_id が取れるなら入れる（取れなければ匿名の 1 クリック 1 行のまま）。KPI 画面の「1 セッションに集中」は誤解なので、注記を直す。
3. **LINE の手前で一言**：押した直後に、ホシルの小さなページ（1 秒で自動で LINE へ。ボタンも置く）で「LINE が開いたら『送信』を押すと見張りが始まります（友だち追加がまだなら追加も）」と見せる。このページの表示を `line_watch_clicked`、LINE へ進んだのを別イベントで数え、機械（JS を動かさない）と人を分ける。

## 守ること
- 通知の文面・送る条件・月の上限（150 通）は変えない。「買い時」「底値」は書かない。
- 記録が無い・古い商品にはボタンを出さない（AI の推定価格で見張らない）。
- 判定：公開後 7 日で、商品ページ経由のクリック数と `line_watch_started`（目標：開始 5 人以上、通知から戻ってモールへ 1 人以上）。Cowork が 11/30 に確認。

## Claude 記録
### 2026-11-22 20:14 JST 受領（定期巡回）
- 理解: 大隆さん承認済み（11/22「ok」）。1 つの [PATCH] で ①商品ページのグラフ直下に見張りボタン（記録が新しい商品だけ）②`/line/watch` に from=product|drops、content に入れる ③LINE の手前の小さなページ（表示＝`line_watch_clicked`、LINE へ進んだ＝別イベント）。通知文面・条件・150 通上限は触らない。
- D1 実測（20:14 時点・全期間）: `line_watch_clicked` 93（11/08〜11/21）、`line_watch_started` 1、`line_watch_notified` 0。
- 状態: IN_PROGRESS（実装中）
