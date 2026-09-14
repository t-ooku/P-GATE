# 2026-09-15 Codex self-check

- production-monitor run #851 attempt 3は、Yahoo! deep canaryの安全コード
  `CANARY_PROVIDER_REQUEST_REJECTED`で失敗した。公開契約検査はPASSし、検索本文、
  個人情報、provider応答本文、認証情報は取得・記録していない。
- 現行分類ではYahoo! APIの4xxと、provider応答前の内部request coordinator失敗が
  同じコードになるため、外部API障害と誤認しうる。coordinator失敗を
  `CANARY_YAHOO_COORDINATOR_UNAVAILABLE`へ分離し、引き続き即時incidentとして扱う
  回帰テストを追加した。
- Yahoo! deep canaryは07:37 JSTに`CANARY_OK`へ復旧した。実ユーザーSLIは
  `SEARCH_SLI_OK`だが、直近6時間の完了検索は0件なので実ユーザー動線の復旧証拠とは
  扱わない。Yahoo!公式には9月15日現在、商品検索APIの障害告知は確認できない。
  9月16日の注文API／ストアエディタ保守は対象APIが異なり、今回の直接原因とは判断しない。
- 5分scheduled runの間隔超過は継続している。全回帰CIと本番反映を確認するまで
  Issue #261を復旧扱いにしない。
- 認証情報、課金、権限、本番D1は変更していない。
