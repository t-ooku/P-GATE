# Cowork → Codex（2026-09-15 23:55 JST）

Codex の 9/13〜9/15 の自己点検とコミットを確認した。9/11 以降 Cowork が暫定主幹として行った作業は
`docs/handoff/2026-09-11-cowork-interim-lead-log.md` にすべて記録してある（§4 に Codex へ渡す表）。
主幹の戻し方は大隆さんの判断待ち（D1〜D3 を提示中）。決まるまで Cowork のコード変更は
営業メール・SNS 文面・ドキュメントに限定し、Codex と同じファイルには触れない。

## 今日の最重要
- 大隆さんの新指示書「探さなくていい。ホシっといて。」（2026-09-15）: `docs/handoff/2026-09-15-master-directive-hoshittoku.md`（原文）
- 現状との対応表と着手順の提案: Projects `claude/hoshilu_hoshittoku_status_map_2026-09-15.md`（要点: 預かり件数 24・3人（内部）、INSIGHT 新規一致 0 回、トップコピー／ホシっとく CTA／0 件→ホシっとく導線は未実装）

## Cowork が 9/11〜9/15 に本番へ入れたもの（重複作業を避けるため）
- #263 SNS 着地の自動検索をトークン到着後に実行／#267 `search_inbound_pending`＋autorun/manual／#269 `_hidden`
- #268 既知クローラ UA を `traffic_class='QA'`（/api/events）
- #264 ショップ PROFILE 事業者名・店舗住所／値下がり待ち人数は 5 人以上のみ
- #275 セラー営業メールの定型文ゲート（`OUTREACH_REQUIRED_SENTENCES`、template_mismatch → SKIPPED）
- #276 ショップページ: クローラの閲覧を `shop_viewed` に入れない／絞り込み URL を noindex,nofollow／robots `Disallow: /shop/*?`（洪水は 9/14 13:52 JST に停止）
- `ops/runway/auto/themes.json` の参照画像を v1 に統一（`22c6fef`）

## Codex にお願いしたい確認
1. `cae08cb chore(ops): audit seller shop event flood` と `00f586c fix: restore promotion dashboard after crawler event flood` は #276 と整合しているか（クローラ UA 判定は `isCrawlerUserAgent` を共用してほしい）
2. `d15a589 fix(social-publisher): retry ... is_transient:true (#278)` により、publish 段階 5xx の「再試行しない設計」（暫定ログ 9/12 の記述）は変わった。二重投稿防止の担保を自己点検に書いてほしい
3. 大隆さん判断待ちの 3 件（誤字メール 5 社への再送／v2 毎日リール 26 件の取り消し／shop_viewed 300 万行の削除）は Cowork が保留中。Codex 側で勝手に触らないでほしい
