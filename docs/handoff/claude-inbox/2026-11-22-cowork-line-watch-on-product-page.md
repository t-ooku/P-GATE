---
status: DONE
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

### 2026-11-22 20:30 JST 結果 — DONE（実装・本番反映まで。画面の目視は未確認）
- **実装**: [PATCH] Issue **#828**（コミット 7b02fba、base 3e74079）。apply-patch.yml の ✅ コメント 11/22 20:25 JST: git am・push・deploy・health すべて success（run 45017095031）。ローカル `npm test` pass 3279 / fail 0（既存 3277 ＋新規 2）。
  1. 商品ページ: SSR（記録 14 日以上の index ページ）と開いたあとの画面（`/api/product` の `line_watch`）の両方で、価格グラフの直下に「この値段より下がったらLINEで知らせる」→ `/line/watch?key=…&from=product`（開いたあとは `&s=<session>` 付き）。出すのは `latestObservation`（直近 3 日の HOSHILU の記録）がある商品だけ。API 側はこの表示で記録を足す前に判定。古い記録の商品に出ないことをテストで固定。
  2. 計測: `line_watch_clicked` の `content` に `product`／`drops`（値下がりカードのリンクに `&from=drops` を追加。文言・見た目は変更なし）。session_id は growth-events と同じ形の時だけ入れ、それ以外は空（匿名 1 クリック 1 行）。
  3. LINE の手前のページ: `/line/watch` は 302 ではなく小さなページ（noindex・no-store）を返し、「LINE が開いたら『送信』を押すと見張りが始まります（友だち追加がまだなら追加も）」を表示＝`line_watch_clicked`。1 秒後に JS（public/line-watch.mjs）で、またはボタンで `/line/watch/open` → **`line_watch_line_opened`** を数えて LINE を「見張る：番号」入力済みで開く。JS を動かさない機械は `line_watch_line_opened` に入らない。クローラー UA はどちらも数えない。
  - 通知の文面・送る条件・月 150 通の上限・「買い時」「底値」の不使用は変更なし（コード差分なし）。
- **KPI 画面の注記**: `docs/handoff/2026-11-20-cowork-pdca-cycle-1.md` の「`line_watch_clicked` 74 件が 1 セッションに集中」を訂正（session_id 未記録による見え方で、別々のクリック）。コミット abab957。
- **本番確認**: deploy・health は apply-patch.yml の結果（20:25 JST）で確認。商品ページのボタン表示・小さなページ・LINE への遷移の**実画面は未確認**（このタスクから hoshilu.app への curl/Playwright は遮断）。D1 で 20:25 JST 以降の `line_watch_*` は 0 件（20:30 時点、まだ押されていない）。→ Codex の本番確認で、記録のある商品ページ 1 件のグラフ下ボタン → 小さなページ → LINE 遷移と、D1 に `content='product'` の `line_watch_clicked`／`line_watch_line_opened` が入ることを見てほしい。
- **成果（D1 実測）**: 購入先クリック数・Seller 問い合わせ数・有料契約数への効果は**未計測**（公開 5 分。判定は 11/30 Cowork、商品ページ経由クリック数と `line_watch_started`）。全期間の `line_watch_started` は 1（大隆さんのテスト）のまま。
- 状態: DONE


## Codex 確認 — 2026-11-23 日次点検

11/22 20:14受領→20:30 DONEを確認。apply45017095031/job137191629334の3279/3279・本番配備20:25:10.449 Versioned7bba23・20:25:12.820 health PASSを独立再読。公開 /line-watch.mjs の1秒後遷移コードもGETで確認。実装/配備の証拠は確認済み、商品画面/実LINE遷移・イベント実発生は未確認。/line/watchは書込があるためSELECTのみの本点検では押していない。DONEは実装担当の範囲として維持し、画面未確認を完了へ広げない。

session_id未記録の訂正を反映。93クリックから「92人が停止」とは推定しない。匿名クリックと人数、JS遷移と人間を同一視しない。入口product/drops・line_watch_line_openedの一般/内部除外済み集計は既存成果物に未接続で未計測。日報・PDCAで既存改善担当へ観測を渡し、重複依頼/再実装は開始しない。11/30の判定を先取りせず、通知/友だち追加/送信/再送・D1書込は行っていない。
