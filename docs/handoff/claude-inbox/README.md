# Claude 受信箱（Codex → Claude の指示と、Claude の受領・結果）

2026-10-10 大隆さん決定「朝ブリーフで決めた作業は Codex が指示・進捗確認・本番確認まで管理。大隆さんに指示書の転送や結果の中継を求めない」に合わせた連携。

## 接続の実態（何ができて、何ができないか）
- **できる**: Claude の定期タスク「HOSHILU Claude受信箱（Codex指示の受領・実行・報告）」が **毎日 09:13・14:13・20:13 JST** にこのフォルダを読み、OPEN の指示を受領・実行し、結果を同じファイルに書き戻す（GitHub への書き込み、[PATCH] Issue による本番反映、D1 の読み取りが可能）。
- **できない**: Codex から Claude を**即時に**起動すること。指示は次の巡回時刻に拾われる（最大約13時間の遅れ。夜20:13の後に置いた指示は翌朝09:13）。急ぎは時刻を待つしかない。
- Codex は Claude の受領・結果を、このフォルダのファイル（front matter の status と「## Claude 記録」）で確認できる。

## 指示の置き方（Codex）
1. `docs/handoff/claude-inbox/YYYY-MM-DD-<短い英字>.md` を作る。1ファイル1件。
2. 先頭に front matter:
   ```
   ---
   status: OPEN
   owner: Claude
   from: Codex
   created: 2026-10-10T09:00+09:00
   due: 2026-10-12（任意）
   kpi: purchase_clicks | seller_inquiries | paid_contracts（どれに効くか）
   ---
   ```
3. 本文に「やること」「完了の条件（何をもって完了か）」「やってはいけないこと」「参照する指示書」。承認が要る操作（料金・規約・課金・不可逆・既存行の UPDATE/DELETE・LP の文言/料金/注意書き・新規メール・SNS 方針）は、大隆さんの承認済みと明記がない限り Claude は実行しない。

## Claude の書き戻し
- 同じファイルの末尾「## Claude 記録」に追記し、status を `ACKED` → `IN_PROGRESS` → `DONE` / `BLOCKED` に更新する。
- 完了は必ず区別して書く: **実装**（コミット・Issue 番号）／**素材完成**／**キュー反映**（post_id・status）／**本番確認**（何で・何時に確認したか）。保存しただけ・Issue を出しただけを完了と書かない。確認できないことは「未確認（理由）」。
- 成果は 購入先クリック数・Seller 問い合わせ数（seller_business_inquiries）・有料契約数 で書く。

## Codex への依頼
- Codex の朝の自己点検で、このフォルダの status を読み、ACKED のまま 1 巡回以上動かないもの・BLOCKED を朝ブリーフに出す。
- Claude の結果の本番確認（Codex が担当と決めたもの）は Codex が行い、同じファイルの「## Codex 確認」に書く。
