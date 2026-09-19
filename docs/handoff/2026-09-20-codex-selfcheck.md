# 2026-09-20 Codex self-check

- 本番 /health: このセッションの直接取得はネットワーク経路に拒否され未検証。直近 production-monitor #907 の外形契約検査は PASS。
- 自動インシデント #261: 実検索は SEARCH_SLI_OK。GitHub scheduled workflow の長時間遅延による GITHUB_SCHEDULE_HEARTBEAT_STALE だけが検索SLIへ誤分類されていた。
- Claude引継ぎ: #261 と AUTO-REEL #312/#321 を調査。
- 対応: GitHub schedule staleだけを監視制御のadvisoryへ分離し、missing/stuck・検索失敗・Cloudflare heartbeat異常は従来どおりblockingとする。advisoryもreconcile成功後にACKする。
- AUTO-REEL: Cloud Vision FACE_DETECTIONは本人照合非対応で、9/18決定どおりfail-closed。#312/#321は同日workflow更新pushが同じjobを二度QAした重複実行であり、main側workflowのpush起動を停止する。
