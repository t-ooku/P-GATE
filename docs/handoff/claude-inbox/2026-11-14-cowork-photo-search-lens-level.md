---
status: IN_PROGRESS
owner: Claude
assignee: Claude Code（実装・調査支援）
from: Cowork（統括）
created: 2026-11-14 JST
kpi: purchase_clicks
---

# Cowork → Claude Code｜写真検索を Google レンズの水準に近づける（第 1 段：無料の範囲の 3 つ）

大隆さんの指示（11/14）：「Google レンズと同じレベルの精度にして」。進め方は「無料の範囲で 3 つ直す＋上位の AI モデルも使う」を選択。
上位モデルは**費用の上限を大隆さんが決めてから**。この依頼は、その前にやる 3 つです。未完の T0（`2026-11-07-claude-to-codex-revenue-korea-loop.md`、Codex 11/8「一部実装」）の続きにあたります。Codex と同じファイルを同時に直さないこと（Codex は C-1・C-8 の作業中。`search-input-analysis.mjs` を触る前に、Codex 記録に進行中の変更が無いか確かめる）。

## いまの状態（Cowork が 11/14 に確認）
- 流れ：Cloud Vision（WEB_DETECTION＋OCR、2.5 秒だけ先行）→ Gemini（`gemini-3.6-flash`、14 秒＋再試行 9 秒、予備 `gemini-3.1-flash-lite`）→ 失敗時は Vision の救済（JAN → Web 一致 → OCR → best guess）。
- 11/7 の実機：トラックボールの写真で検索語が「mouse Computer」になった（best guess の救済に落ちたと推定。原因は未確定）。
- **記録が無い**：D1 にあるのは `identify_latency_log`（時間だけ）。どの経路（provider）で答えたか・失敗の理由は残っていない。7 日の救済率は今も出せない。
- 利用量：写真・カメラの検索は 10/15〜11/14 で約 15 回（QA 除く）。Vision は 11 月 10 回（上限 900）。
- 見つけた候補の商品写真と、撮った写真を見比べる処理は無い（名前で検索して終わり）。

## やること（上から順に。1 つずつ [PATCH]）
1. **どこで失敗したかを記録する。**
   - `identify_latency_log` に列を足す（新しい migration）：`provider`（例 `GEMINI_MULTIMODAL`・`GOOGLE_VISION_BEST_GUESS_FALLBACK`）、`diagnostic`（既存の診断コード。固定の短い英数字だけ）、`input_kind`（camera／screenshot／url）。
   - 写真・検索語・商品名・会員 ID・セッション ID は入れない。14 日で消す（既存と同じ）。
   - D1 の migration の適用は承認が要る操作。SQL を用意して、Cowork に適用を頼むこと。
2. **弱い言葉で検索しない。**
   - 救済の結果が、英語の汎用語だけ（mouse・computer・product・cartoon など）・ブランドも具体的なカテゴリも無い時は、そのまま検索語にしない。
   - その時は、Vision の `matching_page_titles`・`web_entities`・OCR から日本のモールで当たる語（ブランド＋カテゴリ）を作る。作れなければ「これですか？」の確認カードで、候補を 2〜3 個出して選んでもらう（「認識できませんでした」で終わらせない。行き止まりを作らない）。
   - Gemini が失敗した理由（タイムアウト・空の応答・JSON でない応答）を 1. の記録で分けられるようにする。`GEMINI_IDENTIFY_GROUNDING=true` の時に JSON 以外が返っていないかを固定テストで確かめる。
3. **候補の商品写真と、撮った写真を見比べる（レンズとの一番の差）。**
   - 確認カードで YES のあと、モールから返った上位の候補（最大 6 件）の商品画像と、利用者の写真を、マルチモーダルのモデル 1 回で見比べる。
   - 返すのは候補ごとに `same`（同じ商品）／`similar`（似ている）／`different` だけ。`same` を上に、`different` は下げる（消さない）。モデルの推測で価格・商品名を作らない。
   - 時間の上限 4 秒。間に合わなければ今の並びのまま出す（待たせない）。画像は保存しない。
   - スイッチ `PHOTO_CANDIDATE_VERIFY_ENABLED`（既定 false）で入れて、Cowork が評価セットで確かめてから true にする。

## 評価のしかた
- 実物の写真の固定セット（まず 10 枚。大隆さんに撮ってもらう。トラックボールを含む）で、「本命が上位 3 件に入る割合」を前後で出す。同じ写真のレンズの 1 件目を正解の目安にする。
- 写真が届くまでは、固定のモック（Vision・Gemini の応答を固定したもの）で 2. と 3. のテストを書く。

## 追記（2026-11-14 夕方）第 2 段：上位モデル — 大隆さん承認済み（上限 月 3,000 円）

大隆さんが「上位モデルを使う。上限は月 3,000 円。上限に達したら自動で今のモデルに戻す」を承認（11/14、Cowork との会話で「そうしよう」）。第 1 段の 1.（記録）が入ってから着手すること。

- 対象：写真・スクショの解析（`search-input-analysis.mjs` の画像つきの呼び出し）と、第 1 段 3. の見比べ。文字だけの検索は今のモデルのまま。
- モデル：`gemini-4-argon`（公式ページの記載：入力 $2／出力 $10 per 1M トークン〜11/30、12/1 から $4／$20。無料枠では使えない）。モデル名は環境変数（例 `GEMINI_PHOTO_IDENTIFY_MODEL`）で持ち、既定は空＝今のモデル。
- **上限の仕組み（必須）**：
  - 月ごとの利用額を D1 で数える（Vision の `google_visual_web_detection_usage_monthly` と同じ「先に枠を取る」方式）。応答の `usageMetadata` のトークン数 × 単価で積算し、単価と為替は環境変数で持つ（既定は 12/1 以降の単価・1 ドル 160 円で保守的に）。
  - `GEMINI_PHOTO_MONTHLY_BUDGET_JPY`（既定 3000）に達したら、その月は今のモデル（`gemini-3.6-flash`）に自動で戻す。数えられない時（D1 失敗）も今のモデルを使う（上限を超えない側に倒す）。
  - 上位モデルが失敗・時間切れの時は、今のモデル → 予備 → Vision の救済、の順（行き止まりにしない）。
- 記録：第 1 段 1. の `provider` に、上位モデルで答えたかどうかが分かる値を入れる。
- 新しい契約・請求先の変更が要る場合（今の API キーで `gemini-4-argon` が使えない等）は、実行せずに Cowork へ書き戻す。
- 本番で有効にするのは、Cowork が評価セット（実物の写真 10 枚）で前後を比べてから。

## 追記（2026-11-15）直す前の実測と、優先して直す所
大隆さんの実機の結果を `docs/eval/photo-search-v1.md` に記録した（8 枚中 ◎3・○1・×4。「精度ひどいね」）。第 1 段 2. は、次の順で直すこと：
1. **日本語のパッケージは日本語で検索する。** OCR に日本語の商品名がある時（例「午後の紅茶 おいしい無糖」「たけのこの里」「きき湯」）は、それを検索語の中心にする。英語の一般語（convenience food・chocolate bar・Bath Bomb）や、Web 一致の英語のページ名を検索語にしない。
2. **数字と漢字の読み違いを減らす**（「5種の」→「今種の」）。OCR の結果と Gemini の読みが食い違う時は、画像を持つ Gemini の読みを優先し、数字 1 文字の漢字化を疑う。
3. **飾りの英文（マグカップの文）を商品名にしない。** 文が長い英文で、ブランド・カテゴリが無い時は、カテゴリ（マグカップ）＋読めた小さいロゴで探し、第 1 段 3. の見比べに回す。
4. **「それは何に使うものですか？ 今は特定できないため…」を、商品が 1 件以上出ている時に出さない。**
画面（カメラの入口・写真を残す結果シート）は Cowork が `public/photo-lens.mjs`・`photo-lens.css` で入れた。`app.js` の結果描画は変えていない。

## やってはいけないこと
- 上限の仕組みなしでの上位モデルへの切り替え。月 3,000 円を超える設定。外部のレンズ結果 API の契約。D1 への書き込み・migration の適用。本番の検索や購入先リンクの操作。
- 「レンズと同じ精度になった」と書くこと（評価セットの数字が出るまで）。

## Claude Code 記録
### 2026-11-14 20:25 JST（受信箱巡回 20:13 便）
- **受領**: 2026-11-14 20:13 JST 頃。状態 ACKED → IN_PROGRESS（1. 完了、2.・3. は次の巡回で 1 つずつ [PATCH]）。
- **担当範囲の理解**: 写真識別（/api/identify）の 1. 記録 → 2. 弱い語で検索しない＋行き止まりを作らない → 3. 候補画像との見比べ（スイッチ既定 false）。上位モデル・外部レンズ API・migration 適用・本番検索の操作はしない。Codex の C-1・C-8 は JAN 系で `search-input-analysis.mjs` に進行中の変更なし（Codex 記録・直近コミットで確認）。
- **1. 実装（コミット a15420e／Issue #770）**: `identify_latency_log` に `provider`・`diagnostic`・`input_kind` を残す。
  - 診断コードに Gemini の外れ方を追加: `G_TIMEOUT`／`G_HTTP_xxx`／`G_NETWORK`（呼び出し失敗）、`_RNOTEXT`（文字なし）／`_RNOJSON`（JSON でない）／`_RNOCAND`（JSON だが候補なし）。救済で答えた時も `OK__G_<理由>_V_<Vision状態>_E_T_J_B` が残る（例: 主モデルがタイムアウトして best guess で答えた＝`OK__G_TIMEOUT_...`、provider=`GOOGLE_VISION_BEST_GUESS_FALLBACK`）。失敗は provider=`FAILED`。
  - 固定語彙（大文字英数と _）以外は書かない。写真・検索語・商品名・会員 ID・セッション ID は入れない。14 日で消す（既存の purge のまま）。API 応答には出さない（固定テスト）。
  - `GEMINI_IDENTIFY_GROUNDING=true` で JSON 以外が返った時に `_RNOJSON` になる固定テストあり。
  - **本番確認**: #770 の ✅（apply-patch: git am・npm test・deploy・health すべて success、2026-11-14 11:22 UTC = 20:22 JST、head a15420e）。手元 `npm test` 3195 件 pass。実際の識別リクエストでの書き込みは**未確認**（hoshilu.app へは届かない／直近 14 日 identify_latency_log が 0 行で、実利用が来るまで行が出ない）。
- **Cowork へ依頼（承認が要る操作）**: migration `tools/line-worker/migrations/0097_identify_latency_provider.sql`（ALTER TABLE ADD COLUMN ×3、既定値 ''、既存行は変えない）を `apply-d1-migrations.yml` で適用してください。expected_pending は `0097_identify_latency_provider.sql` の 1 件（11/14 20:2x JST 時点、D1 の最終適用は 0096）。**未適用の間も Worker は従来の時間列だけで書く**ので壊れません（固定テストあり）。適用後の 7 日救済率の読み取り例: `SELECT provider, substr(diagnostic,1,instr(diagnostic||'_V','_V')-1) AS g, COUNT(*) FROM identify_latency_log WHERE created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') GROUP BY 1,2`。
- **気づき（2. の着手前に共有）**: D1 の `identify_latency_log` は直近 14 日 0 行。/api/identify（「これですか？」の写真経路）は最近使われていないか、写真検索が /api/knowledge 側を通っている可能性がある。もう一つ、`identifyCandidateFromAnalysis` は `candidate_name` が無いと空カードを返すため、Vision 救済（OCR・best guess は candidate_name を作らない）で答えた時は /api/identify では「認識できませんでした」相当の行き止まりになっている。2. ではここを「候補 2〜3 個の確認カード」に変える（画面側の変更を含む）。
- **入力の種類**: 画面が撮影か画像選択かを送っていないため、今は `url`／`image` の 2 種類。camera／screenshot の区別は画面からの送信が要る（2. の画面変更と一緒に入れる予定）。
- **次（未着手）**: 2.（弱い語の拒否＋ページ題・エンティティ・OCR からブランド＋カテゴリ＋確認カード 2〜3 候補）→ 3.（`PHOTO_CANDIDATE_VERIFY_ENABLED` 既定 false、4 秒上限）。いずれも #770 の後に 1 つずつ [PATCH]。
- **成果（D1 実測 20:2x JST、7 日、QA 除く）**: 購入先クリック（marketplace_click）30 件／18 セッション、Seller 問い合わせ 0 件（累計 4）、有料契約 未計測（取得経路未接続）。本変更は記録の追加のみで KPI への効果はまだ無い（効果は 2.・3. と評価セットの数字で見る）。「レンズと同じ精度」とは書かない。

## Cowork が先に入れた変更（2026-11-15 01:40 JST、#774・4430b6a 配備済み）— 重ねて作らないこと

- `search-input-analysis.mjs`：袋に大きく印字された日本語を優先（`japaneseProminentTextAnalysis`）。Gemini 不通時の救済と、Gemini が日本語なしで答えた時の差し替えの 2 か所。画像つきの `maxOutputTokens` は 1024。
- `google-visual-web-detection.mjs`：`prominentTextLines`（OCR 段落を文字の大きさ順に最大 4 行）→ evidence の `prominent_text`。
- `/api/knowledge` の写真・URL 解析を `identify_latency_log` に `route='knowledge'` で記録（provider / diagnostic / input_kind）。migration 0097 は本番 D1 に適用済み。
- `photo-lens.mjs?v=2`：検索の開始・やり直しの合図で閉じない（実機「写真撮ってから検索すると消える」の修正）。
- 残り（Claude Code）：候補写真の見た目照合、商品がある時の「それは何に使うものですか？」の抑止、段階 2（上位モデル・月 3,000 円上限）。Gemini が落ちる原因は、大隆さんの再実機のあと Cowork が診断を読んで追記する。

## Claude 記録
### 2026-11-15 09:2x JST（受信箱巡回 09:13 便）
- **受領**: 2026-11-15 09:13 JST 頃。状態 IN_PROGRESS のまま（追記 11/15 の 4. は完了、残りは下記）。
- **担当範囲の理解**: Cowork #774 の変更（日本語優先・OCR 大文字順・/api/knowledge の記録・photo-lens）とは重ねない。今回は残り 3 つのうち、画面だけで済む「商品が出ている時の『それは何に使うものですか？』の抑止」を先に入れた。`search-input-analysis.mjs` は触っていない。
- **実装（コミット 8e2e0f4／Issue #776）**: `public/app.js` の `renderResults`。これまでは**価格確認済みの商品がある時だけ**文言を消していたため、写真検索で価格未確認の Web 結果（たけのこの里・きき湯・ファミマル）だけが出た時に「それは何に使うものですか？ 今は特定できないため、ほしっとくへ…」が残っていた。確認済み・未確認・関連商品のどれかが 1 件でも表示される時は消す（4 言語）。商品 0 件の時は従来どおり残す（行き止まりにしない）。サーバーの判定・聞き返しカード・料金/注意書きは変えていない。`app.js?v=208`。
  - 固定テスト `test/photo-result-message.test.mjs`（app.js の判定行を取り出して実行: 未確認のみ／関連のみ／確認済み／英語／0 件／通常文）。手元 `npm test` 3201 件 pass。
- **本番確認**: #776 の ✅（apply-patch: git am・npm test・push・deploy・health すべて success、2026-11-15 00:20 UTC = 09:20 JST、head 8e2e0f4）。**実画面での表示は未確認**（hoshilu.app へはこの環境から届かない）。大隆さんの再実機（評価セットの 5・7・10）で文言が出ないことの確認を Cowork にお願いします。
- **気づき**: D1 `identify_latency_log` は 09:2x JST 時点で全期間 0 行（列は 0097 で追加済み）。#774 の配備（01:40 JST）後、写真検索の実利用がまだ無いか、書き込みが動いていないかのどちらか。次の実機のあとに行が出ない場合は書き込み側を調べる。
- **未着手（次の巡回で 1 つずつ [PATCH]）**: (a) 候補写真の見た目照合（`PHOTO_CANDIDATE_VERIFY_ENABLED` 既定 false・4 秒上限）、(b) 段階 2 上位モデル＋月 3,000 円上限（D1 の月次枠テーブルの migration が要る → 適用は Cowork に依頼する形）、(c) 第 1 段 2. の残り（飾りの英文・数字の読み違い）は Cowork の #774 と重ならない範囲を確認してから。
- **成果（D1 実測 09:2x JST、7 日、QA/INTERNAL 除く）**: 購入先クリック（marketplace_click）29 件／17 セッション、Seller 問い合わせ 0 件（累計 4）、有料契約 未計測（取得経路未接続）。今回の変更の効果は、写真検索の実利用と評価セットの再計測で見る（まだ数字なし）。「レンズと同じ精度」とは書かない。

### 2026-11-15 14:3x JST（受信箱巡回 14:13 便）
- **受領**: 2026-11-15 14:13 JST 頃。状態 IN_PROGRESS のまま。
- **この巡回で進んだところ**: 追記 11/15 の 4.（商品が出ている時の「それは何に使うものですか？」）を、09:2x の画面側（#776）に加えて**サーバー側でも返さない**ようにしました（別依頼 `2026-11-15-cowork-photo-result-ranking.md` の 4. と同じ件。コミット 3fb23ca／Issue #787 ✅、14:28 JST、head 1c10770）。あわせて同依頼の 1.（名前の語が当たらない候補を出さない）・3.（味・種類ちがいを下げる）も入っています。詳細はその依頼ファイルの Claude 記録に書きました（1. は Cowork の担当変更追記で Codex 担当になっており、残すか戻すかの判断をお願いしています）。
- **この依頼の残り（未着手）**: (a) 候補写真の見た目照合（`PHOTO_CANDIDATE_VERIFY_ENABLED` 既定 false・4 秒上限）、(b) 段階 2 上位モデル＋月 3,000 円上限（D1 の月次枠テーブルの migration が要る → 適用は Cowork に依頼する形）、(c) 第 1 段 2. の残り（飾りの英文・数字の読み違い）。この巡回では `search-input-analysis.mjs` を触っていません（Cowork #774・#782・#784 と重ねない）。
- **気づき（D1 実測 14:3x JST）**: `identify_latency_log` に `route='knowledge'` の画像系の行が**直近 24 時間で 15 行**出ていました（09:2x の 0 行から変化）。#774 の記録が動いていることと、12:28〜12:29 の実機が /api/knowledge 側を通っていることの裏付けになります。provider 別・診断別の内訳の読み取りは Codex の担当範囲（#782 の印別の件数・秒数）と重なるため、こちらでは数えていません。
- **成果（D1 実測 14:3x JST、7 日、QA 除く）**: 購入先クリック（marketplace_click）25 件／17 セッション、Seller 問い合わせ 0 件（累計 4）、有料契約 未計測（取得経路未接続）。この巡回の変更の効果はまだ数字になっていません（評価セットの「第 1 段のあと」は未計測。実写真の再実機が要る）。「レンズと同じ精度」とは書きません。

### 2026-11-15 20:2x JST（受信箱巡回 20:13 便）
- **受領**: 20:13 JST 頃。状態 IN_PROGRESS のまま（第 1 段 3. を実装・配備。残りは下記）。
- **担当範囲の理解**: 第 1 段 3.「候補の商品写真と撮った写真の見比べ」。`search-input-analysis.mjs`・grounding・Vision→Gemini の順序・モデルは触らない（Cowork #774/#782/#784、Codex #788 と重ねない）。新しいファイル `src/photo-candidate-verify.mjs` と、`/api/knowledge` の結果を返す直前の 1 行だけ。
- **実装（コミット 6c3dab3 → 本番 head 989c56f／Issue #797 ✅）**:
  - スイッチ `PHOTO_CANDIDATE_VERIFY_ENABLED`（**既定 false。今は動いていません**）。true かつ写真検索（`search_input_analysis.applied && sources.image`）の時だけ動く。
  - 上位最大 6 件の商品画像（楽天・Yahoo!・Amazon の配信元の https だけ。Web の任意ホストは取りに行かない）と撮った写真を、今のモデル（`GEMINI_PRODUCT_DISCOVERY_MODEL`、思考 LOW）1 回で見比べ、`same`／`similar`／`different` だけを受け取る。商品名・価格は作らせない。
  - 上位 6 件のまとまりの中で same → 判定なし/similar → different に並べ直す（消さない。7 件目以降・PR 枠は動かさない）。position と安い順（price_order）を付け直す。結果に `unified_results.photo_verify`（applied と same/similar/different の件数、失敗時は status）と各行 `photo_match` を付ける（画面は使っていない。QA 用）。
  - 上限 4 秒（画像取得＋モデル）。時間切れ・HTTP 失敗・JSON でない応答は今の並びのまま。画像は保存しない。
  - 「確認カードで YES のあと」と依頼にありますが、今の写真検索は確認カードを通らず /api/knowledge で直接結果を出すため、そこに入れました。
  - 固定テスト `test/photo-candidate-verify.test.mjs` 9 件（既定 false・ホスト制限・並べ替え・6 件上限・時間切れ・失敗・文字の検索では外へ出ない）。手元 `npm test` **3230 件 pass**。
- **本番確認**: #797 の ✅（apply-patch: extract・git am・npm test・push・deploy・health すべて success、2026-11-15 11:23 UTC = 20:23 JST、base 4059c46 → head 989c56f）。スイッチが false なので**利用者の挙動は変わっていません**。true での実機の動き・所要時間・費用は**未確認**。
- **Cowork へ（有効化の手順）**: 評価セットで比べる時は Worker の変数 `PHOTO_CANDIDATE_VERIFY_ENABLED=true` を入れてください。1 回の写真検索で今のモデルの呼び出しが 1 回増えます（画像 最大 7 枚）。応答の `unified_results.photo_verify` で判定の件数・失敗理由が見られます。所要時間が最大 4 秒のびるので、#783 の計測で前後を見てください。
- **この依頼の残り（未着手）**: (b) 段階 2 上位モデル＋月 3,000 円上限（月次枠テーブルの migration が要る → 適用は Cowork に依頼する形）、(c) 第 1 段 2. の残り（飾りの英文・数字の読み違い。`search-input-analysis.mjs` なので Cowork/Codex の変更と重ならないことを確かめてから）。次の巡回で (b) に着手予定。
- **成果（D1 実測 20:22 JST、7 日、QA 除く）**: 購入先クリック（marketplace_click）24 件／16 セッション、Seller 問い合わせ 0 件（累計 4）、有料契約 未計測（取得経路未接続）。今回はスイッチ既定 false のため KPI への効果はまだ無い。「レンズと同じ精度」とは書きません。

### 2026-11-16 09:2x JST（受信箱巡回 09:13 便）
- **受領**: 2026-11-16 09:13 JST 頃。状態 IN_PROGRESS のまま（第 2 段の解析側を実装・配備。残りは下記）。
- **担当範囲の理解**: 第 2 段「上位モデル＋月 3,000 円上限」（大隆さん承認済み）。第 1 段 1.（#770）は入っているので着手条件を満たす。`search-input-analysis.mjs` の直近の変更は 11/15 03:31 UTC の Cowork（be6f482）が最後で、Codex の 11/15〜16 の作業（C-1・C-3・QA 分離）はこのファイルに触れていないことを git log で確認。モデルの順序（Vision 先行・grounding・思考 LOW・日本語優先）は変えず、画像つきの呼び出しの**前に**上位モデルの 1 回を足しただけ。
- **実装（コミット ce6edd0 → 本番 head e2d28b8／Issue #808 ✅）**:
  - `GEMINI_PHOTO_IDENTIFY_MODEL`（**既定は空。今は上位モデルを使っていません**）。入れた時だけ、写真・スクショの解析で上位モデルを 1 回先に試す。文字だけの検索・URL Context 付きの呼び出しは対象外。
  - **上限の仕組み**: 新しいファイル `src/gemini-photo-budget.mjs`。呼ぶ前に D1 `gemini_photo_usage_monthly` で見込み額（入力 8,000＋出力 4,096 トークン ≒ 18.2 円、Google 検索を引く時は $0.05 上乗せ ≒ +8 円）を「先に枠を取る」方式で確保（Vision の月次枠と同じ ON CONFLICT … WHERE の 1 文）。応答の `usageMetadata`（prompt＋toolUsePrompt／candidates＋thoughts）× 単価で実額に精算。トークン数が読めない・失敗・時間切れの時は見込み額のまま残す（多めに数える側）。
  - 単価・為替は環境変数 `GEMINI_PHOTO_PRICE_INPUT_USD_PER_M`（既定 4）・`GEMINI_PHOTO_PRICE_OUTPUT_USD_PER_M`（既定 20）・`GEMINI_PHOTO_USD_JPY`（既定 160）・`GEMINI_PHOTO_GROUNDING_USD_PER_CALL`（既定 0.05）。既定は 12/1 以降の単価。
  - `GEMINI_PHOTO_MONTHLY_BUDGET_JPY`（既定 3000）。**3000 を超える値は 3000 に切る**（表の CHECK でも 3000 以下）。上限に達した月・D1 失敗・表が無い時は上位モデルを呼ばない。月は Google の請求月（America/Los_Angeles）。
  - 上位モデルが失敗・時間切れ・候補なしの時は 今のモデル → 予備 → Vision の救済（時間切れの後は今のモデルを 9 秒上限で呼び、待ち時間を重ねすぎない）。
  - **記録**: 上位モデルで答えた時は provider の末尾に `_PREMIUM`（例 `GEMINI_SEARCH_GROUNDED_PREMIUM`）。diagnostic の末尾に `_PUSED`／`_PLIMIT`／`_PGUARD`／`_PTIMEOUT`／`_PFAIL`／`_PEMPTY`（モデル名が空の時は付かない）。
  - 固定テスト `test/gemini-photo-budget.test.mjs` 9 件（既定で使わない・3000 円で切る・単価の計算・枠が尽きると取れない・D1 失敗で取れない・精算・上位→今→予備の順・文字の検索では D1 にも触れない・migration は CREATE TABLE のみ）。手元 `npm test` **3250 件 pass**。
- **本番確認**: #808 の ✅（apply-patch: extract・git am・npm test・push・deploy・health すべて success、2026-11-16 00:22 UTC = 09:22 JST、base 2c60a81 → head e2d28b8）。モデル名が空なので**利用者の挙動は変わっていません**。上位モデルでの実機の答え・所要時間・実際の費用は**未確認**（有効化前）。今の API キーで `gemini-4-argon` が使えるかも**未確認**（この環境から Gemini を呼んで課金を起こさないため確かめていない）。
- **Cowork へ依頼（承認が要る操作）**:
  1. migration `tools/line-worker/migrations/0098_gemini_photo_budget.sql`（CREATE TABLE のみ、既存行は変えない）を `apply-d1-migrations.yml` で適用してください。expected_pending は `0098_gemini_photo_budget.sql` の 1 件（09:2x JST 時点、D1 の最終適用は 0097）。**未適用の間は、モデル名を入れても上位モデルは使われません**（`_PGUARD`）。
  2. 評価セットで比べる時に Worker の変数 `GEMINI_PHOTO_IDENTIFY_MODEL=gemini-4-argon` を入れてください。HTTP 403/404 が続く（`_PFAIL` だけが並ぶ）なら、キーの契約・請求先の問題の可能性があるので、変数を空に戻してください（その対応は承認が要るので Claude はしません）。
  3. 月の利用額の読み取り: `SELECT usage_month, spent_micro_jpy/1000000.0 AS spent_jpy, request_count FROM gemini_photo_usage_monthly`。
- **この依頼の残り（未着手）**: (b') 第 1 段 3. の見比べ（`photo-candidate-verify.mjs`）にも上位モデルを使う件 — 4 秒の上限があり、上位モデルの所要時間が分かってから入れる方が安全なので、有効化と所要時間の実測のあとに同じ枠（`gemini_photo_usage_monthly`）を共有して入れる。(c) 第 1 段 2. の残り（飾りの英文・数字の読み違い）。
- **成果（D1 実測 09:2x JST、7 日、QA/INTERNAL 除く）**: 購入先クリック（marketplace_click）23 件／15 セッション、Seller 問い合わせ 0 件（累計 4）、有料契約 未計測（取得経路未接続）。今回は既定で無効のため KPI への効果はまだ無い。「レンズと同じ精度」とは書きません。

### 2026-11-16 14:2x JST（受信箱巡回 14:13 便）
- **受領**: 2026-11-16 14:13 JST 頃。状態 IN_PROGRESS のまま（(c) を実装・配備。残りは (b') だけ）。
- **担当範囲の理解**: 追記 11/15 の 2.（数字と漢字の読み違い）・3.（飾りの英文を商品名にしない）。`search-input-analysis.mjs` の直近の変更は 09:2x の自分の #808 が最後で、Cowork・Codex の 11/16 の記録（Codex 自己点検・C-1）にこのファイルの進行中の変更が無いことを確認。プロンプト（IMAGE_ANALYSIS_RULES）には Cowork の d354681/be6f482 で同じ趣旨の指示がすでに入っているため、今回はモデルが従わなかった時の**決まった後処理**だけを足した（モデル・順序・grounding・日本語優先は変えていない）。
- **実装（コミット b9e8d5c → 本番 head ad0232c／Issue #809 ✅）**:
  - **飾りの英文**: 日本語の無い検索語が、OCR の英文（a/to/and/me などを含む行、合計 5 語以上）の断片だけでできている（例「Tea amoment」）、または検索語そのものが英文（4 語以上・機能語あり）の時は、「読めた小さいロゴ＋日本語カテゴリ」に置き換える（例「GOOD MOOD マグカップ」）。カテゴリは Vision の best guess・エンティティ・Gemini の特徴から、マグカップ・タンブラー・トートバッグ・Tシャツ等の決まった表で引く。**カテゴリが分からない時は変えない**（行き止まりにしない）。数字入り（型番）・日本語入り・ロゴそのものは変えない。
  - **数字の読み違い**: 検索語の 1 文字（漢字・かな。漢数字は除く）が、OCR では数字で、前後の文字と助数詞（種・個・袋・g・ml など）が同じ時だけ OCR の数字に戻す（「ファミマル 今種のナッツ」→「ファミマル 5種のナッツ」）。逆向き（モデルが数字・OCR が漢字）はモデルの読みを優先して変えない。
  - Gemini の答えと Vision の救済（OCR 等）の両方に適用。記録: `identify_latency_log` の diagnostic の末尾に `_QS`（英文を置き換えた）／`_QD`（数字を戻した）。固定語彙のみ。
  - 固定テスト `test/photo-query-guard.test.mjs` 6 件（断片・英文・ブランド付き・変えない場合 7 種・Gemini 経路・救済経路・数字の戻し／戻さない）。手元 `npm test` **3256 件 pass**。
- **本番確認**: #809 の ✅（apply-patch: extract・git am・push・deploy・health すべて success、2026-11-16 05:22 UTC = 14:22 JST、base 064f8e0 → head ad0232c）。実際の写真での置き換えは**未確認**（hoshilu.app へは届かない／評価セット 1・10 の再実機が要る）。再実機のあと `identify_latency_log` の diagnostic に `_QS`／`_QD` が出るかで動いたかを確かめられます（Cowork へ）。
- **気づき**: D1 の最終適用 migration は 14:2x JST 時点でも **0097**。#808 の `0098_gemini_photo_budget.sql` は未適用のまま（上位モデルはモデル名を入れても `_PGUARD` で使われない状態）。09:2x の依頼 1. のとおり Cowork に適用をお願いします。
- **この依頼の残り（未着手）**: (b') 見比べ（`photo-candidate-verify.mjs`）にも上位モデルを使う件 — 0098 の適用と上位モデルの所要時間の実測（有効化）を待つ。それまでは着手しない。
- **成果（D1 実測 14:2x JST、7 日、QA 除く）**: 購入先クリック（marketplace_click）24 件／16 セッション、Seller 問い合わせ 0 件（累計 4）、有料契約 未計測（取得経路未接続）。今回の変更の効果はまだ数字になっていない（評価セットの「第 1 段のあと」が未計測）。「レンズと同じ精度」とは書きません。
