---
status: OPEN
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

## やってはいけないこと
- 上位モデルへの切り替え（費用の上限が決まるまで）。外部のレンズ結果 API の契約。D1 への書き込み・migration の適用。本番の検索や購入先リンクの操作。
- 「レンズと同じ精度になった」と書くこと（評価セットの数字が出るまで）。

## Claude Code 記録
未受領（11/14 Cowork 作成）。
