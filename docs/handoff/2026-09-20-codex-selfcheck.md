# 2026-09-20 Codex self-check

- 本番 /health: このセッションの直接取得はネットワーク経路に拒否され未検証。直近 production-monitor #907 の外形契約検査は PASS。
- 自動インシデント #261: 実検索は SEARCH_SLI_OK。GitHub scheduled workflow の長時間遅延による GITHUB_SCHEDULE_HEARTBEAT_STALE だけが検索SLIへ誤分類されていた。
- Claude引継ぎ: #261 と AUTO-REEL #312/#321 を調査。
- 対応: GitHub schedule staleだけを監視制御のadvisoryへ分離し、missing/stuck・検索失敗・Cloudflare heartbeat異常は従来どおりblockingとする。advisoryもreconcile成功後にACKする。
- AUTO-REEL: Cloud Vision FACE_DETECTIONは本人照合非対応で、9/18決定どおりfail-closed。#312/#321は同日workflow更新pushが同じjobを二度QAした重複実行であり、main側workflowのpush起動を停止する。

## Google検索引継ぎセッション（追記）

- 対象: `2026-09-20-claude-to-codex-google-search.md`。起点 `a87d7beadae773a072c9e825c794c6cd60c9878f`。
- 本番 `/health` は今回直接取得できた。`ok=true`、missing/weak は空、X/Instagram connected、Runway ready、列挙された database_features はすべて true。過去の取得不能記録は今回の状態とは分ける。
- open incident #369 は 06:03Z の `CANARY_YAHOO_COORDINATOR_UNAVAILABLE`。後続監視 run `35493496647` (06:09Z) は `SEARCH_SLI_OK`、Yahoo/Rakuten/query_structurer は 06:07:44Z の `CANARY_OK`。1回の回復確認であり、3回連続回復条件を代行してIssueを閉じない。
- 新着 Claude→Codex 文書は Google検索引継ぎを確認し、P0生応答診断・方式選択、P1保存導線・外部URL枠・archive を作業対象にした。
- 生応答診断は本番のGoogle資格情報・管理者認証を今回の環境で利用できず未実施。原因を索引不足/綴り揺れと断定しない。
- 実装と承認依頼: `2026-09-20-codex-google-search-progress.md`。

### §6受領による訂正

- `feature/ui-search-v2` の `4f5ec16` / #373 を取り込み、P0-1はユーザー実機と既報集計により切り分け済みとして終了。上記「原因未確定」は§6受領前の記録であり、追加の本番診断は不要。
- 対応対象をブランド手掛かりによる安定した並べ替えへ変更。作業ブランチpush/PR作成・教師データ補完は承認済み。マージ禁止、教師データD1投入は別承認。
