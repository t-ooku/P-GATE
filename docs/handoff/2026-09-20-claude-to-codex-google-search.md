# 2026-09-20 Claude(Cowork) → Codex 指示書: Google 枠（Agent Search）の検索品質と、9/20 積み残しの引き継ぎ

承認者: 大隆さん（2026-09-20 「コーデックスに指示書書いて」）。本書をもって Google 枠の検索品質と本書「3. 積み残し」を Codex 主幹へ移す。Cowork は本日のパッチ投入（#354〜#370）で停止する。

## 0. 使っている検索システム
- Google Cloud **Vertex AI Search**（Discovery Engine API `discoveryengine.googleapis.com` の `servingConfigs/default_search:search`）。ウェブサイト用データストア（11 モールのホスト限定）、エンジン `hoshilu-malls_*`、サービスアカウントで認証。コード上の呼び名は「Agent Search」（`src/google-mall-search.mjs`）。
- 旧 Custom Search JSON API は使っていない（新規受付終了、2027-01-01 廃止）。

## 1. 事象（実機・D1 で確認済み）
- 大隆さん実機（15:21 JST）: 「韓国 頭皮ケア LILIB リリーブ」で HOSHILU 内の Google 枠（「Google検索から発見」）が出ない。通常の Google は「リリーイブ（lilyeve）」に読み替えて Amazon / 楽天の商品を出す。正解はこれ。
- D1 `google_mall_search_log`（1 時間バケット集計・検索本文は記録しない）:
  - `05:00Z cache:RAW_0=4, cache:SHOWN=1` → 綴り補正を付ける前の 0 件結果が 24h キャッシュされていた（#368 で解消）。
  - `06:00Z live:RAW_0=1` → #368 反映後、**Agent Search 自体が 0 件**（`spellCorrectionSpec:AUTO` / `queryExpansionSpec:AUTO` 付き）。
- Cowork 環境からは hoshilu.app / Google API に到達できない。観測は D1 集計のみ。

## 2. Cowork が入れた変更（把握しておくこと）
| Issue | commit | 内容 |
|---|---|---|
| #368 | 77acb1b | 0 件結果のキャッシュ 24h→10 分（`EMPTY_CACHE_TTL_SECONDS=600`）、鍵 v3、綴り補正 AUTO・検索語拡張 AUTO |
| #370 | （apply-patch 経由） | 0 件のときだけ 1 回、カタカナだけ・英数字だけの語（ブランド名らしい語）を外して探し直す `broadenGoogleMallQuery`。「韓国 頭皮ケア LILIB リリーブ lilib」→「韓国 頭皮ケア」。要求は最大 +1、集計 reason `BROADENED` / `BROADENED_0` |
- 送っている検索語は `buildAmazonSearchKeywords(query)`（index.mjs `decoratePwaResult`）。「韓国 頭皮ケア LILIB リリーブ」→「韓国 頭皮ケア LILIB リリーブ lilib」。
- 除外: HOSHILU 自身の結果があるモールは Google 枠から外す（`excludeMarketplaces`）。ホストは 11 モールのみ、商品ページ URL のみ（`NON_PRODUCT_PATH`）。

## 3. Codex への依頼（優先順）
### P0-1 Agent Search の生応答を確認する
1. 本番の資格情報で `default_search:search` に直接投げる: 「韓国 頭皮ケア リリーブ」「韓国 頭皮ケア」「リリーイブ 頭皮」「lilyeve」。
2. 各応答の `results` 件数、`correctedQuery` の有無、`totalSize` を記録（検索本文は D1 に残さない。docs/handoff の報告書に集計として書く）。
3. 「韓国 頭皮ケア」ですら 0 件なら、データストアの索引範囲（amazon.co.jp / rakuten.co.jp のクロール範囲）の問題。ブランド名だけ 0 件なら綴り揺れの問題。切り分けを報告。

### P0-2 綴り揺れ（リリーブ→リリーイブ）をどう当てるか判断する
選択肢を比較して 1 つ推奨し、大隆さんの承認を取ってから実装:
- (a) Vertex AI Search の高度なウェブサイトインデックス（ドメイン検証が要る。費用・作業は大隆さん承認事項）
- (b) Vertex AI Search のサービング制御「同義語（synonyms）」に「リリーブ ↔ リリーイブ ↔ lilyeve」のようなブランド綴り揺れを登録する（追加費用なし。当たる範囲は登録分だけ）
- (c) 教師データ（evaluation/teacher-dataset）にブランド綴り揺れの `search_terms` を足す（費用ゼロ、当たる範囲は登録分だけ）
- ✗ 旧 Custom Search JSON API（Programmable Search Engine）は新規受付終了・2027-01-01 に廃止。併用の選択肢に入れない。
前提: 日次上限 300 要求（`GOOGLE_MALL_SEARCH_DAILY_LIMIT`）、検索 1 回あたり要求は最大 2、価格は pagemap の「ページ表示価格」扱い（API 確認価格ではない・「確認価格」とは表示しない）。

### P1 9/20 GPT 指示書の積み残し（Cowork 未着手）
- 外部 URL Watch を別枠 5 件で数える（今は保存 100 / 探し中 10 / 価格 Watch 10 のみ。`member-wish-v2.mjs` `WISH_LIMIT_DEFAULTS`）。
- 「あとで見る」の archive 状態（今は `notify_new_match=0 & insight_enabled_at NULL` を「あとで見る」と表示しているだけ）。
- Google 枠の商品 → 「探し中」へ 1 タップ。
- 既存の値下がり待ち 5 行は `target_image_url` が無い（保存し直すまで画像なし）。推測で埋めない。

## 4. 守ること
- 検索本文・検索単位 ID を D1 に記録しない（916e379 の privacy boundary）。
- 価格変更・不可逆操作・既存行 UPDATE/DELETE・課金の発生は大隆さん承認（9/19 §54）。
- 商品・URL・価格を AI が生成しない。KPI を作らない。
- 報告は 9/18 形式（原因／修正／commit・PR／CI／本番反映／本番確認／KPI 変化／残件／大隆さんの作業）。

## 5. 大隆さんの作業（Codex から依頼が来たら）
- (a)(b) を選ぶ場合の費用承認。
- 実機確認: 「韓国 頭皮ケア リリーブ」→ Google 枠が出るか、lilyeve が出るか。

## 6. 追記（2026-09-20 16:04 JST 実機確認 / Codex 6.0 へ）— #370 は効いた。次は「並び」

### 確認できたこと
- 大隆さん実機 16:04、「韓国 頭皮ケア LILIB リリーブ」で **Google 枠が出た**（SHOPLIST Derma:fume / Qoo10 GROWUS ほか）。
- D1 `google_mall_search_log` `2026-09-20T07:00Z`: `live:BROADENED=1`, `live:SHOWN=1`。
  → 1 回目「韓国 頭皮ケア LILIB リリーブ lilib」= 0 件 → ブランド語を外して「韓国 頭皮ケア」で再検索 → 表示、という設計どおりの動作。
- **P0-1（Agent Search が 0 件を返す理由）は、これで実質切り分け済み**: データストアの索引範囲の問題ではなく、綴り違いのブランド語がクエリに入ると AND 条件で落ちる、が原因。「韓国 頭皮ケア」なら普通に返る。

### 残っている問題（ここが Codex 6.0 の本題）
- 大隆さん談「最初に違う商品が出たけど一応 5 番目くらいに出たわ」。つまり**本命（リリーイブ / lilyeve）が上位に来ない**。
- 原因ははっきりしている: `broadenGoogleMallQuery` はブランド語を**捨てている**ので、再検索の結果にブランドの手がかりが一切残らない。並びは「韓国 頭皮ケア」一般の順位そのまま。

### 推奨する次の一手（コードだけで閉じる・承認不要・費用ゼロ）
**捨てたブランド語を、並べ替えの材料として使う。**
1. `broadenGoogleMallQuery` が外したトークン（例: `LILIB` / `リリーブ` / `lilib`）を戻り値に含める（`{ query, droppedTokens }`）。
2. 再検索で返った `items` を、`title` + `link` に対する droppedTokens の**あいまい一致**でスコアリングして安定ソートする:
   - カタカナ → ローマ字（リリーブ→ririibu / ririb）、ローマ字 → カタカナの両方向を試す
   - 編集距離 1〜2 を許す（リリーブ ↔ リリーイブ = 1 挿入、LILIB ↔ lilyeve = 近い）
   - URL のスラッグにも当てる（`/lilyeve-...`）
3. スコア 0 の商品は現在の順序を保つ（同点安定ソート）。**商品そのものを作らない・URL を作らない・価格に触らない**（§7）。
4. 集計 reason に `BROADENED_RERANKED` を足して、並べ替えが効いた回数を測れるようにする。

これが当たれば「リリーブ」で lilyeve が 1 番目に来る。当たらなくても現状（5 番目）より悪くはならない。

### やらなくていいこと
- 旧 Custom Search JSON API の併用（新規受付終了・2027-01-01 廃止）。
- データストアの作り直し。索引範囲は問題ではないと切り分け済み。
- 高度なウェブサイトインデックスへの移行は、上記の並べ替えを入れても駄目だった場合の最後の手段（費用は大隆さん承認）。

### 監視の見かた（privacy boundary は維持）
`google_mall_search_log` の reason だけで状況が読める。`SHOWN`=出た / `BROADENED`=ブランド語を外して出た / `BROADENED_0`=外しても 0 件 / `RAW_0`=1 回目 0 件 / `ALL_EXCLUDED`=HOSHILU 側に同じモールがあって全部除外 / `NO_PRODUCT_PAGES`=商品ページ URL が無い。検索本文・検索単位 ID は記録しない（916e379）。
