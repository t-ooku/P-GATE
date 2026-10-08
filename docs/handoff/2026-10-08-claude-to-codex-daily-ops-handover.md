# Claude → Codex（2026-10-08）日次作業 5 本の引き継ぎ

大隆さんの決定（2026-10-08）: **監査も日次の作業も Codex が担当する。Cowork（Claude）の定期実行は全部止めた。**
定期点検は `2026-10-08-claude-to-codex-inspection-handover.md` で引き継ぎ済み。この文書はそこに入っていない**日次の作業 5 本**の引き継ぎ。

- **Codex がすでにやっている作業と重なる部分は、二重にやらなくてよい。** 既存の自動処理（下の「既にあるもの」）は作り直さない。
- 5 本とも、Cowork 側の最終実行は 2026-10-07〜08。**次の実行（2026-10-08 夜〜10-09 朝）から Codex の担当。**

| # | 作業 | Cowork の時刻（JST） | リポジトリ | 最終実行 |
|---|---|---|---|---|
| A | HOSHILU 教師データ 50 件／日 | 06:00 | P-GATE | batch-046（2026-10-07） |
| B | HOSHILU 検索精度の日次改善（規則+5・サジェスト+3・カナリア） | 08:00 | P-GATE | 2026-10-07（規則 170 件） |
| C | HOSHILU 日次販促（SNS 投稿キュー） | 06:30 | P-GATE／D1 | 2026-10-08 分 |
| D | 黒谷真衣 コラム 1 本ドラフト | 07:00 | kurotani-hp-ops | 2026-10-08 分 |
| E | 黒谷真衣 ブログ新着 → 販促素材 | 21:00 | kurotani-hp-ops | 2026-10-07 分 |

D・E の詳細は kurotani-hp-ops の `queue/2026-10-08_daily-ops-handover.md` に書いた。この文書は A〜C。

## 既にあるもの（作り直さない）
- Actions `compile-teacher-dataset-rules.yml`: 規則の追加 push を受けて `evaluation/teacher-dataset/2026-09-05-claude-batch-019.json` と `src/search-quality/teacher-dataset-rules.generated.json` を自動で作り直す（コミット名「chore(teacher): auto-generate batch-019 ...」）。**B ではこの 2 ファイルをコミットに含めなくてよい。**
- 検索品質カナリアは Worker が毎朝 07:22 JST に実行する（`search_qa_result`）。結果の意味判定は点検の引き継ぎ §2-1 に入れた。**B ではカナリアを読んで直すだけでよく、判定レポートを別に書かない。**
- SNS の自動枠（Worker の cron・AI女優・auto-runway-reel）と在庫の SLA 監視（`production-monitor.yml`）。C はそれと時間枠を重ねない。
- 1 回だけ Codex が書いた教師データ `2026-09-20-codex-batch-033.json` がある。形式はそれと同じでよい。

## A. 教師データ 50 件／日（毎日 06:00 JST ごろ）
- 場所: `tools/line-worker/evaluation/teacher-dataset/`。次は **`<YYYY-MM-DD>-codex-batch-047.json`**（番号は通し。名前の claude/codex は書いた側）。形式は同じフォルダの `README.md`・`format-example-batch.json`・直近の batch-046 に合わせる。
- 50 件。主婦層（25〜40 代）の日常買いのジャンルに分散させ、直近 10 バッチと同じクエリ・同じ言い回しを作らない。
- 生成後にルールを再コンパイル（`node scripts/compile-teacher-dataset-rules.mjs`）して `npm test` 全部 pass を確認してから push（コミット名の例「data(teacher): add daily batch 047 (50 entries) and recompile rules」）。
- **絶対ルール:** 合成データのみ（実利用者の検索文は保存されていないし、使わない）。D1 に入れるワークフローは実行しない。医薬品・効能は断定しない。
- 現時点の手順書の原本は Claude の Projects（`claude/hoshilu_teacher_dataset_daily_ops_guide.md`）にあり Codex からは読めない。上の内容と既存バッチの形式を正とする。迷ったら `docs/handoff/` に質問を書く。

## B. 検索精度の日次改善（毎日 08:00 JST ごろ）
2026-09-08 の `2026-09-08-claude-to-codex-daily-tasks-handover.md` §1-A と同じ内容（その後 Cowork が 09-11 から暫定で再開していた）。要点:
1. 前日〜今日のカナリア（`event_type='search_qa_result'`）を読み、FAIL があれば `src/search-qa-canary.mjs` の該当固定クエリについて `query-expansion*.mjs`・`knowledge-search.mjs`（`rankMerchantCandidates`・`filterCategoryMismatches`・`applyTeacherDatasetExclusions`）・`index.mjs`（`buildMarketplaceApiKeywordCandidates`・`refineMarketplaceSearchQuery`）・`search-head-noun.mjs` を調べ、**個別対応ではなく一般的なコード修正**で直す。再現テストを足す。
2. 「利用者の機能語 ≠ 売り手の語」型の展開規則を **5 件**、`src/query-expansion-feature-rules.mjs` に追加（現在 170 件）。主婦層の日常買いのジャンル。`match` は特徴語とカテゴリ語の**両方**を要求する先読み正規表現にし、一般語だけ（例「水筒」）には当たらないこと。既存規則・teacher.queries と重複マッチしないことを確認。
3. 入力サジェスト `public/search-suggest-data.mjs` の `CATEGORY_SUGGESTIONS` に **3 件**（主要メーカー 5 社以上・絞り込み語 5 個以上・重複なし。既存の広い規則に先取りされる場合は配列の前に置く）。
4. カナリアの固定クエリは **前回追加から 2 日以上空いたときだけ 1 件**追加してよい（前回 2026-10-06 の `dark_ink_name_pen`、現在 25 件。`test/search-qa-canary.test.mjs` の件数も更新）。
5. `npm test`（約 2990 件）全部 pass と `npx wrangler deploy --dry-run` を通して 1 コミット（件名の例「search(daily): 展開規則+5・サジェスト+3（YYYY-MM-DD）」）。`public/app.js` を変えたら `public/assets-v147/app.js` にもコピー。
6. 反映後、今日の規則のカテゴリの教師データを D1 `teacher_queries` に `INSERT OR IGNORE`（`entry_id='tq_'+sha256(nfkc(query_text).lower()|category.lower()|locale)` の先頭 16 桁、`source='manual_verified'`、`status='ACTIVE'`、`batch_id='2026-09-05-claude-batch-019'`）。**D1 への書き込みは INSERT OR IGNORE のこの 1 種類だけ。**
- 禁止: 実利用者の入力を推測して規則に書く／テストの削除・緩和／D1 既存行の UPDATE・DELETE／Secrets の出力／検索精度に無関係な UI 変更。

## C. HOSHILU 日次販促（毎日 06:30 JST ごろ）
`social_post_queue` に当日分を `status='APPROVED'` で入れる（Worker の cron が時刻に自動投稿する）。2026-09-08 の `2026-09-08-claude-to-codex-sns-operations.md` §1 で一度移管予定になっていたもの。
- **枠（既存の自動枠と重ねない）:** 主婦層 3 本 = Threads 07:45／X 12:05／Threads 18:45 JST。平日はさらに Seller 向け 2 本 = X・Threads 12:35 JST。
- **ID:** 主婦層 `campaign_id='hoshilu-deal-daily-v1'`、`post_id='hoshilu-deal-daily-v1-<JST日付>-<threads-am|x-noon|threads-pm>'`。Seller `campaign_id='hoshilu-seller-daily-v1'`、`post_id='hoshilu-seller-daily-v1-<JST日付>-<x|threads>'`。**同じ post_id があれば入れない。**
- **主婦層の中身:** 3 本とも「欲しい瞬間」型（名前が分からない／スクショ／SNS で見た 2 本＋この価格なら欲しい 1 本）→ HOSHILU に話す → 「ホシっとく」。締めは「探さなくていい。ホシっといて。」に近い一文。火・金は Threads 18:45 をクリエイター募集に差し替え（Instagram 1 投稿 1,500 円、X・TikTok 1,000 円（税抜）、フォロワー下限なし。affiliate=0）。直近 10 日と同じ商品例・文面は使わない。
- **リンク:** `https://hoshilu.app/?utm_source=<threads|x>&utm_medium=social&utm_campaign=hoshilu-deal-daily-v1&utm_content=<content_id>&q=<検索語>`。Seller は `/for-sellers?...utm_campaign=hoshilu-seller-daily-v1...`。
- **文字数（失敗の前例あり）:** caption に URL を書かない（Worker が link を末尾に付ける）。Threads は caption＋link ≦ 480、X は本文が全角 120（280 カウント）以内。INSERT 前に必ず数える。主婦層は末尾に「※リンク先にはアフィリエイト広告を含む場合があります。」と affiliate=1。絵文字なし。ハッシュタグは 2 つまで（#ホシっといて 必須）。
- **Seller の料金（2026-09-27 指示書が最上位）:** 旧料金（9,800 円・4,980 円・送客料・3 か月 0 円・カード不要・自動課金なし 等）は書かない（Worker の seller-marketing-guard が止める）。料金に触れるなら「新規Sellerは商品公開から30日間無料。（体験開始は準備中）開始前にカード登録必須。期限までに解約しなければ31日目から月額1,980円（税込）で毎月自動更新。」を、申込み開始が確認されるまで「準備中」付きのまま書く。条件を削って縮めない。曜日テーマ: 月=集客／火=需要／水=再訪／木=クーポン／金=Shop。CTA は「自店の掲載見本を相談する」。
- **書かない:** 「必ず見つかる」「100%」などの保証、期限の約束、未実装の機能、ユーザー数の誇張、承認済みセール（`marketplace_sale_events` の APPROVED）に無い割引率。
- **セラー営業メールは 2026-09-27 から新規投入しない**（`seller_outreach_contacts` に書かない）。
- 禁止: `social_post_queue` 既存行の UPDATE・DELETE（無限リトライ Issue #252 の行も直さず報告だけ）、上記 2 キャンペーン以外への書き込み、Instagram／TikTok への投稿（画像素材なし）。
- 前日の自分の投稿が FAILED なら `last_error` を記録する（再投稿はしない）。

## 報告
- 3 本（A〜C）とも、結果は毎朝の `docs/handoff/<日付>-codex-selfcheck.md` に 1 行ずつ足す（「教師データ batch-047 50 件／規則+5 サジェスト+3／販促 5 本投入」など）。別のレポートは作らない。
- 失敗したときだけ 3 行以内で理由を書き、最後に「大隆さんがやること」（無ければ「ない」）。

## 最初にやること
1. 2026-10-09 朝の分から A〜C を Codex の定期実行に入れる（E は 2026-10-08 21:00 の分から）。
2. 各 `AGENTS.md` の定期作業の一覧に A〜C を 1 行ずつ足す。
3. 完了したら `docs/handoff/<日付>-codex-daily-ops-setup-done.md` に、何を・何時に・どこへ出すかを書く。
