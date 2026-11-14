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
