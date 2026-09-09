# 2026-09-10 Codex self-check

- 本番契約検査は production-monitor run #783 でPASS。`/health`、重要アセット6件、13モール、Yahoo! native ranking、AI・Knowledge入力検証に異常なし。
- Issue #261: 15分検索サンプル0件、6時間2件中2件が `TURNSTILE_TOKEN_UNAVAILABLE` で縮退。一般利用者経路の回復とtoken未発行の直接原因は未確認。
- run #783 の読取専用KPI集計がD1 APIの15秒タイムアウトで失敗。直前にも同種の一過性失敗があり、読取専用クエリに限定した最大3回の再試行と回帰テストを追加した。
- Claude連絡: 前回確認後の新着なし。認証情報、課金、本番D1は変更していない。
